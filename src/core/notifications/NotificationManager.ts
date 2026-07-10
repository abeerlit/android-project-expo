import messaging from "@react-native-firebase/messaging";
import { AppState, NativeModules, Platform } from "react-native";
import CallKeep from "react-native-callkeep";
import { USE_SLIMSIP_INBOUND_ONLY } from "../config/callApproach";
import VoipPushNotification from "react-native-voip-push-notification";
import VoxoNotificationManager from "./VoxoNotificationManager";
import notifee, { AndroidImportance, EventType } from "@notifee/react-native";
import { VoipBridge } from "../softphone/VoipBridge";
import {
  SlimSipClient,
  SipClientSettings
} from "../softphone/jssip/SlimSipClient";
import { store, rehydratePromise } from "../../store/global-store";
import PushNotificationIOS from "@react-native-community/push-notification-ios";
import {
  navigateOrReplace,
  getCurrentRoute,
  navigationRef
} from "../navigation/utils/Ref";
import { CommonActions } from "@react-navigation/native";
import { emitNavigateToMissedTab } from "../navigation/utils/MissedCallNavEvent.ts";
import { emitNavigateToVoicemailTab } from "../navigation/utils/VoicemailNavEvent.ts";
import { Routes } from "../navigation/types/types";
import { handleTextNotification } from "./TextNotificationHandler";
import { areSmsNotificationsEnabled } from "./smsNotificationPrefs.ts";
import { handleAndroidSmsFcm } from "./androidSmsFcmDisplay.ts";
import { resolveSmsSenderDisplayName } from "./resolveSmsSenderDisplayName.ts";
import { getMessagesForConversation } from "../../shared/api/messaging/methods.ts";
import PendingCallManager from "./PendingCallManager";
import {
  dismissStaleAndroidVoipCall,
  shouldSkipStaleVoipPush
} from "./voipPushStaleCheck.ts";
import { logAndroidVoipPushToken } from "./androidVoipPushTokenLog.ts";

export type NotificationToken = {
  token: string;
  tokenType: "android_fcm" | "ios_remote_notifications" | "ios_voip";
  timestamp: number;
};

export type VoipCallData = {
  callUuid: string;
  callerName: string;
  callerNumber: string;
  payload: any;
};

export type NotificationManagerCallbacks = {
  onTokenReceived?: (token: NotificationToken) => void;
  onNotification?: (remoteMessage: any) => void;
  onNotificationPressed?: (payload: any) => void;
  onConversationUpdated?: (data: { conversationId: string }) => void;
  onVoipCallReceived?: (callData: VoipCallData) => void;
  onSendbirdMessageReceived?: (
    channelUrl: string,
    unreadCount?: number
  ) => void;
  onFetchSendbirdMessage?: (
    channelUrl: string,
    messageId: string
  ) => Promise<any>;
};

export type NotificationManagerInitializeOptions = {
  /**
   * Android: defer Firebase/Notifee permission dialogs until Home onboarding runs
   * (avoids showing notifications twice and blocking the permission chain).
   */
  deferPermissionRequest?: boolean;
};

const getSuppressedCallKeepEndSet = (): Set<string> => {
  const g = global as any;
  if (!g.__voxoSuppressCallKeepEndUuids) {
    g.__voxoSuppressCallKeepEndUuids = new Set<string>();
  }
  return g.__voxoSuppressCallKeepEndUuids as Set<string>;
};

class NotificationManager {
  private callbacks?: NotificationManagerCallbacks;
  private displayedNotifications: Set<string> = new Set();
  private processedSendbirdMessages: Set<string> = new Set();
  private readonly NOTIFICATION_CACHE_SIZE = 50;
  private voipToken: string | null = null;
  private androidChannelId: string = "voxo-notifications";
  private isDestroyed: boolean = false;

  async initialize(
    callbacks: NotificationManagerCallbacks,
    options?: NotificationManagerInitializeOptions
  ) {
    this.isDestroyed = false;
    this.callbacks = callbacks;
    const deferPermissionRequest =
      options?.deferPermissionRequest === true && Platform.OS === "android";
    if (!deferPermissionRequest) {
      await this.requestPermissions();
    }
    await this.getPushToken();

    // Set up Notifee event listeners (same for both platforms)
    this.setupNotifeeListeners();

    if (Platform.OS === "ios") {
      this.registerForVoipToken();
      this.setupVoipPushListeners();
      this.setupNativeNotificationListeners();
    } else if (Platform.OS === "android") {
      await this.createAndroidNotificationChannel();
      // Set up Android-specific notification handlers
      this.setupAndroidNotificationHandlers();
    }

    this.listenForTokenRefresh();
    this.listenForNotifications();
  }

  /**
   * Centralized notification press handler
   * Handles navigation for all notification types
   * Uses replace() to ensure navigation works even when already on a chat/thread screen
   */
  /**
   * Navigate to chat with retry logic
   * This is needed when app is launching from background/killed state
   */
  private navigateToChatWithRetry(
    conversationId: number,
    attempt: number = 0
  ): void {
    const maxAttempts = 20; // Keep high for reliability
    const delay = 200; // Reduced from 250ms to 200ms for faster checks

    if (attempt >= maxAttempts) {
      console.error(
        "❌ [NotificationManager] Failed to navigate to chat after",
        maxAttempts,
        "attempts"
      );
      return;
    }

    // Check if navigation is ready
    const currentRoute = getCurrentRoute();
    if (currentRoute) {
      // Navigation is ready, navigate now
      console.log(
        "✅ [NotificationManager] Navigation ready, navigating to chat:",
        conversationId,
        "attempt:",
        attempt + 1
      );
      navigateOrReplace(Routes.Chat, { conversationId } as any);
    } else {
      // Navigation not ready yet, retry after delay
      console.log(
        "⏳ [NotificationManager] Navigation not ready yet, retrying in",
        delay,
        "ms (attempt",
        attempt + 1,
        "of",
        maxAttempts,
        ")"
      );
      setTimeout(() => {
        this.navigateToChatWithRetry(conversationId, attempt + 1);
      }, delay);
    }
  }

  /**
   * Navigate to Sendbird chat with retry logic
   * This is needed when app is launching from background/killed state
   */
  private navigateToSendbirdChatWithRetry(
    channelUrl: string,
    attempt: number = 0,
    parentMessageId?: string,
    scrollToMessageId?: string
  ): void {
    const maxAttempts = 15; // Keep high for reliability
    const delay = 200; // Reduced from 250ms to 200ms for faster checks

    if (attempt >= maxAttempts) {
      console.error(
        "❌ [NotificationManager] Failed to navigate to Sendbird chat after",
        maxAttempts,
        "attempts"
      );
      return;
    }

    // Check if navigation is ready
    const currentRoute = getCurrentRoute();
    if (currentRoute) {
      // Navigation is ready, navigate now
      console.log(
        "✅ [NotificationManager] Navigation ready, navigating to Sendbird chat:",
        channelUrl,
        parentMessageId ? `with thread ${parentMessageId}` : "",
        scrollToMessageId ? `scrollTo ${scrollToMessageId}` : "",
        "attempt:",
        attempt + 1
      );

      // Always navigate to Chat, even for thread notifications
      // Pass parentMessageId so Chat can scroll to that message (not open Threads)
      navigateOrReplace(Routes.Chat, {
        channelUrl,
        ...(parentMessageId
          ? { parentMessageId: parentMessageId.toString() }
          : {}),
        ...(scrollToMessageId ? { scrollToMessageId } : {})
      } as any);

      // Verify navigation succeeded after a short delay, retry if not (same as SMS)
      setTimeout(() => {
        const newRoute = getCurrentRoute();
        const routeParams = newRoute?.params as any;
        const isOnTargetRoute =
          newRoute?.name === Routes.Chat &&
          routeParams?.channelUrl === channelUrl;

        if (!isOnTargetRoute && attempt < maxAttempts - 1) {
          console.warn(
            "⚠️ [NotificationManager] Navigation verification failed, retrying in",
            delay,
            "ms (attempt",
            attempt + 2,
            "of",
            maxAttempts,
            ")",
            {
              currentRoute: newRoute?.name,
              expectedRoute: Routes.Chat,
              currentChannelUrl: routeParams?.channelUrl,
              targetChannelUrl: channelUrl
            }
          );
          setTimeout(() => {
            this.navigateToSendbirdChatWithRetry(
              channelUrl,
              attempt + 1,
              parentMessageId,
              scrollToMessageId
            );
          }, delay);
        } else if (isOnTargetRoute) {
          console.log(
            "✅ [NotificationManager] Channel navigation verified successfully"
          );
        }
      }, 100);
    } else {
      // Navigation not ready yet, retry after delay
      console.log(
        "⏳ [NotificationManager] Navigation not ready yet, retrying in",
        delay,
        "ms (attempt",
        attempt + 1,
        "of",
        maxAttempts,
        ")"
      );
      setTimeout(() => {
        this.navigateToSendbirdChatWithRetry(
          channelUrl,
          attempt + 1,
          parentMessageId,
          scrollToMessageId
        );
      }, delay);
    }
  }

  /**
   * Navigate to Inbox → Missed tab (used when user taps a missed call notification).
   * Uses retry logic when app is launching from killed/background state.
   */
  private navigateToMissedCallsTab(attempt: number = 0): void {
    const maxAttempts = 20;
    const delay = 200;

    if (attempt >= maxAttempts) {
      console.error(
        "❌ [NotificationManager] Failed to navigate to Missed calls tab after",
        maxAttempts,
        "attempts"
      );
      return;
    }

    const currentRoute = getCurrentRoute();
    if (currentRoute) {
      console.log(
        "✅ [NotificationManager] Navigation ready, navigating to Missed calls tab (attempt:",
        attempt + 1,
        ")"
      );
      navigationRef.dispatch(
        CommonActions.navigate({
          name: Routes.BottomTabNavigator,
          params: {
            screen: Routes.Inbox
          }
        })
      );
      setTimeout(() => {
        emitNavigateToMissedTab();
      }, 300);
    } else {
      console.log(
        "⏳ [NotificationManager] Navigation not ready yet, retrying Missed calls in",
        delay,
        "ms (attempt",
        attempt + 1,
        "of",
        maxAttempts,
        ")"
      );
      setTimeout(() => this.navigateToMissedCallsTab(attempt + 1), delay);
    }
  }

  /**
   * Navigate to Inbox → Voicemails tab (used when user taps a voicemail notification).
   * Uses retry logic when app is launching from killed/background state.
   */
  private navigateToVoicemailsTab(attempt: number = 0): void {
    const maxAttempts = 20;
    const delay = 200;

    if (attempt >= maxAttempts) {
      console.error(
        "❌ [NotificationManager] Failed to navigate to Voicemails tab after",
        maxAttempts,
        "attempts"
      );
      return;
    }

    const currentRoute = getCurrentRoute();
    if (currentRoute) {
      console.log(
        "✅ [NotificationManager] Navigation ready, navigating to Voicemails tab (attempt:",
        attempt + 1,
        ")"
      );
      navigationRef.dispatch(
        CommonActions.navigate({
          name: Routes.BottomTabNavigator,
          params: {
            screen: Routes.Inbox
          }
        })
      );
      setTimeout(() => {
        emitNavigateToVoicemailTab();
      }, 300);
    } else {
      console.log(
        "⏳ [NotificationManager] Navigation not ready yet, retrying Voicemails in",
        delay,
        "ms (attempt",
        attempt + 1,
        "of",
        maxAttempts,
        ")"
      );
      setTimeout(() => this.navigateToVoicemailsTab(attempt + 1), delay);
    }
  }

  /**
   * Navigate to thread with proper delay to avoid timing issues.
   * First navigates to channel, waits for it to load, then fetches parent message and navigates to thread.
   */
  private async navigateToThreadWithDelay(
    channelUrl: string,
    parentMessageId: string,
    scrollToMessageId?: string
  ): Promise<void> {
    try {
      console.log(
        "🧭 [NotificationManager] Navigating to Threads with delay:",
        {
          channelUrl,
          parentMessageId,
          scrollToMessageId
        }
      );

      // Step 1: Navigate to Chat first to ensure channel is loaded
      navigateOrReplace(Routes.Chat, { channelUrl } as any);

      // Step 2: Wait for Chat screen to mount and channel to be ready (optimized delay)
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Step 3: Fetch parent message with retries
      let parentMessage = null;
      const maxRetries = 3;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (this.callbacks?.onFetchSendbirdMessage) {
          try {
            parentMessage = await this.callbacks.onFetchSendbirdMessage(
              channelUrl,
              parentMessageId
            );
            if (parentMessage) {
              // console.log("✅ [NotificationManager] Parent message fetched on attempt:", attempt + 1);
              break;
            }
          } catch (_error) {
            // console.error("❌ [NotificationManager] Failed to fetch parent message, attempt:", attempt + 1, _error);
          }
        }
        if (!parentMessage && attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      if (!parentMessage) {
        // console.error("❌ [NotificationManager] Could not fetch parent message after retries, cannot navigate to thread");
        return;
      }

      // Step 4: Wait longer to ensure channel and messages are fully loaded (avoid skeleton)
      await new Promise((resolve) => setTimeout(resolve, 500)); // Reduced from 1000ms to 500ms for faster navigation

      // Step 5: Navigate to Threads with parent message
      console.log("🧭 [NotificationManager] Navigating to Threads screen:", {
        channelUrl,
        parentMessageId: parentMessage.messageId,
        scrollToMessageId
      });

      navigateOrReplace(Routes.Threads, {
        channelUrl,
        parentMessage,
        offset: 10,
        ...(scrollToMessageId ? { scrollToMessageId } : {})
      } as any);

      console.log("✅ [NotificationManager] Thread navigation completed");
    } catch (_error) {
      console.error(
        "❌ [NotificationManager] Error navigating to thread:",
        _error
      );
    }
  }

  private handleNotificationPress(payload: any): void {
    // ✅ CRITICAL: Stop processing notifications if destroyed (user logged out)
    if (this.isDestroyed) {
      console.warn(
        "🚫 [NotificationManager] Ignoring notification press - NotificationManager destroyed (user logged out)"
      );
      return;
    }

    console.warn("🔔 [NotificationManager] Notification pressed:", {
      payload,
      hasData: !!payload?.data,
      dataKeys: payload?.data ? Object.keys(payload.data) : [],
      allKeys: payload ? Object.keys(payload) : [],
      payloadString: JSON.stringify(payload, null, 2)
    });

    if (!payload) {
      console.warn("⚠️ [NotificationManager] No payload received");
      return;
    }

    try {
      // Normalize payload structure - handle both iOS and Android formats
      // iOS: payload.data contains the actual data
      // Android: payload contains data directly
      const normalizedData = payload.data || payload;

      // CRITICAL: Ignore incoming call notifications - just bring app to foreground.
      // CallKeep handles the call UI, we don't navigate to InCallScreen.
      // This matches voxo-mobile behavior.
      const isIncomingCall =
        normalizedData?.vm_payload_type === "incoming_call_notification" ||
        normalizedData?.callUuid ||
        payload?.callUuid;
      if (isIncomingCall) {
        console.log(
          "📞 [NotificationManager] Ignoring incoming call notification press - CallKeep handles UI"
        );
        return;
      }

      // console.warn("📱 [NotificationManager] Normalized payload data:", {
      //   normalizedData,
      //   isSendbird: normalizedData.click_action === "SENDBIRD-RECEIVED",
      //   channelUrl: normalizedData.channelUrl,
      //   normalizedDataKeys: Object.keys(normalizedData || {}),
      //   hasDataKey: !!payload.data,
      //   payloadKeys: Object.keys(payload || {})
      // });

      const title = payload.title ?? normalizedData?.title ?? "";
      const body = payload.body ?? normalizedData?.body ?? "";
      const text = `${title} ${body}`.toLowerCase();
      const navClickAction =
        payload.click_action ??
        payload.clickAction ??
        normalizedData?.click_action ??
        normalizedData?.clickAction ??
        normalizedData?.vm_payload_type;
      const callCancelReason =
        payload.callCancelReason ?? normalizedData?.callCancelReason;

      // Voicemail: check FIRST (before missed call) - voicemail uses callCancelReason: "newVoicemail"
      // which would otherwise be mistaken for a missed call.
      const isVoicemail =
        navClickAction === "VOICEMAIL-EVENT-RECEIVE" ||
        navClickAction === "VOICEMAIL-RECEIVED" ||
        navClickAction === "voicemail-received" ||
        callCancelReason === "newVoicemail" ||
        text.includes("voicemail received");
      if (isVoicemail) {
        if (getCurrentRoute()?.name !== Routes.Voicemails) {
          this.navigateToVoicemailsTab(0);
        }
        return;
      }

      // Missed call: navigate to call history (Missed tab)
      const isMissedCall =
        navClickAction === "CALL-EVENT-MISSED" ||
        navClickAction === "MISSED-CALL" ||
        navClickAction === "missed-call" ||
        navClickAction === "MISSED-CALL-RECEIVED" ||
        navClickAction === "missed_call" ||
        normalizedData?.vm_payload_type === "missed_call" ||
        (callCancelReason !== undefined && callCancelReason !== "newVoicemail") ||
        text.includes("missed call") ||
        text.includes("you have a missed call");
      if (isMissedCall) {
        if (getCurrentRoute()?.name !== Routes.Missed) {
          this.navigateToMissedCallsTab(0);
        }
        return;
      }

      // No payload: redirect to Voicemails (e.g. generic "New Message" with empty data).
      const hasChannelUrl = !!(
        normalizedData?.channelUrl || payload.channelUrl
      );
      const hasConversationId = !!(
        normalizedData?.reference_id ||
        normalizedData?.referenceId ||
        normalizedData?.conversationId ||
        normalizedData?.conversation_id ||
        payload.reference_id ||
        payload.referenceId ||
        payload.conversationId ||
        payload.conversation_id
      );
      const hasSendbird = !!(normalizedData?.sendbird || payload.sendbird);
      const hasIdentifyingPayload =
        hasChannelUrl || hasConversationId || hasSendbird;
      if (!hasIdentifyingPayload) {
        if (getCurrentRoute()?.name !== Routes.Voicemails) {
          this.navigateToVoicemailsTab(0);
        }
        return;
      }

      // Handle text message notifications
      // Check both top-level and nested data structure (iOS vs Android)
      const clickAction =
        normalizedData.click_action ||
        normalizedData.clickAction ||
        payload.click_action ||
        payload.clickAction ||
        payload.type ||
        payload.data?.click_action ||
        payload.data?.clickAction;

      const conversationIdStr =
        normalizedData.reference_id ||
        normalizedData.referenceId ||
        normalizedData.conversationId ||
        normalizedData.conversation_id ||
        payload.reference_id ||
        payload.referenceId ||
        payload.conversationId ||
        payload.conversation_id ||
        payload.data?.reference_id ||
        payload.data?.referenceId ||
        payload.data?.conversationId ||
        payload.data?.conversation_id;

      console.warn("📱 [NotificationManager] Checking for SMS notification:", {
        clickAction,
        conversationIdStr,
        hasClickAction: !!clickAction,
        hasConversationId: !!conversationIdStr,
        allPayloadKeys: Object.keys(payload || {}),
        hasDataObject: !!payload.data,
        dataKeys: payload.data ? Object.keys(payload.data) : []
      });

      const isTextNotification =
        clickAction === "TEXT-RECEIVED" ||
        clickAction === "text-received" ||
        !!conversationIdStr ||
        (normalizedData.messageId && normalizedData.from) || // Fallback: if it has messageId and from, it's likely SMS
        (payload.messageId && payload.from) ||
        (payload.data?.messageId && payload.data?.from);

      if (isTextNotification && conversationIdStr) {
        console.warn(
          "📱 [NotificationManager] Text notification detected - navigating to chat:",
          conversationIdStr
        );
        const conversationId = parseInt(conversationIdStr.toString(), 10);
        if (!isNaN(conversationId) && conversationId > 0) {
          const currentRoute = getCurrentRoute();
          const currentConversationId = (currentRoute?.params as any)
            ?.conversationId;

          // Check if already viewing this conversation on either Chat or TextThread route
          const isAlreadyOnConversation =
            (currentRoute?.name === Routes.Chat ||
              currentRoute?.name === Routes.TextThread) &&
            currentConversationId === conversationId;

          if (isAlreadyOnConversation) {
            console.warn(
              "📱 [NotificationManager] Already viewing this conversation, skipping navigation"
            );
            return;
          }

          console.warn(
            "📱 [NotificationManager] Navigating to Chat with conversationId:",
            conversationId,
            "from route:",
            currentRoute?.name
          );

          // Use Routes.Chat for consistency with personal contacts navigation
          // Wait for navigation to be ready, especially when app is launching from background
          this.navigateToChatWithRetry(conversationId, 0);
          return;
        } else {
          console.error(
            "❌ [NotificationManager] Invalid conversation ID:",
            conversationIdStr,
            "parsed as:",
            conversationId
          );
        }
      } else {
        console.warn(
          "ℹ️ [NotificationManager] Not a text notification or missing conversationId",
          {
            isTextNotification,
            hasConversationId: !!conversationIdStr,
            clickAction,
            payloadKeys: Object.keys(payload || {}),
            messageId: payload.messageId || payload.data?.messageId,
            from: payload.from || payload.data?.from
          }
        );
      }

      // Handle Sendbird chat notifications
      // Check for Notifee format first (channelUrl directly in payload).
      // When coming from Notifee foreground event, data is already at the top level
      const notifeeChannelUrl =
        normalizedData.channelUrl ||
        payload.channelUrl ||
        payload.data?.channelUrl;
      const notifeeClickAction =
        normalizedData.click_action ||
        normalizedData.clickAction ||
        payload.click_action ||
        payload.clickAction ||
        payload.data?.click_action;

      console.log(
        "🔍 [NotificationManager] Checking for Sendbird notification:",
        {
          notifeeChannelUrl,
          notifeeClickAction,
          normalizedDataKeys: Object.keys(normalizedData || {}),
          payloadKeys: Object.keys(payload || {}),
          hasDataKey: !!payload.data
        }
      );

      // Check for nested Sendbird format.
      let sendbirdData;
      if (Platform.OS === "ios") {
        sendbirdData = payload.sendbird || payload.data?.sendbird;
      } else if (Platform.OS === "android") {
        const sendbirdValue = payload.sendbird || payload.data?.sendbird;
        if (sendbirdValue) {
          sendbirdData =
            typeof sendbirdValue === "string"
              ? JSON.parse(sendbirdValue)
              : sendbirdValue;
        }
      }

      // Get channelUrl from either Notifee format or nested Sendbird format.
      let channelUrl: string | undefined;
      let parentMessageId: string | undefined;
      let scrollToMessageId: string | undefined;

      if (notifeeChannelUrl && notifeeClickAction === "SENDBIRD-RECEIVED") {
        // Notifee format - channelUrl is directly in payload.
        channelUrl = notifeeChannelUrl;
        parentMessageId =
          normalizedData.parentMessageId ||
          normalizedData.parent_message_id ||
          normalizedData.parentMessage?.messageId?.toString() ||
          payload.parentMessageId ||
          payload.parent_message_id ||
          payload.parentMessage?.messageId?.toString() ||
          payload.data?.parentMessageId ||
          payload.data?.parent_message_id;
        // Get messageId for scrolling to specific message (e.g., reacted message in thread)
        scrollToMessageId =
          normalizedData.messageId ||
          payload.messageId ||
          payload.data?.messageId;
      } else if (sendbirdData?.channel?.channel_url) {
        // Nested Sendbird format.
        channelUrl = sendbirdData.channel.channel_url;
        parentMessageId =
          sendbirdData.parent_message_id ||
          sendbirdData.parentMessageId ||
          payload.data?.parentMessageId;
        console.log(
          "💬 [NotificationManager] Detected nested Sendbird notification format:",
          { channelUrl, parentMessageId }
        );
      }

      // Fallback: If we have channelUrl but no click_action or different click_action,
      // and it's not a text notification, assume it's a Sendbird notification
      // This handles cases where Notifee notifications might not have click_action set correctly
      if (!channelUrl && notifeeChannelUrl && !isTextNotification) {
        // Only if it's definitely not a text notification and we have channelUrl
        channelUrl = notifeeChannelUrl;
        parentMessageId =
          normalizedData.parentMessageId ||
          normalizedData.parent_message_id ||
          payload.parentMessageId ||
          payload.parent_message_id ||
          payload.data?.parentMessageId;
        scrollToMessageId =
          normalizedData.messageId ||
          payload.messageId ||
          payload.data?.messageId;
        console.log(
          "💬 [NotificationManager] Using channelUrl as Sendbird notification (missing/incorrect click_action, assuming Sendbird):",
          {
            channelUrl,
            parentMessageId,
            clickAction: notifeeClickAction,
            isTextNotification
          }
        );
      }

      if (channelUrl) {
        console.log(
          "💬 [NotificationManager] Sendbird notification - navigating to chat:",
          channelUrl,
          parentMessageId
            ? `(will scroll to parent message: ${parentMessageId})`
            : ""
        );

        const currentRoute = getCurrentRoute();
        const currentChannelUrl = (currentRoute?.params as any)?.channelUrl;
        const currentParentMessageId = (currentRoute?.params as any)
          ?.parentMessageId;

        // Only skip if already viewing the exact same channel and same parent message in Chat
        if (
          currentRoute?.name === Routes.Chat &&
          currentChannelUrl === channelUrl &&
          (!parentMessageId ||
            currentParentMessageId?.toString() === parentMessageId.toString())
        ) {
          console.log(
            "[NotificationManager] Already viewing this channel/message in Chat, skipping navigation",
            {
              currentRoute: currentRoute?.name,
              currentChannelUrl,
              targetChannelUrl: channelUrl,
              currentParentMessageId,
              targetParentMessageId: parentMessageId
            }
          );
          return;
        }

        console.log("[NotificationManager] Navigating to Sendbird Chat:", {
          currentRoute: currentRoute?.name,
          currentChannelUrl,
          targetChannelUrl: channelUrl,
          hasParentMessageId: !!parentMessageId,
          willNavigate: true
        });

        // If parentMessageId exists, navigate to Threads screen
        // Otherwise, navigate to Chat (with optional scrollToMessageId for reactions)
        if (parentMessageId) {
          this.navigateToThreadWithDelay(
            channelUrl,
            parentMessageId,
            scrollToMessageId
          );
        } else {
          this.navigateToSendbirdChatWithRetry(
            channelUrl,
            0,
            undefined,
            scrollToMessageId
          );
        }
      } else {
        console.warn(
          "⚠️ [NotificationManager] Sendbird notification detected but no channelUrl found:",
          {
            normalizedData,
            payload,
            notifeeChannelUrl,
            notifeeClickAction,
            hasSendbirdData: !!sendbirdData
          }
        );
      }
    } catch (error) {
      console.error(
        "❌ [NotificationManager] Error handling notification press:",
        error
      );
    }
  }

  /**
   * Setup native notification listeners for iOS
   * Keeps only essential native listeners
   */
  private setupNativeNotificationListeners(): void {
    console.log(
      "📱 [NotificationManager] Setting up iOS native notification listeners at:",
      new Date().toISOString()
    );

    // Listen for notification press events from native module
    const removeListener = VoxoNotificationManager.addNotificationPressListener(
      (payload) => {
        console.log(
          "📱 [NotificationManager] ✅ iOS notification press received from native module:",
          {
            payload,
            hasPayload: !!payload,
            payloadKeys: payload ? Object.keys(payload) : [],
            hasSendbird: !!payload?.sendbird,
            timestamp: new Date().toISOString()
          }
        );

        // Start timing
        const startTime = Date.now();

        // Killed state handler - slower with more retries
        const handleWithDelay = () => {
          const currentRoute = getCurrentRoute();
          if (!currentRoute) {
            setTimeout(handleWithDelay, 500);
          } else {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(
              `🔴 [NotificationManager] iOS KILLED STATE: Navigation ready, took ${elapsed}s`
            );
            this.handleNotificationPress(payload);
          }
        };

        // Active or background State handler - faster with limited retries
        let activeAttempt = 0;
        const maxActiveAttempts = Platform.OS === "ios" ? 3 : 5;
        const handleWithActiveDelay = () => {
          const currentRoute = getCurrentRoute();
          if (!currentRoute && activeAttempt < maxActiveAttempts) {
            activeAttempt++;
            setTimeout(handleWithActiveDelay, 100);
          } else if (currentRoute) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(
              `🟢 [NotificationManager] iOS ACTIVE/BACKGROUND STATE: Navigation ready, took ${elapsed}s`
            );
            this.handleNotificationPress(payload);
          } else {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            console.error(
              `❌ [NotificationManager] iOS ACTIVE/BACKGROUND STATE: Failed after ${elapsed}s`
            );
          }
        };

        // Detect app state and use appropriate handler
        const currentRoute = getCurrentRoute();
        if (currentRoute) {
          // Active state - navigation already ready
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(
            `🟡 [NotificationManager] iOS ACTIVE STATE: Navigation already ready, took ${elapsed}s`
          );
          this.handleNotificationPress(payload);
        } else {
          // Check if this might be background (nav might be ready soon) or killed state
          setTimeout(() => {
            const routeCheck = getCurrentRoute();
            if (routeCheck) {
              // Background state - nav became ready quickly
              const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
              console.log(
                `🟠 [NotificationManager] iOS BACKGROUND STATE: Navigation ready, took ${elapsed}s`
              );
              handleWithActiveDelay();
            } else {
              // Killed state - use slow handler
              console.log(
                `🔴 [NotificationManager] iOS KILLED STATE: Using slow handler with 2s delay`
              );
              setTimeout(handleWithDelay, 2000);
            }
          }, 100);
        }
      }
    );
    console.log("📱listener", removeListener);

    // Listen for onCallEndedRemotely (CALL-EVENT-MISSED push - caller hung up, timeout, etc)
    // Native dismisses CallKit; we clean up VoipBridge and app state so call screen goes away
    VoxoNotificationManager.addCallEndedRemotelyListener(({ callUUID }) => {
      console.warn(
        `📞 [NotificationManager] onCallEndedRemotely: cleaning up call ${callUUID}`
      );
      const voipBridge = VoipBridge.getInstance();
      if (voipBridge.isVoipCall(callUUID)) {
        voipBridge.handleCallEnd(callUUID);
      }
    });

    // Listen for SMS notifications with ignorePush=true (foreground APNs)
    // This allows immediate badge update when notification is suppressed
    const removeSMSListener =
      VoxoNotificationManager.addSmsNotificationListener((payload: any) => {
        console.log(
          "📱 [NotificationManager] SMS notification received (ignorePush=true), processing for badge update:",
          payload
        );

        // Process notification immediately to update Redux and badge
        const notificationData = {
          data: payload.data || payload,
          messageId: payload.messageId || Date.now().toString(),
          click_action:
            payload.click_action ||
            payload.data?.click_action ||
            "TEXT-RECEIVED",
          reference_id: payload.reference_id || payload.data?.reference_id,
          conversationId: payload.conversationId || payload.data?.conversationId
        };

        handleTextNotification(notificationData);
        console.log(
          "✅ [NotificationManager] SMS notification processed for badge update"
        );
      });
    console.log("📱SMSlistener", removeSMSListener);

    console.log(
      "✅ [NotificationManager] iOS native notification listeners setup complete"
    );

    // Note: We don't need onNotificationReceived callback - notifications are already
    // displayed by the native layer. We only need to handle press events for navigation.
  }

  /**
   * Android: sync Notifee after onboarding POST_NOTIFICATIONS (no duplicate FCM dialog).
   */
  async syncAndroidNotifeeAfterOnboarding(): Promise<void> {
    if (Platform.OS !== "android") {
      return;
    }
    try {
      const settings = await notifee.requestPermission();
      console.log(
        "📱 [NotificationManager] Notifee sync after onboarding:",
        settings
      );
    } catch (error) {
      console.error(
        "❌ [NotificationManager] Notifee sync after onboarding failed:",
        error
      );
    }
  }

  async requestPermissions() {
    try {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      // console.log("📱 [NotificationManager] Notification permission status:", {
      //   authStatus,
      //   enabled,
      //   platform: Platform.OS
      // });

      if (!enabled) {
        // console.warn(
        //   "⚠️ [NotificationManager] Notification permission not granted"
        // );
      }

      // Also request Notifee permissions for Android
      if (Platform.OS === "android") {
        const settings = await notifee.requestPermission();
        console.log(
          "📱 [NotificationManager] Notifee permission status:",
          settings
        );
      }
    } catch (error) {
      console.error(
        "❌ [NotificationManager] Error requesting permissions:",
        error
      );
    }
  }

  async getPushToken() {
    if (Platform.OS === "ios") {
      const apnsToken = await messaging().getAPNSToken();
      if (apnsToken) {
        this.callbacks?.onTokenReceived?.({
          token: apnsToken,
          tokenType: "ios_remote_notifications",
          timestamp: Date.now()
        });
      }
    } else {
      const token = await messaging().getToken();
      logAndroidVoipPushToken("notification_manager_get_token", token, {
        tokenType: "android_fcm",
        source: "messaging().getToken()"
      });
      this.callbacks?.onTokenReceived?.({
        token,
        tokenType: "android_fcm",
        timestamp: Date.now()
      });
    }
  }

  destroy() {
    this.isDestroyed = true;
    console.warn(
      "🚫 [NotificationManager] Destroyed - stopping all notification processing"
    );

    if (Platform.OS === "ios") {
      VoxoNotificationManager.removeAllListeners();
    }
    this.callbacks = undefined;
    this.displayedNotifications.clear();
    this.processedSendbirdMessages.clear();
  }

  isDestroyedState(): boolean {
    return this.isDestroyed;
  }

  setViewingConversation(conversationId: string | null) {
    if (Platform.OS === "ios") {
      VoxoNotificationManager.setViewingConversation(conversationId);
    }
  }

  /**
   * Set the badge count on the app icon
   * @param count - Number to display on the badge (0 to clear)
   */
  async setBadgeCount(count: number) {
    try {
      const badgeCount = Math.max(0, count); // Ensure non-negative

      // console.log("🔔 [NotificationManager] Setting badge count:", {
      //   count,
      //   badgeCount,
      //   platform: Platform.OS
      // });

      if (Platform.OS === "ios") {
        try {
          await notifee.setBadgeCount(badgeCount);
        } catch (_e) {
          PushNotificationIOS.setApplicationIconBadgeNumber(badgeCount);
        }
        // console.log(
        //   "✅ [NotificationManager] iOS badge count set:",
        //   badgeCount
        // );
      } else if (Platform.OS === "android") {
        await notifee.setBadgeCount(badgeCount);
        // console.log(
        //   "✅ [NotificationManager] Android badge count set:",
        //   badgeCount
        // );
      }
    } catch (error) {
      console.error(
        "❌ [NotificationManager] Error setting badge count:",
        error
      );
    }
  }

  /**
   * Get the current badge count
   * @returns The current badge count
   */
  async getBadgeCount(): Promise<number> {
    try {
      if (Platform.OS === "ios") {
        return new Promise((resolve) => {
          PushNotificationIOS.getApplicationIconBadgeNumber((count) => {
            resolve(count);
          });
        });
      } else if (Platform.OS === "android") {
        return await notifee.getBadgeCount();
      }
      return 0;
    } catch (error) {
      console.error("Error getting badge count:", error);
      return 0;
    }
  }

  /**
   * Clear the badge count (set to 0)
   */
  async clearBadge() {
    await this.setBadgeCount(0);
  }

  private async createAndroidNotificationChannel() {
    if (Platform.OS === "android") {
      await notifee.createChannel({
        id: this.androidChannelId,
        name: "Voxo Notifications",
        importance: AndroidImportance.HIGH,
        vibration: true,
        sound: "default"
      });
    }
  }

  private setupNotifeeListeners() {
    // console.log("📱 [NotificationManager] Setting up Notifee listeners");

    notifee.onForegroundEvent(async ({ type, detail }) => {
      if (type === EventType.ACTION_PRESS && detail.pressAction?.id) {
        const actionId = detail.pressAction.id;
        const callData = detail.notification?.data;

        console.log("📞 [Notifee] Call action pressed:", {
          action: actionId,
          callUuid: callData?.callUuid,
          callerName: callData?.callerName
        });

        if (actionId === "answer" && callData?.callUuid) {
          // Dismiss notification
          await notifee.cancelNotification(String(callData.callUuid));

          // Send call data to VoIP bridge for processing
          const voipBridge = VoipBridge.getInstance();
          await voipBridge.handleVoipCall({
            callUuid: String(callData.callUuid),
            callerName: String(callData.callerName || "Unknown Caller"),
            callerNumber: String(callData.callerNumber || "Unknown Number"),
            payload: callData
          });

          console.log("✅ [Notifee] Answered call from notification");
        } else if (actionId === "decline" && callData?.callUuid) {
          // Dismiss notification
          await notifee.cancelNotification(String(callData.callUuid));

          // TODO: Send decline to SIP/VoipBridge if needed
          console.log("❌ [Notifee] Declined call from notification");
        }
      } else if (type === EventType.PRESS && detail.notification) {
        console.warn("👆 [Notifee] User pressed notification in foreground");
        const notificationData = detail.notification.data || {};
        const n = detail.notification;

        const payload: any = {
          data: notificationData,
          ...notificationData,
          channelUrl: notificationData.channelUrl,
          click_action: notificationData.click_action,
          messageId: notificationData.messageId,
          parentMessageId:
            notificationData.parentMessageId ||
            notificationData.parent_message_id,
          title: n.title,
          body: n.body
        };

        this.handleNotificationPress(payload);
      } else if (type === EventType.DELIVERED) {
        // DELIVERED event - notification was shown, just informational - no logging needed
      }
    });

    notifee.onBackgroundEvent(async ({ type, detail }) => {
      console.warn("🔔 [Notifee] Background event received:", {
        type,
        eventType: EventType[type],
        hasNotification: !!detail.notification,
        notificationId: detail.notification?.id,
        pressAction: detail.pressAction?.id,
        data: detail.notification?.data,
        dataKeys: detail.notification?.data
          ? Object.keys(detail.notification.data)
          : []
      });

      // Handle call notification actions
      if (type === EventType.ACTION_PRESS && detail.pressAction?.id) {
        const actionId = detail.pressAction.id;
        const callData = detail.notification?.data;

        console.log("📞 [Notifee] Call action pressed in background:", {
          action: actionId,
          callUuid: callData?.callUuid,
          callerName: callData?.callerName
        });

        if (actionId === "answer" && callData?.callUuid) {
          console.log("📞 [Notifee] Answer button pressed (background):", {
            callUuid: callData.callUuid,
            callerNumber: callData.callerNumber,
            callerName: callData.callerName,
            timestamp: new Date().toISOString()
          });

          await notifee.cancelNotification(String(callData.callUuid));

          const voipBridge = VoipBridge.getInstance();
          voipBridge.handleCallAnswer(String(callData.callUuid));
        } else if (actionId === "decline" && callData?.callUuid) {
          // Dismiss notification
          await notifee.cancelNotification(String(callData.callUuid));

          // TODO: Send decline to SIP/VoipBridge if needed
          console.log(
            "❌ [Notifee] Declined call from background notification"
          );
        }
      } else if (type === EventType.PRESS && detail.notification) {
        console.warn(
          "👆 [Notifee] User pressed notification in background/killed state"
        );
        const n = detail.notification;
        const notificationData = n.data || {};
        const payload = {
          ...notificationData,
          data: notificationData,
          title: n.title,
          body: n.body
        };

        // Start timing
        const startTime = Date.now();

        // Killed state handler - slower with more retries
        const handleWithDelay = () => {
          const currentRoute = getCurrentRoute();
          if (!currentRoute) {
            setTimeout(handleWithDelay, 500);
          } else {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(
              `🔴 [Notifee] Android KILLED STATE: Navigation ready, took ${elapsed}s`
            );
            this.handleNotificationPress(payload);
          }
        };

        // Active or background State handler - faster with limited retries
        let activeAttempt = 0;
        const maxActiveAttempts = 5;
        const handleWithActiveDelay = () => {
          const currentRoute = getCurrentRoute();
          if (!currentRoute && activeAttempt < maxActiveAttempts) {
            activeAttempt++;
            setTimeout(handleWithActiveDelay, 100);
          } else if (currentRoute) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(
              `🟢 [Notifee] Android ACTIVE/BACKGROUND STATE: Navigation ready, took ${elapsed}s`
            );
            this.handleNotificationPress(payload);
          } else {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            console.error(
              `❌ [Notifee] Android ACTIVE/BACKGROUND STATE: Failed after ${elapsed}s`
            );
          }
        };

        // Detect app state and use appropriate handler
        const currentRoute = getCurrentRoute();
        if (currentRoute) {
          // Active state - navigation already ready
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(
            `🟡 [Notifee] Android ACTIVE STATE: Navigation already ready, took ${elapsed}s`
          );
          this.handleNotificationPress(payload);
        } else {
          // Check if this might be background (nav might be ready soon) or killed state
          setTimeout(() => {
            const routeCheck = getCurrentRoute();
            if (routeCheck) {
              // Background state - nav became ready quickly
              const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
              console.log(
                `🟠 [Notifee] Android BACKGROUND STATE: Navigation ready, took ${elapsed}s`
              );
              handleWithActiveDelay();
            } else {
              // Killed state - use slow handler
              console.log(
                `🔴 [Notifee] Android KILLED STATE: Using slow handler with 500ms delay`
              );
              setTimeout(handleWithDelay, 500);
            }
          }, 100);
        }
      }
      return Promise.resolve();
    });

    // console.log("✅ [NotificationManager] Notifee listeners setup complete");
  }

  private registerForVoipToken() {
    VoipPushNotification.addEventListener("register", (token: string) => {
      this.voipToken = token;
      this.callbacks?.onTokenReceived?.({
        token,
        tokenType: "ios_voip",
        timestamp: Date.now()
      });
    });
    VoipPushNotification.registerVoipToken();
  }

  private handleVoipPushNotification = async (notification: any) => {
    const ts = () => new Date().toISOString();
    // @ts-ignore
    const sessionCount = global.pendingSipSessions
      ? global.pendingSipSessions.size
      : 0;
    // @ts-ignore
    const wakeupFlag = !!global.pendingVoipPushWakeup;
    const appState = AppState.currentState;
    console.warn(
      `📞 [NM] ${ts()} VoIP push received | AppState=${appState} | wakeupFlag=${wakeupFlag} | pendingSessions=${sessionCount}`
    );
    console.warn(`📞 [NM] ${ts()} Payload:`, JSON.stringify(notification));

    const callData: VoipCallData = {
      callUuid: notification.callUuid || notification.uuid,
      callerName:
        notification.callerName || notification.displayName || "Unknown Caller",
      callerNumber:
        notification.callerNumber || notification.handle || "Unknown Number",
      payload: notification
    };

    console.warn(
      `📞 [NM] ${ts()} callUuid=${callData.callUuid} callerName=${
        callData.callerName
      }`
    );

    const callerIp = notification.ip || notification.callerIp;
    console.warn(`📞 [NM] ${ts()} callerIp=${callerIp}`);

    if (Platform.OS === "android") {
      console.warn(
        `📞 [NM] ${ts()} Android: skip iOS VoIP push SlimSip path (FCM + SessionManager in SoftphoneProvider)`
      );
      return;
    }

    // iOS: When app is active and not SlimSip-only inbound, SessionManager gets INVITE first — skip SlimSip.
    if (
      callerIp &&
      AppState.currentState === "active" &&
      !USE_SLIMSIP_INBOUND_ONLY
    ) {
      console.warn(
        `📞 [NM] ${ts()} App is ACTIVE — skipping SlimSipClient (SessionManager handles call via WebSocket INVITE)`
      );
      return;
    }

    // Track if call ended before SIP established (caller hung up, timeout, etc.)
    // When true, we dismiss CallKit and skip handleVoipCall to avoid showing a dead call.
    let callEndedBeforeEstablish = false;

    if (callerIp) {
      // CRITICAL: Set global flag BEFORE creating SlimSipClient.
      // This prevents SessionManager (sip.js) from registering and stealing the INVITE.
      // @ts-ignore
      global.pendingVoipPushWakeup = true;
      console.warn(`📞 [NM] ${ts()} Set pendingVoipPushWakeup=true`);

      try {
        console.warn(`� [NM] ${ts()} Awaiting store rehydration...`);
        const rehydrateStart = Date.now();
        await rehydratePromise;
        console.warn(
          `� [NM] ${ts()} Store rehydrated in ${Date.now() - rehydrateStart}ms`
        );

        const state = store.getState();
        const { authReducer, userReducer } = state;

        console.warn(
          `📞 [NM] ${ts()} isLoggedIn=${
            authReducer.isLoggedIn
          } hasUser=${!!userReducer.user} peerName=${
            userReducer.user?.peerName || "N/A"
          }`
        );

        if (!authReducer.isLoggedIn || !userReducer.user) {
          console.error(
            `� [NM] ${ts()} ❌ NOT LOGGED IN - cannot create SlimSipClient`
          );
          // @ts-ignore
          global.pendingVoipPushWakeup = false;
        } else {
          const sipSettings: SipClientSettings = {
            routeOptions: {
              direction: "inbound",
              callUuid: callData.callUuid
            },
            pcConfig: {
              bundlePolicy: "max-compat",
              iceServers: [
                {
                  urls: [
                    "stun:stun.l.google.com:19302",
                    "stun:stun1.l.google.com:19302",
                    "stun:stun2.l.google.com:19302",
                    "stun:stun3.l.google.com:19302",
                    "stun:stun4.l.google.com:19302"
                  ]
                }
              ],
              iceTransportPolicy: "all"
            },
            token: authReducer.accessToken,
            sipUri: `sip:${userReducer.user.peerName}@dev-sip.voxo.co`,
            name: "User",
            wsUrl: "wss://api.voxo.co/webrtc",
            password: userReducer.user.peerSecret
          };

          console.warn(
            `� [NM] ${ts()} Creating SlimSipClient | callUuid=${
              callData.callUuid
            } | AppState=${AppState.currentState} | sipUri=${
              sipSettings.sipUri
            }`
          );

          const sipClient = new SlimSipClient(sipSettings);

          console.warn(`� [NM] ${ts()} Calling establishInboundSession...`);
          const establishStart = Date.now();

          const sipSession = await sipClient.establishInboundSession(
            callData.callUuid,
            callerIp
          );

          console.warn(
            `� [NM] ${ts()} ✅ SIP session established in ${
              Date.now() - establishStart
            }ms`
          );

          // @ts-ignore
          if (!global.pendingSipSessions) {
            // @ts-ignore
            global.pendingSipSessions = new Map();
          }
          // @ts-ignore
          if (!global.pendingSipClients) {
            // @ts-ignore
            global.pendingSipClients = new Map();
          }
          // @ts-ignore
          global.pendingSipSessions.set(callData.callUuid, sipSession);
          // @ts-ignore
          global.pendingSipClients.set(callData.callUuid, sipClient);

          sipSession.on("sessionFailed", () => {
            const suppressed = getSuppressedCallKeepEndSet();
            if (suppressed.has(callData.callUuid)) {
              console.warn(
                `📞 [NM] sessionFailed for ${callData.callUuid} — skipping CallKit dismiss (UUID rebound to active leg)`
              );
              suppressed.delete(callData.callUuid);
              return;
            }
            console.warn(
              `📞 [NM] sessionFailed for ${callData.callUuid} — dismissing CallKit`
            );
            try {
              CallKeep.reportEndCallWithUUID(callData.callUuid, 2);
              VoipBridge.getInstance().handleCallEnd(callData.callUuid);
            } catch (e: any) {
              console.error(
                `📞 [NM] Failed to dismiss on sessionFailed:`,
                e?.message || e
              );
            }
          });

          sipSession.on("sessionEnded", () => {
            const suppressed = getSuppressedCallKeepEndSet();
            if (suppressed.has(callData.callUuid)) {
              console.warn(
                `📞 [NM] sessionEnded for ${callData.callUuid} — skipping CallKit dismiss (UUID rebound to active leg)`
              );
              suppressed.delete(callData.callUuid);
              return;
            }
            console.warn(
              `📞 [NM] sessionEnded for ${callData.callUuid} (remote hung up) — dismissing CallKit`
            );
            try {
              CallKeep.reportEndCallWithUUID(callData.callUuid, 2);
              VoipBridge.getInstance().handleCallEnd(callData.callUuid);
            } catch (e: any) {
              console.error(
                `📞 [NM] Failed to dismiss on sessionEnded:`,
                e?.message || e
              );
            }
          });

          // @ts-ignore
          console.warn(
            `� [NM] ${ts()} ✅ Stored globally | sessions=${
              global.pendingSipSessions.size
            } clients=${global.pendingSipClients.size}`
          );
        }
      } catch (error: any) {
        console.error(
          `� [NM] ${ts()} ❌ Error:`,
          error?.error || error?.message || error
        );

        if (error.error === "RECEIVE_INVITE_TIMEOUT") {
          callEndedBeforeEstablish = true;
          console.error(
            `� [NM] ${ts()} ❌ INVITE timeout (8s) - server did not send INVITE after REGISTER`
          );
        } else if (error.error === "INVITE_ANSWERED_ELSEWHERE") {
          callEndedBeforeEstablish = true;
          console.error(` � [NM] ${ts()} ❌ Answered elsewhere`);
        } else if (error.error === "INVITE_CANCELLED_EARLY") {
          callEndedBeforeEstablish = true;
          console.error(` � [NM] ${ts()} ❌ Cancelled early (caller hung up)`);
        } else if (error.error === "REGISTRATION_FAILED") {
          callEndedBeforeEstablish = true;
          console.error(` � [NM] ${ts()} ❌ SIP registration failed`);
        }

        if (callEndedBeforeEstablish) {
          try {
            CallKeep.reportEndCallWithUUID(callData.callUuid, 2);
            VoipBridge.getInstance().handleCallEnd(callData.callUuid);
          } catch (dismissErr: any) {
            console.error(
              ` [NM] ${ts()} Failed to dismiss CallKit:`,
              dismissErr?.message || dismissErr
            );
          }
        }
      } finally {
        // CRITICAL: Always clear flag + UserDefaults so SessionManager can register later
        // @ts-ignore
        global.pendingVoipPushWakeup = false;
        await PendingCallManager.clearPendingCall(callData.callUuid);
        console.warn(
          `📞 [NM] ${ts()} Finally: cleared wakeup flag + UserDefaults for ${
            callData.callUuid
          }`
        );
      }
    } else {
      console.warn(
        `📞 [NM] ${ts()} No callerIp in payload - skipping SIP establishment`
      );
    }

    // Send to VoIP bridge for UI updates (skip when call ended before SIP established)
    if (!callEndedBeforeEstablish) {
      console.warn(`📞 [NM] ${ts()} Sending to VoipBridge.handleVoipCall...`);
      const voipBridge = VoipBridge.getInstance();
      voipBridge.handleVoipCall(callData).catch((error) => {
        console.error(
          `📞 [NM] ${ts()} ❌ VoipBridge.handleVoipCall error:`,
          error
        );
      });
    }
  };

  private setupVoipPushListeners() {
    console.warn(
      `📞 [NM] setupVoipPushListeners() called at ${new Date().toISOString()}`
    );

    // Listen for VoIP push notifications (fires when app is already running)
    VoipPushNotification.addEventListener(
      "notification",
      (notification: any) => {
        console.warn(
          `📞 [NM] "notification" event fired at ${new Date().toISOString()}`
        );
        this.handleVoipPushNotification(notification);
      }
    );

    // CRITICAL: Handle VoIP push notifications that arrived BEFORE JS was ready (killed state).
    // Without this, killed-state VoIP pushes are never replayed to JS and only the
    // wrong code path (checkPendingCalls → SessionManager wake-up UA) handles the call.
    // This matches voxo-mobile's GlobalCallManager.rnVoipPushNotificationDidLoadWithEvents.
    VoipPushNotification.addEventListener(
      "didLoadWithEvents",
      (events: any) => {
        console.warn(
          `📞 [NM] "didLoadWithEvents" fired at ${new Date().toISOString()} | eventCount=${
            events?.length || 0
          }`
        );
        console.warn(`📞 [NM] didLoadWithEvents raw:`, JSON.stringify(events));

        if (!events || !Array.isArray(events) || events.length < 1) {
          console.warn(`📞 [NM] didLoadWithEvents: no events to replay`);
          return;
        }

        for (const voipPushEvent of events) {
          const { name, data } = voipPushEvent;
          console.warn(`📞 [NM] didLoadWithEvents event: name=${name}`);
          if (
            name ===
            VoipPushNotification.RNVoipPushRemoteNotificationReceivedEvent
          ) {
            console.warn(
              `📞 [NM] ▶ Replaying queued VoIP push from killed state`
            );
            this.handleVoipPushNotification(data);
          } else if (
            name ===
            VoipPushNotification.RNVoipPushRemoteNotificationsRegisteredEvent
          ) {
            console.warn(`📞 [NM] ▶ Replaying VoIP token registration`);
            this.voipToken = data;
            this.callbacks?.onTokenReceived?.({
              token: data,
              tokenType: "ios_voip",
              timestamp: Date.now()
            });
          }
        }
      }
    );
  }

  private listenForTokenRefresh() {
    if (Platform.OS === "android") {
      messaging().onTokenRefresh((token) => {
        logAndroidVoipPushToken("notification_manager_token_refresh", token, {
          tokenType: "android_fcm",
          source: "messaging().onTokenRefresh()"
        });
        this.callbacks?.onTokenReceived?.({
          token,
          tokenType: "android_fcm",
          timestamp: Date.now()
        });
      });
    }
  }

  /**
   * Handle notification press with retry logic for killed state
   * This ensures navigation works even when app is launching from killed state
   */
  // Kill state.
  private handleNotificationPressWithRetry(
    payload: any,
    attempt: number = 0,
    isKilledState: boolean = false
  ): void {
    const maxAttempts = isKilledState ? 15 : 5; // More attempts for killed state (up to 7.5 seconds)
    const delay = isKilledState ? 500 : 300; // Longer delay for killed state

    if (attempt >= maxAttempts) {
      console.error(
        "❌ [NotificationManager] Failed to handle notification press after",
        maxAttempts,
        "attempts",
        {
          isKilledState,
          payload
        }
      );
      return;
    }

    // Check if navigation is ready
    const currentRoute = getCurrentRoute();
    if (currentRoute) {
      // Navigation is ready, handle notification press now
      console.log(
        "✅ [NotificationManager] Navigation ready, handling notification press:",
        {
          attempt: attempt + 1,
          isKilledState,
          route: currentRoute.name
        }
      );
      this.handleNotificationPress(payload);
    } else {
      // Navigation not ready yet, retry after delay
      console.log(
        "⏳ [NotificationManager] Navigation not ready yet, retrying in",
        delay,
        "ms (attempt",
        attempt + 1,
        "of",
        maxAttempts,
        ")",
        {
          isKilledState
        }
      );
      setTimeout(() => {
        this.handleNotificationPressWithRetry(
          payload,
          attempt + 1,
          isKilledState
        );
      }, delay);
    }
  }

  // Background or active state.
  private handleNotificationPressForActiveApp(
    payload: any,
    attempt: number = 0
  ): void {
    const maxAttempts = Platform.OS === "ios" ? 3 : 5;
    const delay = 100;
    if (attempt >= maxAttempts) {
      console.error(
        "❌ [NotificationManager] Failed to handle notification press (active app) after",
        maxAttempts,
        "attempts",
        {
          platform: Platform.OS,
          payload
        }
      );
      return;
    }
    // Check if navigation is ready.
    const currentRoute = getCurrentRoute();
    if (currentRoute) {
      // Navigation is ready, handle notification press now.
      console.log(
        "✅ [NotificationManager] Navigation ready (active app), handling notification press:",
        {
          attempt: attempt + 1,
          platform: Platform.OS,
          route: currentRoute.name
        }
      );
      this.handleNotificationPress(payload);
    } else {
      // Navigation not ready yet, retry after delay.
      console.log(
        "⏳ [NotificationManager] Navigation not ready (active app), retrying in",
        delay,
        "ms (attempt",
        attempt + 1,
        "of",
        maxAttempts,
        ")",
        {
          platform: Platform.OS
        }
      );
      setTimeout(() => {
        this.handleNotificationPressForActiveApp(payload, attempt + 1);
      }, delay);
    }
  }

  /**
   * Setup Android-specific notification handlers
   * Handles notifications when app is opened from notification press
   */
  private setupAndroidNotificationHandlers() {
    if (Platform.OS !== "android") {
      return;
    }

    // console.log(
    //   "📱 [NotificationManager] Setting up Android notification handlers"
    // );

    // Handle notification when app is opened from quit/killed state
    // This uses retry logic to ensure navigation is ready before handling
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) {
          console.log("🔔 [FCM] App opened from notification (killed state):", {
            messageId: remoteMessage.messageId,
            hasData: !!remoteMessage.data,
            dataKeys: remoteMessage.data ? Object.keys(remoteMessage.data) : []
          });
          console.log("🔔 [FCM] Notification data:", remoteMessage.data);
          // Reduced delay for faster navigation - navigation container should be ready quickly
          // The retry logic in navigateToChatWithRetry/navigateToSendbirdChatWithRetry
          // will handle additional retries if navigation still isn't ready after this delay
          setTimeout(() => {
            console.log(
              "🔔 [FCM] Processing initial notification after delay (killed state)"
            );
            this.handleNotificationPressWithRetry(
              remoteMessage.data || {},
              0,
              true
            );
          }, 500); // Reduced from 800ms to 500ms for faster navigation
        } else {
          // ✅ NEW: Also check Notifee for initial notification (for Sendbird notifications displayed via Notifee)
          // This handles cases where notification was displayed by Notifee but FCM didn't capture it
          notifee
            .getInitialNotification()
            .then((initialNotification) => {
              if (initialNotification?.notification) {
                const notification = initialNotification.notification;
                const notificationData = notification.data || {};
                console.log(
                  "🔔 [Notifee] App opened from notification (killed state - Notifee):",
                  {
                    notificationId: notification.id,
                    hasData: !!notification.data,
                    dataKeys: notification.data
                      ? Object.keys(notification.data)
                      : []
                  }
                );
                console.log(
                  "🔔 [Notifee] Notification data:",
                  notificationData
                );

                setTimeout(() => {
                  console.log(
                    "🔔 [Notifee] Processing initial notification after delay (killed state)"
                  );
                  this.handleNotificationPressWithRetry(
                    notificationData,
                    0,
                    true
                  );
                }, 500); // Reduced delay for faster navigation
              }
            })
            .catch((error) => {
              console.error(
                "❌ [NotificationManager] Error getting initial Notifee notification:",
                error
              );
            });
        }
      })
      .catch((error) => {
        console.error(
          "❌ [NotificationManager] Error getting initial notification:",
          error
        );
      });

    // Handle notification when app is opened from background state
    // Background state doesn't need as much retry since navigation is already initialized
    messaging().onNotificationOpenedApp((remoteMessage) => {
      console.log("🔔 [FCM] App opened from notification (background state):", {
        messageId: remoteMessage.messageId,
        hasData: !!remoteMessage.data,
        dataKeys: remoteMessage.data ? Object.keys(remoteMessage.data) : []
      });
      console.log("🔔 [FCM] Notification data:", remoteMessage.data);

      // Use retry logic but with fewer attempts for background state
      this.handleNotificationPressWithRetry(
        remoteMessage.data || {},
        0,
        false // isKilledState = false
      );
    });

    // console.log(
    //   "✅ [NotificationManager] Android notification handlers setup complete"
    // );
  }

  private listenForNotifications() {
    // console.log(
    //   "📱 [NotificationManager] Setting up FCM notification listeners for platform:",
    //   Platform.OS
    // );

    // Foreground message handler (app is open)
    messaging().onMessage(async (remoteMessage) => {
      try {
        const state = store.getState();
        const isLoggedIn = (state as any)?.authReducer?.isLoggedIn;
        const user = (state as any)?.userReducer?.user;

        if (!isLoggedIn || !user || !user.id) {
          console.log(
            "🚫 [FCM] Foreground notification BLOCKED - User not logged in",
            {
              isLoggedIn,
              hasUser: !!user,
              userId: user?.id,
              messageId: remoteMessage.messageId,
              notificationType:
                remoteMessage.data?.vm_payload_type ||
                remoteMessage.data?.click_action ||
                "unknown"
            }
          );
          return;
        }
      } catch (error) {
        console.error("❌ [FCM] Error checking login state:", error);
        return;
      }

      if (this.isDestroyed) {
        console.warn(
          "🚫 [FCM] Foreground notification BLOCKED - NotificationManager destroyed (user logged out)"
        );
        return;
      }

      const notificationData = remoteMessage.data || {};

      const isTextNotification =
        notificationData.click_action === "TEXT-RECEIVED" ||
        notificationData.reference_id ||
        notificationData.conversationId ||
        notificationData.conversation_id;

      // Check if this is a Sendbird notification
      let sendbirdData;
      try {
        if (remoteMessage.data?.sendbird) {
          sendbirdData =
            typeof remoteMessage.data.sendbird === "string"
              ? JSON.parse(remoteMessage.data.sendbird)
              : remoteMessage.data.sendbird;
        }
      } catch (error) {
        console.error("[FCM] Error parsing sendbird data:", error);
      }

      const isSendbirdPush =
        !!sendbirdData?.channel?.channel_url ||
        remoteMessage.data?.click_action === "SENDBIRD-RECEIVED" ||
        !!remoteMessage.data?.channelUrl;

      // Only log non-Sendbird pushes for debugging (Sendbird sends many duplicates)
      if (!isSendbirdPush) {
        console.log("🔍 [FCM onMessage] Non-Sendbird push:", {
          clickAction: remoteMessage.data?.click_action,
          hasNotificationPayload: !!remoteMessage.notification,
          timestamp: Date.now()
        });
      }

      if (isSendbirdPush) {
        const channelUrl =
          sendbirdData?.channel?.channel_url || remoteMessage.data?.channelUrl;
        const unreadCount = sendbirdData?.channel?.channel_unread_message_count;
        const messageId =
          sendbirdData?.message_id || remoteMessage.data?.messageId;

        // ✅ DEDUPLICATION: Prevent processing same Sendbird message multiple times
        const dedupeKey = `${channelUrl}_${messageId}`;
        if (this.processedSendbirdMessages.has(dedupeKey)) {
          // Silent return - no need to log every duplicate, reduces noise
          return;
        }
        this.processedSendbirdMessages.add(dedupeKey);
        // Keep cache size limited
        if (
          this.processedSendbirdMessages.size > this.NOTIFICATION_CACHE_SIZE
        ) {
          const iterator = this.processedSendbirdMessages.values();
          const firstItem = iterator.next().value;
          if (firstItem) this.processedSendbirdMessages.delete(firstItem);
        }

        if (channelUrl) {
          console.log(
            "📨 [FCM] Sendbird notification in foreground, refreshing channel:",
            channelUrl,
            "unread:",
            unreadCount
          );
          // ✅ CRITICAL: Stop processing if destroyed (user logged out)
          if (this.isDestroyed) {
            console.warn(
              "🚫 [FCM] Ignoring Sendbird message - NotificationManager destroyed (user logged out)"
            );
            return;
          }

          // Trigger channel refresh with FCM unread count for immediate badge update
          this.callbacks?.onSendbirdMessageReceived?.(channelUrl, unreadCount);
        }
        return;
      }

      // Android SMS: JS owns tray (toggle ON = notification block in FCM; toggle OFF = data-only).
      if (isTextNotification && Platform.OS === "android") {
        console.log("📱 [FCM] Android SMS — unified JS handler", {
          messageId: remoteMessage.messageId,
          hasNotificationBlock: !!remoteMessage.notification
        });
        await handleAndroidSmsFcm(remoteMessage);
        return;
      }

      const ignorePushValue = remoteMessage.data?.ignorePush;
      let ignorePush = false;
      if (typeof ignorePushValue === "string") {
        ignorePush = ignorePushValue === "true" || ignorePushValue === "1";
      } else if (typeof ignorePushValue === "boolean") {
        ignorePush = ignorePushValue === true;
      } else if (typeof ignorePushValue === "number") {
        ignorePush = ignorePushValue === 1;
      }
      if (ignorePush && !isTextNotification) {
        console.log(
          "🔕 [FCM onMessage] ignorePush=true (non-SMS); suppressing banner UI"
        );
        return;
      }

      // 🔍 DUPLICATE TRACKING: Log before calling displayNotification
      console.log(
        "🔍🔍🔍 [FCM onMessage] About to call displayNotification()",
        {
          isSendbirdPush,
          isTextNotification,
          messageId: remoteMessage.messageId,
          hasNotificationPayload: !!remoteMessage.notification,
          timestamp: Date.now()
        }
      );

      await this.displayNotification(remoteMessage);
    });

    // Note: Background message handler MUST be registered in index.js at the top level
    // It cannot be registered here in a class method
    // See index.js for the background handler implementation

    // console.log("✅ [NotificationManager] FCM listeners setup complete");
  }

  private async displayNotification(remoteMessage: any) {
    // 🔍 DUPLICATE TRACKING: Log entry point
    // console.log("🔍🔍🔍 [displayNotification] ENTRY POINT - NotificationManager.displayNotification()", {
    //   messageId: remoteMessage.messageId,
    //   hasData: !!remoteMessage.data,
    //   hasNotification: !!remoteMessage.notification,
    //   platform: Platform.OS,
    //   clickAction: remoteMessage.data?.click_action,
    //   channelUrl: remoteMessage.data?.channelUrl,
    //   timestamp: Date.now(),
    //   stackTrace: new Error().stack?.split('\n').slice(0, 5).join('\n')
    // });
    // console.log("📱 [displayNotification] Called with message:", {
    //   hasData: !!remoteMessage.data,
    //   hasNotification: !!remoteMessage.notification,
    //   platform: Platform.OS,
    //   messageId: remoteMessage.messageId
    // });

    if (!remoteMessage.data) {
      // console.log("⚠️ [displayNotification] No data in message, skipping");
      return;
    }

    // Prevent duplicate notifications using messageId
    if (
      remoteMessage.messageId &&
      this.displayedNotifications.has(remoteMessage.messageId)
    ) {
      // console.log("🚫 [displayNotification] Duplicate notification blocked:", {
      //   messageId: remoteMessage.messageId,
      //   cacheSize: this.displayedNotifications.size
      // });
      return;
    }

    // Add to cache and limit size
    if (remoteMessage.messageId) {
      this.displayedNotifications.add(remoteMessage.messageId);
      // Keep cache size limited
      if (this.displayedNotifications.size > this.NOTIFICATION_CACHE_SIZE) {
        const iterator = this.displayedNotifications.values();
        const firstItem = iterator.next().value;
        if (firstItem) {
          this.displayedNotifications.delete(firstItem);
        }
      }
    }

    try {
      // Normalize ignorePush to accept boolean or string
      const ignorePushVal = remoteMessage.data?.ignorePush;
      const ignorePushFlag =
        ignorePushVal === "true" ||
        ignorePushVal === true ||
        ignorePushVal === "1" ||
        ignorePushVal === 1;
      const notificationData = { ...remoteMessage.data };
      const isTextNotification =
        notificationData.click_action === "TEXT-RECEIVED" ||
        notificationData.reference_id ||
        notificationData.conversationId ||
        notificationData.conversation_id ||
        notificationData.vm_payload_type === "text-notification";

      if (isTextNotification && Platform.OS === "android") {
        await handleAndroidSmsFcm(remoteMessage, { skipRedux: true });
        return;
      }

      if (ignorePushFlag) {
        console.log(
          "🔕 [displayNotification] ignorePush — skipping banner UI"
        );
        if (isTextNotification) {
          handleTextNotification(remoteMessage);
        }
        return;
      }

      // Handle call notifications - send to VoIP bridge for processing
      if (
        remoteMessage.data.callUuid ||
        remoteMessage.data.uuid ||
        remoteMessage.data.vm_payload_type === "incoming_call_notification" ||
        remoteMessage.data.payload_callUuid
      ) {
        if (Platform.OS === "android" && AppState.currentState !== "active") {
          try {
            const AndroidNotifications =
              NativeModules.VoxoConnectAndroidNotifications;
            const callNotifsEnabled =
              typeof AndroidNotifications?.getEnableMobileCallNotifications ===
              "function"
                ? AndroidNotifications.getEnableMobileCallNotifications()
                : true;
            if (!callNotifsEnabled) {
              console.log(
                "📞 [displayNotification] Suppressed — enableMobileCallNotifications off (background)"
              );
              return;
            }
          } catch (e) {
            console.warn(
              "📞 [displayNotification] could not read call notification pref:",
              e
            );
          }
        }

        console.log(
          "📞 [displayNotification] Call notification detected, processing via VoIP bridge:",
          {
            platform: Platform.OS,
            callUuid:
              remoteMessage.data.callUuid ||
              remoteMessage.data.payload_callUuid,
            payloadType: remoteMessage.data.vm_payload_type
          }
        );

        // Extract call data and send to VoIP bridge
        const callData: VoipCallData = {
          callUuid:
            remoteMessage.data.payload_callUuid ||
            remoteMessage.data.callUuid ||
            remoteMessage.data.uuid,
          callerName:
            remoteMessage.data.payload_callerName ||
            remoteMessage.data.callerName ||
            "Unknown Caller",
          callerNumber:
            remoteMessage.data.payload_callerNumber ||
            remoteMessage.data.callerNumber ||
            "Unknown Number",
          payload: remoteMessage.data
        };

        if (
          Platform.OS === "android" &&
          shouldSkipStaleVoipPush(
            remoteMessage.data as Record<string, unknown>,
            callData.callUuid,
            "displayNotification"
          )
        ) {
          dismissStaleAndroidVoipCall(callData.callUuid, callData);
          return;
        }

        const voipBridge = VoipBridge.getInstance();
        voipBridge.handleVoipCall(callData).catch((error) => {
          console.error(
            "❌ [displayNotification] Error handling VoIP call:",
            error
          );
        });

        return;
      }

      // Process notification content - use same logic for both Sendbird and SMS
      let title: string;
      let body: string;
      const isVoicemail =
        notificationData.vm_payload_type === "voicemail" ||
        notificationData.vm_payload_type === "voicemail_notification" ||
        notificationData.click_action === "VOICEMAIL-RECEIVED" ||
        notificationData.click_action === "voicemail-received";

      // Check if this is a Sendbird notification
      let sendbirdData;
      try {
        if (remoteMessage.data.sendbird) {
          sendbirdData =
            typeof remoteMessage.data.sendbird === "string"
              ? JSON.parse(remoteMessage.data.sendbird)
              : remoteMessage.data.sendbird;
        }
      } catch (error) {
        console.error("Error parsing sendbird data:", error);
      }

      if (sendbirdData) {
        // Check user notification preferences before displaying Sendbird notifications
        const state = store.getState();
        const user = (state as any)?.userReducer?.user;
        const chatNotificationsEnabled = user?.enableChatNotifications === 1;

        console.log(
          "🔔 [displayNotification] Checking notification preferences for Sendbird",
          {
            chatNotificationsEnabled,
            userId: user?.id,
            channelUrl: sendbirdData.channel?.channel_url,
            willBlock: !chatNotificationsEnabled
          }
        );

        // If Chat Messages is toggled OFF, don't show Sendbird notification.
        if (!chatNotificationsEnabled) {
          console.log(
            "🚫 [displayNotification] Sendbird notification BLOCKED - Chat Messages is disabled",
            {
              chatEnabled: chatNotificationsEnabled,
              channelUrl: sendbirdData.channel?.channel_url,
              messageId: remoteMessage.messageId
            }
          );
          return;
        }

        // ✅ NEW: Check AllNewMessages toggle - if disabled, suppress notifications
        const allNewMessagesEnabled =
          user?.enableAllNewMessageNotifications === 1;
        if (!allNewMessagesEnabled) {
          console.log(
            "🚫 [displayNotification] Sendbird notification BLOCKED - All New Messages is disabled",
            {
              allNewMessagesEnabled,
              channelUrl: sendbirdData.channel?.channel_url,
              messageId: remoteMessage.messageId
            }
          );
          return;
        }

        // ✅ NEW: Check DirectMessagesOnly toggle - if enabled, suppress group channel notifications
        const directMessagesOnlyEnabled =
          user?.enableDirectMessageNotifications === 1;
        if (directMessagesOnlyEnabled) {
          // Check if this is a group channel
          const customType =
            sendbirdData.channel?.custom_type ||
            sendbirdData.channel?.customType ||
            "";
          const tenantId = user?.tenantId;
          const isGroupChannel = tenantId && customType === `Open_${tenantId}`;

          if (isGroupChannel) {
            console.log(
              "🚫 [displayNotification] Sendbird notification BLOCKED - Direct Messages Only enabled, suppressing group channel",
              {
                channelUrl: sendbirdData.channel?.channel_url,
                customType,
                messageId: remoteMessage.messageId
              }
            );
            return;
          }
        }

        // Channel creation notifications should not be shown.
        const notificationBody =
          remoteMessage.notification?.body || remoteMessage.data?.message || "";
        const notificationTitle =
          remoteMessage.notification?.title || remoteMessage.data?.title || "";
        const hasMessage = !!(
          remoteMessage.data?.message ||
          notificationBody ||
          sendbirdData.message_id ||
          sendbirdData.messageId
        );
        const hasSender = !!(
          sendbirdData.sender?.name ||
          sendbirdData.sender?.user_id ||
          sendbirdData.sender?.userId
        );

        // Only block if it's clearly a channel creation event (no message AND no sender AND has keywords).
        const channelCreationKeywords = [
          "channel created",
          "created channel",
          "joined channel",
          "channel joined",
          "new channel"
        ];
        const bodyLower = notificationBody.toLowerCase();
        const titleLower = notificationTitle.toLowerCase();
        const isChannelCreation = channelCreationKeywords.some(
          (keyword) =>
            bodyLower.includes(keyword) || titleLower.includes(keyword)
        );

        // Only block ADMIN messages if they don't have actual content.
        const isSystemMessage =
          (sendbirdData.message_type === "ADMIN" ||
            sendbirdData.type === "ADMIN") &&
          !hasMessage;

        // Block only if: (no message AND no sender) OR (has channel creation keywords).
        if ((!hasMessage && !hasSender) || isChannelCreation) {
          console.log(
            "🚫 [displayNotification] Sendbird notification BLOCKED - Channel creation event",
            {
              channelUrl: sendbirdData.channel?.channel_url,
              channelName: sendbirdData.channel?.name,
              hasMessage,
              hasSender,
              isChannelCreation,
              isSystemMessage,
              messageId: remoteMessage.messageId,
              body: notificationBody,
              title: notificationTitle
            }
          );
          return;
        }

        // Block system messages only if they have no content.
        if (isSystemMessage) {
          console.log(
            "🚫 [displayNotification] Sendbird notification BLOCKED - System message with no content",
            {
              channelUrl: sendbirdData.channel?.channel_url,
              messageId: remoteMessage.messageId
            }
          );
          return;
        }

        // Process Sendbird notification with special formatting
        const processed = this.processNotificationContent(remoteMessage);
        const sendbirdProcessed = this.processSendbirdNotificationContent(
          processed.title,
          processed.body,
          sendbirdData
        );
        title = sendbirdProcessed.title;
        body = sendbirdProcessed.body;
      } else if (
        notificationData.click_action === "TEXT-RECEIVED" ||
        notificationData.conversationId ||
        notificationData.conversation_id ||
        notificationData.reference_id
      ) {
        // Check user notification preferences before displaying SMS notifications.
        const state = store.getState();
        const user = (state as any)?.userReducer?.user;
        const smsNotificationsEnabled = areSmsNotificationsEnabled(
          user?.enableMobileTextNotifications
        );

        console.log(
          "🔔 [displayNotification] Checking SMS notification preferences (independent from Chat Messages)",
          {
            enableMobileTextNotifications: user?.enableMobileTextNotifications,
            smsNotificationsEnabled,
            userId: user?.id,
            willBlock: !smsNotificationsEnabled
          }
        );

        // SMS Messages toggle: backend 0 = ON, 1 = OFF
        if (!smsNotificationsEnabled) {
          console.log(
            "🚫 [displayNotification] SMS notification BLOCKED - SMS Messages is disabled",
            {
              enableMobileTextNotifications: user?.enableMobileTextNotifications,
              messageId: remoteMessage.messageId
            }
          );
          handleTextNotification(remoteMessage);
          return;
        }

        // Process SMS/text notification - use same format as Sendbird direct messages
        console.log("📱📱📱 [displayNotification] SMS NOTIFICATION DETECTED!", {
          hasClickAction: !!notificationData.click_action,
          hasReferenceId: !!notificationData.reference_id,
          hasConversationId: !!notificationData.conversationId,
          peerName: notificationData.peerName,
          from: notificationData.from,
          // Log ALL data to find where media/GIF info is
          FULL_notificationData: notificationData,
          FULL_remoteData: remoteMessage.data,
          notificationBody: remoteMessage.notification?.body,
          smsNotificationsEnabled
        });

        // Use peerName as title (same as Sendbird uses sender name)
        // For Android SMS notifications in foreground, also check FCM notification.title as fallback
        if (Platform.OS === "android") {
          title = resolveSmsSenderDisplayName(
            notificationData.from,
            notificationData.peerName,
            {
              systemNotificationTitle: remoteMessage.notification?.title,
              notificationBody: remoteMessage.notification?.body,
              conversationId:
                notificationData.reference_id ||
                notificationData.conversationId ||
                notificationData.conversation_id,
              fcmSenderId: remoteMessage.from
            }
          );
        } else {
          title =
            notificationData.peerName || notificationData.from || "New Message";
        }

        // Process body - get raw body first
        body =
          remoteMessage.notification?.body ||
          remoteMessage.data.body ||
          remoteMessage.data.message ||
          remoteMessage.data.text ||
          "";

        // Remove sender prefix from body if it exists (like Sendbird does)
        const colonIndex = body.indexOf(":");
        if (colonIndex > 0) {
          body = body.substring(colonIndex + 1).trim();
        }

        // Clean HTML from body
        body = this.cleanHtmlFromText(body);

        const normalizeMediaUrls = (raw: unknown): string[] => {
          if (!raw) return [];
          if (Array.isArray(raw)) {
            return raw
              .map((u) => (typeof u === "string" ? u.trim() : ""))
              .filter(Boolean);
          }
          if (typeof raw === "string") {
            const trimmed = raw.trim();
            if (!trimmed) return [];
            try {
              const parsed = JSON.parse(trimmed);
              if (Array.isArray(parsed)) {
                return parsed
                  .map((u) => (typeof u === "string" ? u.trim() : ""))
                  .filter(Boolean);
              }
              if (typeof parsed === "string" && parsed.trim()) {
                return [parsed.trim()];
              }
            } catch {
              // Some payloads can be comma-separated URLs.
              if (trimmed.includes(",")) {
                return trimmed
                  .split(",")
                  .map((u) => u.trim())
                  .filter(Boolean);
              }
            }
            return [trimmed];
          }
          return [];
        };

        // Check for GIF/media FIRST (before checking empty body)
        // Try multiple possible locations and formats for media URLs.
        const mediaUrls = normalizeMediaUrls(
          notificationData.mediaUrls ||
            notificationData.media_urls ||
            remoteMessage.data.mediaUrls ||
            remoteMessage.data.media_urls
        );

        console.log("📱 [displayNotification] SMS notification debug:", {
          originalBody: body,
          hasMediaUrls: mediaUrls.length > 0,
          mediaUrlsValue: mediaUrls,
          mediaUrlsCount: mediaUrls.length,
          notificationDataKeys: Object.keys(notificationData),
          remoteDataKeys: Object.keys(remoteMessage.data || {})
        });

        // Helper function to check if URL is a GIF
        const checkIfGif = (url: string): boolean => {
          const lowerUrl = url.toLowerCase();
          const urlWithoutQuery = lowerUrl.split("?")[0];
          return (
            urlWithoutQuery.endsWith(".gif") ||
            lowerUrl.includes("giphy") ||
            lowerUrl.includes("tenor.com") ||
            lowerUrl.includes("gph.is") ||
            lowerUrl.includes("/gif/") ||
            lowerUrl.includes(".gif")
          );
        };

        // If we have mediaUrls, show GIF message regardless of body content
        if (mediaUrls.length > 0) {
          const firstUrl = mediaUrls[0]?.toLowerCase() || "";
          const isGif = checkIfGif(firstUrl);

          console.log("📱 [displayNotification] GIF check:", {
            firstUrl: firstUrl.substring(0, 100),
            isGif,
            mediaUrlsCount: mediaUrls.length
          });

          if (isGif) {
            body = "Received a GIF 🎞️";
            console.log(
              "✅ [displayNotification] SMS GIF detected via mediaUrls!",
              {
                reason: "media_url_matches_gif_patterns"
              }
            );
          } else {
            body = "Received an attachment 📎";
            console.log(
              "✅ [displayNotification] SMS attachment detected via mediaUrls!",
              {
                reason: "media_present_but_not_gif"
              }
            );
          }
        } else if (!body.trim()) {
          // If body is empty, try to fetch latest message via API to check for media.
          const conversationId = parseInt(
            notificationData.reference_id ||
              notificationData.conversationId ||
              "0",
            10
          );
          const accessToken = state.authReducer?.accessToken;
          const userId = user?.id;

          if (conversationId && accessToken && userId) {
            try {
              const messagesResponse = await getMessagesForConversation(
                accessToken,
                userId,
                conversationId,
                1,
                5,
                true
              );
              const latestMessage = messagesResponse.records?.[0];

              if (
                latestMessage?.mediaUrls &&
                latestMessage.mediaUrls.length > 0
              ) {
                const firstUrl = latestMessage.mediaUrls[0];
                const isGif = checkIfGif(firstUrl);

                if (isGif) {
                  body = "Received a GIF 🎞️";
                  console.log(
                    "✅ [displayNotification] SMS GIF detected via latest message fetch",
                    {
                      reason: "latest_message_media_url_matches_gif_patterns",
                      firstUrl: String(firstUrl || "").substring(0, 100)
                    }
                  );
                } else {
                  body = "Received an attachment 📎";
                  console.log(
                    "ℹ️ [displayNotification] Latest message has media but not GIF",
                    {
                      reason: "latest_message_media_not_gif",
                      firstUrl: String(firstUrl || "").substring(0, 100)
                    }
                  );
                }
              } else {
                body = "Received an attachment 📎";
                console.log(
                  "ℹ️ [displayNotification] Latest message has no mediaUrls, using attachment fallback",
                  { reason: "latest_message_no_media_urls" }
                );
              }
            } catch (error) {
              console.error(
                "📱 [displayNotification] Error fetching message for GIF detection:",
                error
              );
              body = "Received an attachment 📎";
            }
          } else {
            body = "Received an attachment 📎";
            console.log(
              "ℹ️ [displayNotification] Missing conversation/auth context, using attachment fallback",
              {
                reason: "missing_conversation_or_auth_for_latest_message_lookup",
                conversationId,
                hasAccessToken: !!accessToken,
                hasUserId: !!userId
              }
            );
          }
        }

        // Ensure reference_id is set from conversationId if missing
        if (!notificationData.reference_id && notificationData.conversationId) {
          notificationData.reference_id =
            notificationData.conversationId.toString();
        }
        if (
          !notificationData.reference_id &&
          notificationData.conversation_id
        ) {
          notificationData.reference_id =
            notificationData.conversation_id.toString();
        }

        // Ensure click_action is set
        if (!notificationData.click_action) {
          notificationData.click_action = "TEXT-RECEIVED";
        }
      } else if (isVoicemail) {
        title =
          remoteMessage.notification?.title ||
          remoteMessage.data?.title ||
          "Voicemail received";
        body =
          remoteMessage.notification?.body ||
          remoteMessage.data?.body ||
          remoteMessage.data?.message ||
          "";
        notificationData.click_action = "VOICEMAIL-RECEIVED";
        notificationData.vm_payload_type = "voicemail";
      } else if (
        notificationData.vm_payload_type === "missed_call" ||
        notificationData.click_action === "CALL-EVENT-MISSED" ||
        notificationData.click_action === "MISSED-CALL" ||
        notificationData.click_action === "missed-call" ||
        notificationData.click_action === "MISSED-CALL-RECEIVED"
      ) {
        // Missed call notification - ensure click_action for navigation on tap
        title =
          remoteMessage.notification?.title ||
          remoteMessage.data?.title ||
          "Missed call";
        body =
          remoteMessage.notification?.body ||
          remoteMessage.data?.body ||
          remoteMessage.data?.message ||
          "You have a missed call";
        notificationData.click_action =
          notificationData.click_action || "CALL-EVENT-MISSED";
        notificationData.vm_payload_type =
          notificationData.vm_payload_type || "missed_call";
      } else {
        // Default processing for other notification types
        const processed = this.processNotificationContent(remoteMessage);
        title = processed.title;
        body = processed.body;
      }

      console.log("📝 [displayNotification] Final processed content:", {
        title,
        body
      });

      const notificationConfig: any = {
        title,
        body,
        data: notificationData
      };

      if (Platform.OS === "android") {
        // Get current badge count and increment it for the notification
        let notificationBadgeCount = 1; // Default to 1 for new notification
        try {
          const currentBadge = await notifee.getBadgeCount();
          notificationBadgeCount = currentBadge + 1;
        } catch (error) {
          console.log(
            "⚠️ [displayNotification] Could not get current badge count, using default"
          );
          console.error(error);
        }

        notificationConfig.android = {
          channelId: this.androidChannelId,
          smallIcon: "ic_notification",
          importance: AndroidImportance.HIGH,
          pressAction: {
            id: "default"
          },
          // Add badge count to notification
          badgeCount: notificationBadgeCount,
          // Show notification count in the notification itself
          number: notificationBadgeCount,
          timestamp: Date.now(),
          showTimestamp: true,
          visibility: 1
        };
      } else if (Platform.OS === "ios") {
        notificationConfig.ios = {
          sound: "default",
          critical: false,
          foregroundPresentationOptions: {
            alert: true,
            badge: true,
            sound: true,
            banner: true,
            list: true
          }
        };
      }

      // 🔍 DUPLICATE TRACKING: Log right before Notifee display
      console.log(
        "🔍🔍🔍 [displayNotification] CALLING notifee.displayNotification() - NotificationManager",
        {
          messageId: remoteMessage.messageId,
          title: notificationConfig.title,
          body: notificationConfig.body?.substring(0, 50),
          clickAction: notificationData.click_action,
          channelUrl: notificationData.channelUrl,
          platform: Platform.OS,
          timestamp: Date.now()
        }
      );
      console.log(
        "🔔 [displayNotification] Displaying notification via Notifee"
      );
      await notifee.displayNotification(notificationConfig);
      console.log(
        "🔍🔍🔍 [displayNotification] ✅ notifee.displayNotification() COMPLETED",
        {
          messageId: remoteMessage.messageId,
          timestamp: Date.now()
        }
      );

      // For text notifications, also process the data to update Redux store (unread counts, messages)
      // This ensures badge count updates immediately when notification arrives
      // Note: We already process in onMessage, but this is a safety net for iOS native delegate path
      if (
        notificationData.click_action === "TEXT-RECEIVED" ||
        notificationData.conversationId ||
        notificationData.conversation_id ||
        notificationData.reference_id
      ) {
        console.log(
          "📱 [displayNotification] Processing text notification data for Redux update:",
          {
            reference_id: notificationData.reference_id,
            conversationId:
              notificationData.conversationId ||
              notificationData.conversation_id,
            click_action: notificationData.click_action
          }
        );
        // Process the notification to update Redux store (unread counts, messages)
        // This will trigger badge count update via SendbirdContextProvider subscription
        handleTextNotification(remoteMessage);
      }

      console.log(
        "✅ [displayNotification] Notification displayed successfully"
      );
    } catch (_error) {
      console.error(
        "❌ [displayNotification] Error displaying notification:",
        _error
      );
    }
  }

  private processNotificationContent(remoteMessage: any): {
    title: string;
    body: string;
  } {
    let sendbirdData;
    let title = "";
    let body = "";

    try {
      if (remoteMessage.data.sendbird) {
        sendbirdData =
          typeof remoteMessage.data.sendbird === "string"
            ? JSON.parse(remoteMessage.data.sendbird)
            : remoteMessage.data.sendbird;
      }
    } catch (error) {
      console.error("Error parsing sendbird data:", error);
    }

    console.log(`${Platform.OS} remoteMessage`, remoteMessage);

    if (sendbirdData) {
      const messageContent = remoteMessage.data.message || "";
      const { title: processedTitle, body: processedBody } =
        this.processSendbirdNotificationContent(
          remoteMessage.notification?.title || "",
          messageContent,
          sendbirdData
        );
      title = processedTitle;
      body = processedBody;
    } else {
      title =
        remoteMessage.notification?.title ||
        remoteMessage.data.title ||
        "New Message";
      body =
        remoteMessage.notification?.body ||
        remoteMessage.data.body ||
        remoteMessage.data.message ||
        "";
      body = this.cleanHtmlFromText(body);
    }

    return { title, body };
  }

  private processSendbirdNotificationContent(
    title: string,
    body: string,
    sendbirdData: any
  ): { title: string; body: string } {
    // Simplified: Use channel name as title, message content as body
    const notificationTitle =
      sendbirdData.channel?.name || title || "New Message";
    let notificationBody = body;

    try {
      const sendbirdType =
        (sendbirdData?.type ||
          sendbirdData?.message_type ||
          sendbirdData?.messageType) ??
        "";
      const isFileMessage =
        String(sendbirdType).toUpperCase() === "FILE" ||
        (Array.isArray(sendbirdData?.files) && sendbirdData.files.length > 0);

      // Remove sender prefix if present (format: "Sender: message")
      const colonIndex = body.indexOf(":");
      if (colonIndex > 0) {
        notificationBody = body.substring(colonIndex + 1).trim();
      } else {
        notificationBody = this.cleanHtmlFromText(body);
      }

      // Check for GIF
      if (isFileMessage) {
        notificationBody = "Received an attachment 📎";
      } else if (sendbirdData.custom_type === "MESSAGE_GIF") {
        notificationBody = "Received a GIF 🎞️";
      } else if (!notificationBody.trim()) {
        notificationBody = "Sent a message";
      }
    } catch (error) {
      console.error("Error processing notification content:", error);
    }

    return { title: notificationTitle, body: notificationBody };
  }

  private processMessageBody(
    body: string,
    senderName: string,
    sendbirdData: any
  ): string {
    const sendbirdType =
      (sendbirdData?.type ||
        sendbirdData?.message_type ||
        sendbirdData?.messageType) ??
      "";
    const isFileMessage =
      String(sendbirdType).toUpperCase() === "FILE" ||
      (Array.isArray(sendbirdData?.files) && sendbirdData.files.length > 0);

    if (isFileMessage) {
      return `${senderName}: Received an attachment 📎`;
    }

    if (sendbirdData.custom_type) {
      switch (sendbirdData.custom_type) {
        case "MESSAGE_GIF":
          return `${senderName}: Received an attachment 📎`;
        case "MEETING_INVITE":
          return `${senderName}: Invited you to a meeting`;
        default:
          return this.cleanHtmlFromText(body);
      }
    }

    return this.cleanHtmlFromText(body);
  }

  private cleanHtmlFromText(text: string): string {
    if (!text) return "";

    // Extract sender name and message content if in format "Sender: <html content>"
    const colonIndex = text.indexOf(":");
    if (colonIndex > 0) {
      const senderName = text.substring(0, colonIndex).trim();
      const messageContent = text.substring(colonIndex + 1).trim();

      // Clean the message content
      const cleanedContent = this.stripHtmlTags(messageContent);

      // Return in format "Sender: Message"
      return `${senderName}: ${cleanedContent}`;
    }

    // If not in the expected format, just clean the whole text
    return this.stripHtmlTags(text);
  }

  private stripHtmlTags(html: string): string {
    if (!html) return "";

    // Simple HTML tag removal (a more comprehensive solution would use a proper HTML parser)
    let cleaned = html.replace(/<[^>]+>/g, "");

    // Replace common HTML entities
    cleaned = cleaned.replace(/&nbsp;/g, " ");
    cleaned = cleaned.replace(/&amp;/g, "&");
    cleaned = cleaned.replace(/&lt;/g, "<");
    cleaned = cleaned.replace(/&gt;/g, ">");

    // Remove extra whitespace
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    return cleaned;
  }
}

export default new NotificationManager();
