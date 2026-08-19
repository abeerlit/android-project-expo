const REMOVAL_REASONS = new Set([
  "admin_removed",
  "admin_deleted",
  "channel_operator_removed"
]);

type AdminEventData = {
  reason?: string;
  type?: string;
  event?: string;
};

function parseAdminEventData(
  data?: string | Record<string, unknown> | null
): AdminEventData | null {
  if (!data) return null;

  if (typeof data === "object") {
    return data as AdminEventData;
  }

  if (typeof data !== "string") return null;
  const trimmed = data.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as AdminEventData;
  } catch {
    return null;
  }
}

function isRemovalEvent(
  data?: string | Record<string, unknown> | null,
  customType?: string | null
): boolean {
  const parsed = parseAdminEventData(data);
  const reason = String(parsed?.reason || "").toLowerCase();
  if (REMOVAL_REASONS.has(reason)) return true;

  const dataText =
    typeof data === "string" ? data : data ? JSON.stringify(data) : "";
  const haystack = `${dataText} ${customType || ""}`.toLowerCase();
  return (
    haystack.includes("admin_removed") ||
    haystack.includes("channel_operator_removed")
  );
}

export function formatAdminEventMessage(
  text: string | undefined,
  data?: string | Record<string, unknown> | null,
  customType?: string | null
): string {
  if (!text) return "";
  if (!isRemovalEvent(data, customType)) return text;
  if (/\bremoved\b/i.test(text) && !/\bleft\b/i.test(text)) return text;

  return text
    .replace(/\bremoved\.?\s*$/i, "removed.")
    .replace(/\bremoved\.?\s*$/i, "removed.")
    .replace(/\bremoved\.?\s*$/i, "removed.")
    .replace(/\bleft\.?\s*$/i, "removed.");
}
