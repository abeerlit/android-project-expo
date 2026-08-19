/**
 * JS stub when @notifee/react-native is not linked (notifications phase off).
 * Sendbird local banners no-op; connection and channels still work.
 */

export const AndroidImportance = {
  DEFAULT: 3,
  HIGH: 4,
  LOW: 2,
  MIN: 1,
  NONE: 0
} as const;

export const EventType = {
  DISMISSED: 0,
  PRESS: 1,
  ACTION_PRESS: 2,
  DELIVERED: 3,
  APP_BLOCKED: 4,
  CHANNEL_BLOCKED: 5,
  CHANNEL_GROUP_BLOCKED: 6,
  TRIGGER_NOTIFICATION_CREATED: 7,
  FG_ALREADY_EXIST: 8
} as const;

const notifee = {
  requestPermission: async () => ({ authorizationStatus: 1 }),
  createChannel: async () => "expo-stub",
  displayNotification: async () => "expo-stub",
  cancelNotification: async () => {},
  setBadgeCount: async () => {},
  getBadgeCount: async () => 0,
  onForegroundEvent: () => () => {},
  onBackgroundEvent: () => () => {}
};

export default notifee;
