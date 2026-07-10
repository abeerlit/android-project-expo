import { AppState, NativeModules, Platform } from "react-native";
import { VoipBridge } from "core/softphone/VoipBridge.ts";
import {
  dismissStaleAndroidVoipCall,
  shouldSkipStaleVoipPush
} from "core/notifications/voipPushStaleCheck.ts";
import { logAndroidFcmPayloadReceived } from "./androidFcmPayloadLogger.ts";

const LOG_RELEASE = true;

function logRelease(...args: unknown[]) {
  if (LOG_RELEASE) {
    console.log(...args);
  }
}

/**
 * FCM background handler — parity with bare android-project/index.js incoming-call path.
 * Chat/SMS FCM: native service forwards non-call payloads to RN via super.onMessageReceived.
 * Incoming calls: native headless when React context is null.
 */
export function registerAndroidFcmBackgroundHandlerImpl(): void {
  if (Platform.OS !== "android") return;

  const messaging = require("@react-native-firebase/messaging").default;
  const notifee = require("@notifee/react-native").default;
  const { AndroidImportance } = require("@notifee/react-native");

  messaging().setBackgroundMessageHandler(
    async (remoteMessage: {
      messageId?: string;
      data?: Record<string, string>;
      notification?: { title?: string; body?: string };
      sentTime?: number;
      ttl?: number;
      from?: string;
      collapseKey?: string;
    }) => {
      logAndroidFcmPayloadReceived(remoteMessage, "handler_entry");

      logRelease("🔔 [FCM Background] handler start", {
        messageId: remoteMessage.messageId,
        hasData: !!remoteMessage.data,
        appState: AppState.currentState
      });

      if (!remoteMessage?.data) {
        logRelease("🔔 [FCM Background] no data payload — skip", {
          hasSystemNotification: !!remoteMessage.notification,
          systemTitle: remoteMessage.notification?.title
        });
        return;
      }

      const data = remoteMessage.data;
      const vmPayloadType = data.vm_payload_type ?? "";
      const clickAction = data.click_action ?? "";

      const isCall =
        !!data.callUuid ||
        !!data.uuid ||
        vmPayloadType === "incoming_call_notification" ||
        !!data.payload_callUuid;

      if (isCall) {
        logRelease("📞 [FCM Background] INCOMING_CALL path", {
          vmPayloadType,
          clickAction,
          callUuid: data.payload_callUuid || data.callUuid || data.uuid
        });

        if (AppState.currentState !== "active") {
          try {
            const AndroidNotifications =
              NativeModules.VoxoConnectAndroidNotifications;
            const callNotifsEnabled =
              typeof AndroidNotifications?.getEnableMobileCallNotifications ===
              "function"
                ? AndroidNotifications.getEnableMobileCallNotifications()
                : true;
            if (!callNotifsEnabled) {
              logRelease(
                "📞 [FCM Background] suppressed — enableMobileCallNotifications off"
              );
              return;
            }
          } catch (e) {
            console.warn(
              "📞 [FCM Background] could not read call notification pref:",
              e
            );
          }
        }

        const callUuid =
          data.payload_callUuid || data.callUuid || data.uuid || "";
        const callerName =
          data.payload_callerName || data.callerName || "Unknown Caller";
        const callerNumber =
          data.payload_callerNumber || data.callerNumber || "Unknown Number";

        if (!callUuid) {
          console.warn("📞 [FCM Background] missing callUuid — skip");
          return;
        }

        const callData = {
          callUuid,
          callerName,
          callerNumber,
          payload: data
        };

        if (shouldSkipStaleVoipPush(data, callUuid, "FCM Background")) {
          dismissStaleAndroidVoipCall(callUuid, callData);
          return;
        }

        const voipBridge = VoipBridge.getInstance();
        const voipBridgeReady = voipBridge.isInitialized();

        logRelease("📞 [FCM Background] VoipBridge ready:", voipBridgeReady);

        if (voipBridgeReady) {
          try {
            await voipBridge.handleVoipCall(callData);
            logRelease(
              "📞 [FCM Background] handleVoipCall OK — waiting for INVITE / UI"
            );
          } catch (voipError) {
            console.error(
              "❌ [FCM Background] handleVoipCall failed:",
              voipError
            );
          }
        } else {
          const AndroidNotifications =
            NativeModules.VoxoConnectAndroidNotifications;
          if (AndroidNotifications?.startInboundCallHeadlessTask) {
            try {
              logRelease(
                "📞 [FCM Background] VoipBridge not ready — startInboundCallHeadlessTask"
              );
              await AndroidNotifications.startInboundCallHeadlessTask(
                callUuid,
                callerName,
                callerNumber,
                data
              );
              logRelease("📞 [FCM Background] headless task started");
            } catch (headlessErr) {
              console.error(
                "❌ [FCM Background] startInboundCallHeadlessTask failed:",
                headlessErr
              );
            }
          } else {
            console.warn(
              "📞 [FCM Background] no VoipBridge and no startInboundCallHeadlessTask — call may not show"
            );
          }
        }
        return;
      }

      const { processAndroidFcmBackgroundMessage } =
        require("./processAndroidFcmBackgroundMessage.ts") as {
          processAndroidFcmBackgroundMessage: (msg: typeof remoteMessage) => Promise<void>;
        };

      try {
        await processAndroidFcmBackgroundMessage(remoteMessage);
      } catch (err) {
        console.error("❌ [FCM Background] processAndroidFcmBackgroundMessage failed:", err);
      }

      void notifee
        .getNotificationSettings()
        .then((settings) => {
          if (settings.authorizationStatus !== 1) {
            console.warn(
              "⚠️ [FCM Background] notification permission not granted",
              { authorizationStatus: settings.authorizationStatus }
            );
          }
        })
        .catch((e) => {
          console.warn("[FCM Background] notifee settings check failed:", e);
        });
    }
  );
}
