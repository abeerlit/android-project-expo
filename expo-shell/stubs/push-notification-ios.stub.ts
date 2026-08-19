/**
 * Minimal @react-native-community/push-notification-ios stub (badge only).
 */
const PushNotificationIOS = {
  setApplicationIconBadgeNumber: (_count: number) => {},
  getApplicationIconBadgeNumber: (callback: (count: number) => void) => {
    callback(0);
  }
};

export default PushNotificationIOS;
