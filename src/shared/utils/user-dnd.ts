/**
 * Normalize DND from API / persisted user to the flags the app uses ("1" = ignore all calls).
 * Matches web usage of extDND / userData.dnd (boolean-ish and "on").
 */
export function normalizeUserDnd(raw: unknown): "0" | "1" {
  if (raw === true || raw === 1 || raw === "1" || raw === "on") {
    return "1";
  }
  return "0";
}

export function isDndEnabled(raw: unknown): boolean {
  return normalizeUserDnd(raw) === "1";
}
