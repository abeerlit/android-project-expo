/** True when sip.js Registerer was disposed/terminated (safe to ignore, must not crash the app). */
export function isRegistererTerminatedError(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof (error as { message?: string })?.message === "string"
          ? (error as { message: string }).message
          : "";
  const normalized = message.toLowerCase();
  return (
    normalized.includes("registerer terminated") ||
    normalized.includes("registerer is in 'terminated' state") ||
    normalized.includes("unable to register")
  );
}
