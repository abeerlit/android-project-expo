/** Gate verbose chat/channel diagnostics — off in production builds. */
export const CHAT_DEV_LOG = __DEV__;

export function chatDevWarn(...args: unknown[]): void {
  if (CHAT_DEV_LOG) {
    console.warn(...args);
  }
}

export function chatDevLog(...args: unknown[]): void {
  if (CHAT_DEV_LOG) {
    console.log(...args);
  }
}
