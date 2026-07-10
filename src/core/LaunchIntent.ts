/**
 * Stores launch intent from native (e.g. when app opened from Answer on CallKeep in kill state).
 * MainActivity passes launchFromAnswer + callUuid + callerName + callerNumber via getLaunchOptions; App stores them here.
 */
let launchIntent: {
  launchFromAnswer?: boolean;
  callUuid?: string;
  callerName?: string;
  callerNumber?: string;
} | null = null;

export function setLaunchIntent(
  props: Record<string, unknown> | null | undefined
): void {
  if (props?.launchFromAnswer && typeof props?.callUuid === "string") {
    launchIntent = {
      launchFromAnswer: true,
      callUuid: props.callUuid as string,
      callerName:
        typeof props.callerName === "string" ? props.callerName : undefined,
      callerNumber:
        typeof props.callerNumber === "string" ? props.callerNumber : undefined
    };
  }
}

export function getAndClearLaunchIntent(): {
  launchFromAnswer: boolean;
  callUuid: string;
  callerName?: string;
  callerNumber?: string;
} | null {
  const result = launchIntent;
  launchIntent = null;
  return result;
}
