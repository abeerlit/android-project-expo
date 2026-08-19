/** Boot-time tracing for Hermes stack debugging. Off unless EXPO_PUBLIC_DEBUG_BOOT=1. */
const ENABLED =
  process.env.EXPO_PUBLIC_DEBUG_BOOT === "1" ||
  process.env.EXPO_PUBLIC_DEBUG_BOOT === "true";

export function debugLog(
  _hypothesisId: string,
  _location: string,
  _message: string,
  _data: Record<string, unknown> = {}
): void {
  if (!ENABLED) {
    return;
  }
  console.warn(`[DBG ${_hypothesisId}] ${_message}`, JSON.stringify(_data));
}
