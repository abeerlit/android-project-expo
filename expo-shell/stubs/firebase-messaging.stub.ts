/**
 * Expo shell stub when @react-native-firebase/messaging is not linked.
 * Routes notification permission prompts through react-native-permissions (Podfile handlers).
 */
import {
  checkNotifications,
  requestNotifications,
  RESULTS
} from "react-native-permissions";

const AuthorizationStatus = {
  NOT_DETERMINED: -1,
  DENIED: 0,
  AUTHORIZED: 1,
  PROVISIONAL: 2
} as const;

function mapNotificationStatus(status: string): number {
  if (status === RESULTS.GRANTED || status === RESULTS.LIMITED) {
    return AuthorizationStatus.AUTHORIZED;
  }
  if (status === RESULTS.DENIED || status === RESULTS.BLOCKED) {
    return AuthorizationStatus.DENIED;
  }
  return AuthorizationStatus.NOT_DETERMINED;
}

async function resolveNotificationAuthStatus(): Promise<number> {
  const checked = await checkNotifications();
  if (checked.status === RESULTS.GRANTED || checked.status === RESULTS.LIMITED) {
    return mapNotificationStatus(checked.status);
  }
  const requested = await requestNotifications(["alert", "badge", "sound"]);
  return mapNotificationStatus(requested.status);
}

function messaging() {
  return {
    requestPermission: resolveNotificationAuthStatus,
    getAPNSToken: async () => null,
    getToken: async () => {
      throw Object.assign(new Error("Firebase messaging disabled in Expo shell"), {
        code: "messaging/unknown"
      });
    },
    onTokenRefresh: (_handler: (token: string) => void) => () => {},
    AuthorizationStatus
  };
}

messaging.AuthorizationStatus = AuthorizationStatus;

export default messaging;
