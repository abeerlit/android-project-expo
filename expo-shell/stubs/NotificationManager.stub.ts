/**
 * Expo dev shell: avoids loading CallKeep / VoIP / FCM at import time.
 * Remove babel/metro alias when EXPO_PUBLIC_NATIVE_NOTIFICATIONS=1 and native is wired.
 */

export type NotificationToken = {
  token: string;
  tokenType: "android_fcm" | "ios_remote_notifications" | "ios_voip";
  timestamp: number;
};

export type VoipCallData = {
  callUuid: string;
  callerName: string;
  callerNumber: string;
  payload: unknown;
};

export type NotificationManagerCallbacks = {
  onTokenReceived?: (token: NotificationToken) => void;
  onNotification?: (remoteMessage: unknown) => void;
  onNotificationPressed?: (payload: unknown) => void;
  onConversationUpdated?: (data: { conversationId: string }) => void;
  onVoipCallReceived?: (callData: VoipCallData) => void;
  onSendbirdMessageReceived?: (channelUrl: string, unreadCount?: number) => void;
  onFetchSendbirdMessage?: (
    channelUrl: string,
    messageId: string
  ) => Promise<unknown>;
};

class NotificationManagerStub {
  private callbacks?: NotificationManagerCallbacks;

  async initialize(callbacks: NotificationManagerCallbacks): Promise<void> {
    this.callbacks = callbacks;
  }

  destroy(): void {
    this.callbacks = undefined;
  }

  async setBadgeCount(_count: number): Promise<void> {}

  async clearBadge(): Promise<void> {}

  setViewingConversation(_conversationId: string | null): void {}
}

export default new NotificationManagerStub();
