import { navigationRef } from "./Ref.ts";

const DEFAULT_MAX_WAIT_MS = 4000;
const POLL_MS = 16;

/**
 * Run once when the root navigator is ready — no 250ms polling delay.
 */
export function whenNavigationReady(
  fn: () => void,
  maxWaitMs: number = DEFAULT_MAX_WAIT_MS
): void {
  if (navigationRef.isReady()) {
    fn();
    return;
  }

  const start = Date.now();
  const tryRun = () => {
    if (navigationRef.isReady()) {
      fn();
      return;
    }
    if (Date.now() - start >= maxWaitMs) {
      return;
    }
    setTimeout(tryRun, POLL_MS);
  };
  setTimeout(tryRun, 0);
}
