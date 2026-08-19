import { createMMKV } from "react-native-mmkv";
import ReactNativeBlobUtil from "react-native-blob-util";
import { Platform } from "react-native";
import { ChatMessage } from "../types.ts";

export type ChatMediaVariant = "preview" | "full";

const indexStorage = createMMKV({
  id: "sendbird-chat-media-index"
});

const MAX_CACHE_BYTES = 200 * 1024 * 1024;
const INDEX_KEY = "entries";
const MIGRATION_VERSION_KEY = "migrationVersion";
/** Bump when cache index schema / cleanup rules change. */
const MIGRATION_VERSION = 3;
export const MIN_VALID_IMAGE_BYTES = 128;

interface MediaIndexEntry {
  cacheKey: string;
  messageId: number;
  fileIndex: number;
  variant: ChatMediaVariant;
  localPath: string;
  cachedAt: number;
  byteSize: number;
}

type MediaIndex = Record<string, MediaIndexEntry>;

const inFlight = new Map<string, Promise<string>>();

function buildAuthHeaders(authToken?: string): Record<string, string> {
  if (!authToken) return {};
  return { Authorization: `Bearer ${authToken}` };
}

function cacheKeyFor(
  messageId: number,
  fileIndex: number,
  variant: ChatMediaVariant
): string {
  return `${messageId}_${fileIndex}_${variant}`;
}

function mediaDir(): string {
  return `${ReactNativeBlobUtil.fs.dirs.CacheDir}/chat-media`;
}

function localPathFor(
  messageId: number,
  fileIndex: number,
  variant: ChatMediaVariant,
  remoteUrl: string
): string {
  const ext = extensionFromUrl(remoteUrl);
  return `${mediaDir()}/${messageId}_${fileIndex}_${variant}${ext}`;
}

function extensionFromUrl(url: string): string {
  try {
    const withoutQuery = url.split("?")[0] || "";
    const match = withoutQuery.match(/(\.[a-z0-9]{2,8})$/i);
    return match?.[1]?.toLowerCase() || ".jpg";
  } catch {
    return ".jpg";
  }
}

function toFileUri(path: string): string {
  if (path.startsWith("file://")) return path;
  return Platform.OS === "android" ? `file://${path}` : path;
}

function stripFileScheme(uriOrPath: string): string {
  return uriOrPath.replace(/^file:\/\//, "");
}

function isInvalidImageContentType(contentType: string): boolean {
  const normalized = (contentType || "").toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("text/html") ||
    normalized.includes("application/json") ||
    normalized.includes("text/plain") ||
    normalized.includes("application/xml") ||
    normalized.includes("text/xml")
  );
}

function readIndex(): MediaIndex {
  try {
    const raw = indexStorage.getString(INDEX_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as MediaIndex;
  } catch {
    return {};
  }
}

function writeIndex(index: MediaIndex): void {
  indexStorage.set(INDEX_KEY, JSON.stringify(index));
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return await ReactNativeBlobUtil.fs.exists(stripFileScheme(path));
  } catch {
    return false;
  }
}

async function getFileSize(path: string): Promise<number> {
  try {
    const stat = await ReactNativeBlobUtil.fs.stat(stripFileScheme(path));
    return Number(stat.size) || 0;
  } catch {
    return 0;
  }
}

async function unlinkPath(path: string): Promise<void> {
  try {
    const p = stripFileScheme(path);
    if (await fileExists(p)) {
      await ReactNativeBlobUtil.fs.unlink(p);
    }
  } catch {
    /* ignore */
  }
}

async function evictIfNeeded(): Promise<void> {
  const index = readIndex();
  const entries = Object.values(index);
  let total = entries.reduce((sum, e) => sum + (e.byteSize || 0), 0);
  if (total <= MAX_CACHE_BYTES) return;

  entries.sort((a, b) => a.cachedAt - b.cachedAt);
  for (const entry of entries) {
    if (total <= MAX_CACHE_BYTES) break;
    await unlinkPath(entry.localPath);
    delete index[entry.cacheKey];
    total -= entry.byteSize || 0;
  }
  writeIndex(index);
}

/** Remove index entries whose on-disk file is missing or too small (401 error bodies). */
export async function sanitizeChatMediaCache(): Promise<void> {
  const index = readIndex();
  let removed = 0;

  for (const [key, entry] of Object.entries(index)) {
    const exists = await fileExists(entry.localPath);
    const onDiskSize = exists ? await getFileSize(entry.localPath) : 0;
    const tooSmall =
      !exists ||
      onDiskSize < MIN_VALID_IMAGE_BYTES ||
      (entry.byteSize || 0) < MIN_VALID_IMAGE_BYTES;

    if (tooSmall) {
      await unlinkPath(entry.localPath);
      delete index[key];
      removed += 1;
    }
  }

  if (removed > 0) {
    writeIndex(index);
  }
}

export async function runChatMediaCacheMigration(): Promise<void> {
  const currentVersion = indexStorage.getNumber(MIGRATION_VERSION_KEY) ?? 0;
  if (currentVersion >= MIGRATION_VERSION) {
    return;
  }

  const index = readIndex();

  for (const [key, entry] of Object.entries(index)) {
    const isPreview =
      entry.variant === "preview" || key.endsWith("_preview");
    const missing = !(await fileExists(entry.localPath));
    const onDiskSize = missing ? 0 : await getFileSize(entry.localPath);
    const tooSmall =
      (entry.byteSize || 0) < MIN_VALID_IMAGE_BYTES ||
      onDiskSize < MIN_VALID_IMAGE_BYTES;

    if (isPreview || missing || tooSmall) {
      await unlinkPath(entry.localPath);
      delete index[key];
    }
  }

  writeIndex(index);
  indexStorage.set(MIGRATION_VERSION_KEY, MIGRATION_VERSION);
}

export function getLocalUri(
  messageId: number,
  fileIndex: number,
  variant: ChatMediaVariant
): string | null {
  if (!messageId) return null;
  const key = cacheKeyFor(messageId, fileIndex, variant);
  const entry = readIndex()[key];
  if (!entry?.localPath) return null;
  return toFileUri(entry.localPath);
}

export async function invalidateCachedMedia(
  messageId: number,
  fileIndex: number,
  variant: ChatMediaVariant
): Promise<void> {
  const key = cacheKeyFor(messageId, fileIndex, variant);
  const index = readIndex();
  const entry = index[key];
  if (!entry) return;
  await unlinkPath(entry.localPath);
  delete index[key];
  writeIndex(index);
}

export async function getLocalUriAsync(
  messageId: number,
  fileIndex: number,
  variant: ChatMediaVariant
): Promise<string | null> {
  const key = cacheKeyFor(messageId, fileIndex, variant);
  const uri = getLocalUri(messageId, fileIndex, variant);
  if (!uri) {
    return null;
  }

  const path = stripFileScheme(uri);
  if (await fileExists(path)) {
    const byteSize = await getFileSize(path);
    if (byteSize < MIN_VALID_IMAGE_BYTES) {
      await invalidateCachedMedia(messageId, fileIndex, variant);
      return null;
    }
    return uri;
  }

  const index = readIndex();
  delete index[key];
  writeIndex(index);
  return null;
}

export async function ensureCached(
  remoteUrl: string,
  messageId: number,
  fileIndex: number,
  variant: ChatMediaVariant,
  authToken?: string
): Promise<string> {
  if (!remoteUrl?.trim() || !messageId) {
    throw new Error("Invalid chat media cache params");
  }

  const key = cacheKeyFor(messageId, fileIndex, variant);
  const existing = await getLocalUriAsync(messageId, fileIndex, variant);
  if (existing) return existing;

  const pending = inFlight.get(key);
  if (pending) {
    return pending;
  }

  const task = (async () => {
    const intendedPath = localPathFor(messageId, fileIndex, variant, remoteUrl);
    await ReactNativeBlobUtil.fs.mkdir(mediaDir()).catch(() => {});

    const res = await ReactNativeBlobUtil.config({
      fileCache: true,
      path: intendedPath
    }).fetch("GET", remoteUrl, buildAuthHeaders(authToken));

    const downloadedPath = res.path();
    const responseInfo = (res.info?.() || {}) as {
      status?: number;
      headers?: Record<string, string | undefined>;
    };
    const statusCode = Number(responseInfo.status || 0);
    const contentType = String(
      responseInfo.headers?.["content-type"] ||
        responseInfo.headers?.["Content-Type"] ||
        ""
    );

    if (statusCode >= 400) {
      await unlinkPath(downloadedPath);
      throw new Error(`Chat media download failed with status ${statusCode}`);
    }

    if (isInvalidImageContentType(contentType)) {
      await unlinkPath(downloadedPath);
      throw new Error(`Chat media invalid content-type: ${contentType}`);
    }

    const byteSize = await getFileSize(downloadedPath);
    if (byteSize < MIN_VALID_IMAGE_BYTES) {
      await unlinkPath(downloadedPath);
      throw new Error("Chat media download is empty or too small");
    }

    const storedPath = stripFileScheme(downloadedPath);

    const index = readIndex();
    index[key] = {
      cacheKey: key,
      messageId,
      fileIndex,
      variant,
      localPath: storedPath,
      cachedAt: Date.now(),
      byteSize
    };
    writeIndex(index);
    await evictIfNeeded();

    return toFileUri(storedPath);
  })();

  inFlight.set(key, task);
  try {
    return await task;
  } finally {
    inFlight.delete(key);
  }
}

export type ChatMediaRef = {
  messageId: number;
  fileIndex: number;
  remoteUrl: string;
  variant: ChatMediaVariant;
};

export function collectImageRefsFromMessages(
  messages: ChatMessage[],
  variant: ChatMediaVariant = "full"
): ChatMediaRef[] {
  const refs: ChatMediaRef[] = [];
  for (const msg of messages) {
    const anyMsg = msg as Record<string, unknown>;
    const messageId = Number(anyMsg.messageId);
    if (!messageId) continue;

    if (anyMsg.messageType === "file" || anyMsg.isFileMessage?.()) {
      const type = String(anyMsg.type || "");
      if (!type.startsWith("image/")) continue;
      const remoteUrl = String(anyMsg.url || anyMsg.plainUrl || "");
      if (!remoteUrl) continue;
      refs.push({ messageId, fileIndex: 0, remoteUrl, variant });
      continue;
    }

    if (
      anyMsg.messageType === "multiple_files" ||
      anyMsg.isMultipleFilesMessage?.()
    ) {
      const list = anyMsg.fileInfoList as
        | Array<{ url?: string; plainUrl?: string; mimeType?: string }>
        | undefined;
      if (!Array.isArray(list)) continue;
      list.forEach((fileInfo, fileIndex) => {
        if (!fileInfo.mimeType?.startsWith("image/")) return;
        const remoteUrl = fileInfo.url || fileInfo.plainUrl || "";
        if (!remoteUrl) return;
        refs.push({ messageId, fileIndex, remoteUrl, variant });
      });
    }
  }
  return refs;
}

export function preloadMessageImages(
  messages: ChatMessage[],
  authToken?: string,
  variant: ChatMediaVariant = "full"
): void {
  const refs = collectImageRefsFromMessages(messages, variant);
  if (refs.length === 0) return;

  void (async () => {
    for (const ref of refs) {
      const hit = await getLocalUriAsync(
        ref.messageId,
        ref.fileIndex,
        ref.variant
      );
      if (hit) continue;
      try {
        await ensureCached(
          ref.remoteUrl,
          ref.messageId,
          ref.fileIndex,
          ref.variant,
          authToken
        );
      } catch {
        /* best-effort preload */
      }
    }
  })();
}
