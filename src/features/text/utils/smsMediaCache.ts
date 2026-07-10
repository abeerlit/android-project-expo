import { MMKV } from "react-native-mmkv";
import ReactNativeBlobUtil from "react-native-blob-util";
import { Platform } from "react-native";
import { TextMessage } from "shared/api/messaging/types.ts";

export type SmsMediaVariant = "preview" | "full";

const indexStorage = new MMKV({
  id: "sms-chat-media-index"
});

const MAX_CACHE_BYTES = 200 * 1024 * 1024;
const INDEX_KEY = "entries";
const MIGRATION_VERSION_KEY = "migrationVersion";
const MIGRATION_VERSION = 1;
export const MIN_VALID_IMAGE_BYTES = 128;

interface MediaIndexEntry {
  cacheKey: string;
  messageId: number;
  fileIndex: number;
  variant: SmsMediaVariant;
  localPath: string;
  cachedAt: number;
  byteSize: number;
}

type MediaIndex = Record<string, MediaIndexEntry>;

const inFlight = new Map<string, Promise<string>>();

function cacheKeyFor(
  messageId: number,
  fileIndex: number,
  variant: SmsMediaVariant
): string {
  return `${messageId}_${fileIndex}_${variant}`;
}

function mediaDir(): string {
  return `${ReactNativeBlobUtil.fs.dirs.CacheDir}/sms-media`;
}

function localPathFor(
  messageId: number,
  fileIndex: number,
  variant: SmsMediaVariant,
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
  return Platform.OS === "android" ? `file://${path}` : `file://${path}`;
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

function isDocumentUrl(url: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  const documentExtensions = [
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".csv",
    ".zip",
    ".rar"
  ];
  return documentExtensions.some((ext) => lowerUrl.includes(ext));
}

function isVideoUrl(url: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  const videoExtensions = [
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".m4v",
    ".webm",
    ".3gp"
  ];
  if (videoExtensions.some((ext) => lowerUrl.includes(ext))) return true;
  if (
    lowerUrl.includes("video/") ||
    lowerUrl.includes("/video/") ||
    lowerUrl.includes("videos/")
  ) {
    return true;
  }
  return (
    lowerUrl.includes("video/mp4") ||
    lowerUrl.includes("video%2Fmp4") ||
    lowerUrl.includes("type=video")
  );
}

export function isSmsImageUrl(url: string): boolean {
  if (!url?.trim()) return false;
  return !isDocumentUrl(url) && !isVideoUrl(url);
}

export function isSmsGifUrl(url: string): boolean {
  if (!url?.trim()) return false;
  const lower = url.toLowerCase();
  const path = lower.split("?")[0] || "";
  if (path.endsWith(".gif") || path.includes(".gif.")) return true;
  if (lower.includes("giphy.com") || lower.includes("format=gif")) return true;
  return false;
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

export async function sanitizeSmsMediaCache(): Promise<void> {
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

export async function runSmsMediaCacheMigration(): Promise<void> {
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

export async function invalidateCachedSmsMedia(
  messageId: number,
  fileIndex: number,
  variant: SmsMediaVariant
): Promise<void> {
  const key = cacheKeyFor(messageId, fileIndex, variant);
  const index = readIndex();
  const entry = index[key];
  if (!entry) return;
  await unlinkPath(entry.localPath);
  delete index[key];
  writeIndex(index);
}

export async function getLocalSmsUriAsync(
  messageId: number,
  fileIndex: number,
  variant: SmsMediaVariant
): Promise<string | null> {
  const key = cacheKeyFor(messageId, fileIndex, variant);
  if (!messageId) return null;

  const entry = readIndex()[key];
  if (!entry?.localPath) return null;

  const uri = toFileUri(entry.localPath);
  const path = stripFileScheme(uri);
  if (await fileExists(path)) {
    const byteSize = await getFileSize(path);
    if (byteSize < MIN_VALID_IMAGE_BYTES) {
      await invalidateCachedSmsMedia(messageId, fileIndex, variant);
      return null;
    }
    return uri;
  }

  const index = readIndex();
  delete index[key];
  writeIndex(index);
  return null;
}

export async function ensureSmsCached(
  remoteUrl: string,
  messageId: number,
  fileIndex: number,
  variant: SmsMediaVariant
): Promise<string> {
  if (!remoteUrl?.trim() || !messageId) {
    throw new Error("Invalid SMS media cache params");
  }

  const key = cacheKeyFor(messageId, fileIndex, variant);
  const existing = await getLocalSmsUriAsync(messageId, fileIndex, variant);
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
    }).fetch("GET", remoteUrl);

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
      throw new Error(`SMS media download failed with status ${statusCode}`);
    }

    if (isInvalidImageContentType(contentType)) {
      await unlinkPath(downloadedPath);
      throw new Error(`SMS media invalid content-type: ${contentType}`);
    }

    const byteSize = await getFileSize(downloadedPath);
    if (byteSize < MIN_VALID_IMAGE_BYTES) {
      await unlinkPath(downloadedPath);
      throw new Error("SMS media download is empty or too small");
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

export type SmsMediaRef = {
  messageId: number;
  fileIndex: number;
  remoteUrl: string;
  variant: SmsMediaVariant;
};

export function collectImageRefsFromTextMessages(
  messages: TextMessage[],
  variant: SmsMediaVariant = "full"
): SmsMediaRef[] {
  const refs: SmsMediaRef[] = [];
  for (const msg of messages) {
    const messageId = msg.id;
    if (!messageId || !msg.mediaUrls?.length) continue;

    msg.mediaUrls.forEach((remoteUrl, fileIndex) => {
      if (!isSmsImageUrl(remoteUrl)) return;
      refs.push({ messageId, fileIndex, remoteUrl, variant });
    });
  }
  return refs;
}

export function preloadSmsMessageImages(
  messages: TextMessage[],
  variant: SmsMediaVariant = "full"
): void {
  const refs = collectImageRefsFromTextMessages(messages, variant);
  if (refs.length === 0) return;

  void (async () => {
    for (const ref of refs) {
      const hit = await getLocalSmsUriAsync(
        ref.messageId,
        ref.fileIndex,
        ref.variant
      );
      if (hit) continue;
      try {
        await ensureSmsCached(
          ref.remoteUrl,
          ref.messageId,
          ref.fileIndex,
          ref.variant
        );
      } catch {
        /* best-effort preload */
      }
    }
  })();
}
