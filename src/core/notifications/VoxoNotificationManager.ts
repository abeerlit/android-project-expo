import { NativeModules, NativeEventEmitter, Platform } from "react-native";

const { VoxoNotificationsModule } = NativeModules;
// console.log("VoxoNotificationsModule--------", VoxoNotificationsModule);

type NotificationPressCallback = (payload: any) => void;
type ConversationUpdateCallback = (data: { conversationId: string }) => void;
type CallEndedRemotelyCallback = (data: { callUUID: string }) => void;
type SmsNotificationCallback = (data: {
  conversationId: string;
  peerName: string;
  from: string;
  title: string;
  body: string;
  mediaUrls: string[];
  userInfo: any;
}) => void;

class VoxoNotificationManager {
  private eventEmitter: NativeEventEmitter | null = null;
  private listeners: Map<string, () => void> = new Map();

  constructor() {
    if (Platform.OS === "ios" && VoxoNotificationsModule) {
      this.eventEmitter = new NativeEventEmitter(VoxoNotificationsModule);
    }
  }

  /**
   * Sets the conversation ID that the user is currently viewing
   * This helps prevent duplicate notifications for the current conversation
   */
  setViewingConversation(conversationId: string | null): void {
    if (Platform.OS === "ios" && VoxoNotificationsModule) {
      VoxoNotificationsModule.viewingConversation(conversationId);
    }
  }

  /**
   * Adds a listener for VoIP notification press events
   * Returns a function to remove the listener
   * Note: Regular notifications are now handled by Notifee
   */
  addNotificationPressListener(
    callback: NotificationPressCallback
  ): () => void {
    if (Platform.OS !== "ios" || !this.eventEmitter) {
      return () => {}; // No-op for Android
    }

    console.log(
      "📱 [VoxoNotificationManager] Adding notification press listener at:",
      new Date().toISOString()
    );

    const subscription = this.eventEmitter.addListener(
      "onNotificationPressed",
      (payload) => {
        // Add immediate log to confirm event is received
        console.log(
          "🔔 [VoxoNotificationManager] ⚡ Event received from native module:",
          {
            hasPayload: !!payload,
            payloadKeys: payload ? Object.keys(payload) : [],
            hasSendbird: !!payload?.sendbird,
            sendbirdKeys: payload?.sendbird
              ? Object.keys(payload.sendbird)
              : [],
            timestamp: new Date().toISOString()
          }
        );

        // Handle VoIP notifications (those with callUuid or uuid)
        const isVoipNotification = payload.callUuid || payload.uuid;

        // Handle text/SMS notifications (those with conversationId, reference_id, or TEXT-RECEIVED click_action)
        const isTextNotification =
          payload.data?.click_action === "TEXT-RECEIVED" ||
          payload.click_action === "TEXT-RECEIVED" ||
          payload.data?.conversationId ||
          payload.data?.conversation_id ||
          payload.data?.reference_id ||
          payload.data?.referenceId ||
          payload.conversationId ||
          payload.conversation_id ||
          payload.reference_id ||
          payload.referenceId;

        const clickAction = payload.click_action || payload.data?.click_action;
        const channelUrl = payload.channelUrl || payload.data?.channelUrl;
        const hasSendbirdKey =
          "sendbird" in payload || (payload.data && "sendbird" in payload.data);

        const isSendbirdNotification =
          hasSendbirdKey ||
          payload.sendbird !== undefined ||
          payload.data?.sendbird !== undefined ||
          clickAction === "SENDBIRD-RECEIVED" ||
          (channelUrl && clickAction === "SENDBIRD-RECEIVED");

        const isVoicemailNotification =
          clickAction === "VOICEMAIL-EVENT-RECEIVE" ||
          clickAction === "VOICEMAIL-RECEIVED" ||
          clickAction === "voicemail-received" ||
          payload.data?.vm_payload_type === "voicemail" ||
          payload.data?.vm_payload_type === "voicemail_notification";

        const isMissedCallNotification =
          clickAction === "CALL-EVENT-MISSED" ||
          clickAction === "MISSED-CALL" ||
          clickAction === "missed-call" ||
          clickAction === "MISSED-CALL-RECEIVED" ||
          clickAction === "missed_call" ||
          payload.data?.vm_payload_type === "missed_call" ||
          payload.callCancelReason !== undefined ||
          (payload.title &&
            String(payload.title).toLowerCase().includes("missed call")) ||
          (payload.body &&
            String(payload.body).toLowerCase().includes("missed call"));

        // Call callback for VoIP, text, Sendbird, voicemail, and missed call notifications
        if (
          isVoipNotification ||
          isTextNotification ||
          isSendbirdNotification ||
          isVoicemailNotification ||
          isMissedCallNotification
        ) {
          console.log(
            "📱 [VoxoNotificationManager] ✅ Notification press received - allowing through:",
            {
              isVoipNotification,
              isTextNotification,
              isSendbirdNotification,
              isVoicemailNotification,
              isMissedCallNotification,
              type: isVoipNotification
                ? "VoIP"
                : isTextNotification
                ? "Text"
                : isSendbirdNotification
                ? "Sendbird"
                : isVoicemailNotification
                ? "Voicemail"
                : "MissedCall",
              payloadKeys: Object.keys(payload || {}),
              dataKeys: payload?.data ? Object.keys(payload.data) : [],
              hasSendbird: !!payload.sendbird,
              clickAction,
              channelUrl
            }
          );
          callback(payload);
        } else {
          console.warn(
            "📱 [VoxoNotificationManager] ❌ Ignoring notification (not VoIP, text, or Sendbird):",
            {
              payloadKeys: Object.keys(payload || {}),
              dataKeys: payload?.data ? Object.keys(payload.data) : [],
              clickAction,
              channelUrl,
              sendbirdCheck: {
                hasSendbirdKey,
                sendbirdValue: payload?.sendbird || payload?.data?.sendbird,
                sendbirdUndefined:
                  payload?.sendbird === undefined &&
                  payload?.data?.sendbird === undefined
              }
            }
          );
        }
      }
    );

    const removeListener = () => {
      subscription.remove();
    };

    this.listeners.set("notificationPress", removeListener);
    return removeListener;
  }

  /**
   * Adds a listener for conversation update events
   * Returns a function to remove the listener
   */
  addConversationUpdateListener(
    callback: ConversationUpdateCallback
  ): () => void {
    if (Platform.OS !== "ios" || !this.eventEmitter) {
      return () => {}; // No-op for Android
    }

    const subscription = this.eventEmitter.addListener(
      "onConversationUpdated",
      callback
    );

    const removeListener = () => {
      subscription.remove();
    };

    this.listeners.set("conversationUpdate", removeListener);
    return removeListener;
  }

  /**
   * Adds a listener for onCallEndedRemotely (CALL-EVENT-MISSED push).
   * When call ends remotely (caller hung up, etc), native dismisses CallKit and emits this.
   * JS should call VoipBridge.handleCallEnd to clean up call state and UI.
   */
  addCallEndedRemotelyListener(
    callback: CallEndedRemotelyCallback
  ): () => void {
    if (Platform.OS !== "ios" || !this.eventEmitter) {
      return () => {};
    }

    const subscription = this.eventEmitter.addListener(
      "onCallEndedRemotely",
      (data: { callUUID: string }) => {
        console.warn(
          "📞 [VoxoNotificationManager] onCallEndedRemotely received:",
          data?.callUUID
        );
        callback(data);
      }
    );

    const removeListener = () => {
      subscription.remove();
    };

    this.listeners.set("callEndedRemotely", removeListener);
    return removeListener;
  }

  /**
   * Adds a listener for SMS notification received events (for empty body notifications like GIFs)
   * Returns a function to remove the listener
   */
  addSmsNotificationListener(callback: SmsNotificationCallback): () => void {
    if (Platform.OS !== "ios" || !this.eventEmitter) {
      return () => {}; // No-op for Android
    }

    const subscription = this.eventEmitter.addListener(
      "onSMSNotificationReceived",
      callback
    );

    const removeListener = () => {
      subscription.remove();
    };

    this.listeners.set("smsNotification", removeListener);
    return removeListener;
  }

  /**
   * Removes all listeners
   */
  removeAllListeners(): void {
    if (Platform.OS !== "ios" || !this.eventEmitter) {
      return;
    }

    // Remove all individual listeners
    for (const removeListener of this.listeners.values()) {
      removeListener();
    }
    this.listeners.clear();

    // Remove all listeners for specific events
    this.eventEmitter.removeAllListeners("onNotificationPressed");
    this.eventEmitter.removeAllListeners("onConversationUpdated");
    this.eventEmitter.removeAllListeners("onSMSNotificationReceived");
    this.eventEmitter.removeAllListeners("onCallEndedRemotely");
  }
}

// Export as singleton instance
export default new VoxoNotificationManager();
