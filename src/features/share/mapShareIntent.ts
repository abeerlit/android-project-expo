import type { ShareIntent } from "expo-share-intent";
import type { SharedMediaItem } from "core/navigation/types/types.ts";

const isSupportedMime = (mimeType: string | undefined | null): boolean => {
  if (!mimeType) return false;
  return mimeType.startsWith("image/") || mimeType.startsWith("video/");
};

/**
 * Maps expo-share-intent payload to our SharedMediaItem list.
 * Drops unsupported MIME types and files without a usable path.
 */
export function mapShareIntentToMedia(
  shareIntent: ShareIntent | null | undefined
): SharedMediaItem[] {
  if (!shareIntent?.files?.length) return [];

  const items: SharedMediaItem[] = [];
  for (const file of shareIntent.files) {
    const mimeType = file.mimeType || "";
    if (!isSupportedMime(mimeType)) continue;
    const uri = file.path?.trim();
    if (!uri) continue;
    items.push({
      uri,
      mimeType,
      fileName: file.fileName || `shared_${Date.now()}`,
      fileSize: file.size ?? null
    });
  }
  return items;
}
