/**
 * No-op VoIP push when RNVoipPushNotificationManager is not linked.
 */
const RNVoipPushRemoteNotificationsRegisteredEvent =
  "RNVoipPushRemoteNotificationsRegisteredEvent";
const RNVoipPushRemoteNotificationReceivedEvent =
  "RNVoipPushRemoteNotificationReceivedEvent";
const RNVoipPushDidLoadWithEvents = "RNVoipPushDidLoadWithEvents";

export default class RNVoipPushNotification {
  static get RNVoipPushRemoteNotificationsRegisteredEvent() {
    return RNVoipPushRemoteNotificationsRegisteredEvent;
  }
  static get RNVoipPushRemoteNotificationReceivedEvent() {
    return RNVoipPushRemoteNotificationReceivedEvent;
  }
  static get RNVoipPushDidLoadWithEvents() {
    return RNVoipPushDidLoadWithEvents;
  }
  static addEventListener(_event: string, _handler: (...args: unknown[]) => void) {
    return { remove: noop };
  }
  static removeEventListener() {}
  static registerVoipToken() {}
}

function noop() {}
