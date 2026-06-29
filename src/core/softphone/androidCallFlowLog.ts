import * as Sentry from "@sentry/react-native";
import { Platform } from "react-native";

export const ANDROID_CALLFLOW_SUBSYSTEM = "VOXO_ANDROID_CALLFLOW";

function safePayload(data?: Record<string, unknown>): string {
  if (!data) return "";
  try {
    return ` | ${JSON.stringify(data)}`;
  } catch {
    return " | [payload stringify failed]";
  }
}

function toSerializable(
  data?: Record<string, unknown>
): Record<string, string | number | boolean | null> {
  if (!data) return {};
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(data)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value == null
    ) {
      out[key] = value as string | number | boolean | null;
    } else {
      try {
        out[key] = JSON.stringify(value);
      } catch {
        out[key] = "[unserializable]";
      }
    }
  }
  return out;
}

export function androidCallFlowLog(
  area: string,
  message: string,
  data?: Record<string, unknown>
): void {
  if (Platform.OS !== "android") {
    return;
  }

  const ts = new Date().toISOString();
  const serialized = toSerializable(data);
  console.warn(
    `${ANDROID_CALLFLOW_SUBSYSTEM} ${ts} [${area}] ${message}${safePayload(data)}`
  );

  Sentry.addBreadcrumb({
    category: "voxo.callflow.android",
    level: "info",
    message: `[${area}] ${message}`,
    data: serialized
  });

  Sentry.captureMessage(`VOXO_ANDROID_CALLFLOW [${area}] ${message}`, "info");
}

export function androidCallFlowError(
  area: string,
  message: string,
  error: unknown,
  data?: Record<string, unknown>
): void {
  if (Platform.OS !== "android") {
    return;
  }

  const err = error instanceof Error ? error : new Error(String(error));
  const merged = {
    ...(data || {}),
    errorMessage: err.message,
    errorName: err.name
  };

  androidCallFlowLog(area, `${message} (error)`, merged);
  Sentry.withScope((scope) => {
    scope.setTag("callflow", "android");
    scope.setTag("callflow_area", area);
    scope.setContext("callflow", toSerializable(merged));
    Sentry.captureException(err);
  });
}
