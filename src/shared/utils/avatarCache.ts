/**
 * Avatar image cache-busting: use per-contact/media keys instead of a global
 * directory timestamp so one contact update does not invalidate every avatar URL.
 */

function hashString(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Stable key from avatar path fields. Changes only when those values change.
 */
export function avatarMediaCacheKey(
  primary?: string | null,
  secondary?: string | null
): string {
  const p = (primary ?? "").trim();
  const s = (secondary ?? "").trim();
  if (!p && !s) return "0";
  return hashString(`${p}|${s}`);
}

export function appendAvatarCacheBust(
  uri: string | null | undefined,
  cacheKey: string
): string {
  if (!uri?.trim()) return uri ?? "";
  const v = encodeURIComponent(cacheKey);
  return `${uri}${uri.includes("?") ? "&" : "?"}v=${v}`;
}

/**
 * Current user's profile image: bust when path or profileMediaVersion changes.
 */
export function appendSelfAvatarCacheBust(
  uri: string | null | undefined,
  avatarPath: string | null | undefined,
  profileMediaVersion: number
): string {
  if (!uri?.trim()) return uri ?? "";
  const key = avatarMediaCacheKey(avatarPath, String(profileMediaVersion));
  return appendAvatarCacheBust(uri, key);
}
