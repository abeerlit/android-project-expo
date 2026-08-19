import { Platform } from "react-native";

const LOG_TAG = "VOIP-PUSH-ANDROID";

/** Android incoming-call / VoIP wake uses FCM — log token at registration boundaries. */
export function logAndroidVoipPushToken(
  stage: string,
  token: string,
  extras?: Record<string, unknown>
): void {
  if (Platform.OS !== "android" || !token) return;
  console.warn(`📞 [${LOG_TAG}] ${stage}`, {
    tokenLength: token.length,
    token,
    ...extras
  });
}
