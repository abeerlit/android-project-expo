import {
  NativeModules,
  Platform,
  AppState,
  AppStateStatus,
  DeviceEventEmitter
} from "react-native";
import CallKeep from "react-native-callkeep";
import { setCallActive } from "../callState";
import InCallManager from "react-native-incall-manager";
import { CallInfo, CallState } from "./types";
import { v4 as uuid } from "uuid";
import { Logger } from "shared/utils/Logger.ts";
import { hasPendingSipSession } from "./pendingSipSessions";
import { VoipBridge } from "./VoipBridge";
import { markAndroidPendingDecline, markAndroidUserDeclinedCall } from "./androidPendingDecline.ts";
import BackgroundTaskManager from "../background/BackgroundTaskManager.ts";
import {
  getDesiredCallSpeaker,
  recoverCustomNotificationPlayout,
  registerCallKeepUuidResolver,
  registerCustomNotificationCallChecker,
  reapplyDesiredCallSpeakerAndroid
} from "./androidCallAudio.ts";

const logger = new Logger("NativeIntegration: ");

/**
 * Options for initializing native call integration
 */
interface NativeIntegrationOptions {
  appName: string;
}

/**
 * NativeIntegration handles integration with native call UI
 * using CallKit on iOS and the equivalent on Android
 */
/** Resolves when iOS ringback warm-up has completed (so first outgoing call gets reliable ringback). */
const RINGBACK_WARMUP_TIMEOUT_MS = 2500;

/** Android CallKeep-only incoming (no custom notification module): auto-decline if user does not answer. */
const ANDROID_CALLKEEP_INCOMING_NO_ANSWER_MS = 20000;

/** Yield after stopping native ring before MODE_IN_COMMUNICATION (audio focus handoff). */
const ANDROID_RING_TO_INCALL_DELAY_MS = 120;

export class NativeIntegration {
  private initialized: boolean = false;
  private options: NativeIntegrationOptions;
  private activeCalls: Map<string, string> = new Map(); // Maps callUUID to callId
  private callDisplayNames: Map<string, string> = new Map(); // Maps callId to display name for ongoing notification
  private pendingActions: Map<string, Array<{ type: string; payload?: any }>> =
    new Map();
  private appState: AppStateStatus = AppState.currentState;
  private ringbackWarmUpPromise: Promise<void> | null = null;
  /** On Android, call UUIDs that use custom notification (not CallKeep). Skips CallKeep methods in updateCallState. */
  private androidCustomNotificationCalls: Set<string> = new Set();
  /** Android CallKeep fallback incoming: per-UUID no-answer timeout (see [ANDROID_CALLKEEP_INCOMING_NO_ANSWER_MS]). */
  private androidCallKeepFallbackTimeouts: Map<
    string,
    ReturnType<typeof setTimeout>
  > = new Map();
  /** FCM UUIDs where answer has started — ignore stale notification REJECT / auto-decline. */
  private answerInProgressUuids: Set<string> = new Set();
  private ringbackWarmUpResolve: (() => void) | null = null;

  /**
   * Create a new NativeIntegration instance
   * @param options Options for initializing native call integration
   */
  constructor(options: NativeIntegrationOptions) {
    this.options = options;
  }

  /**
   * Initialize native call integration
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Request display over other apps permission for Android
      if (Platform.OS === "android") {
        const hasPermission = await CallKeep.checkPhoneAccountEnabled();
        console.log(
          "📞 [NativeIntegration] Phone account enabled:",
          hasPermission
        );

        if (!hasPermission) {
          console.log(
            "⚠️ [NativeIntegration] Requesting phone account permission..."
          );
          await CallKeep.setAvailable(true);
        }
      }

      // Configure CallKeep
      await CallKeep.setup({
        ios: {
          appName: this.options.appName,
          maximumCallGroups: "3",
          maximumCallsPerCallGroup: "1",
          includesCallsInRecents: true,
          supportsVideo: false
        },
        android: {
          alertTitle: "Permissions required",
          alertDescription:
            "This application needs to access your phone accounts",
          cancelButton: "Cancel",
          okButton: "OK",
          additionalPermissions: [],
          foregroundService: {
            channelId: "co.voxo.softphone",
            channelName: "Softphone Service",
            notificationTitle: this.options.appName,
            notificationIcon: "phone_account"
          },
          imageName: "iconmask",
          selfManaged: true
        }
      });

      // Set up CallKeep event listeners
      this.setupCallKeepListeners();

      // Set up app state monitoring for background call handling
      this.setupAppStateMonitoring();

      // Initialize background task manager
      await BackgroundTaskManager.initialize();

      this.initialized = true;

      if (Platform.OS === "android") {
        registerCallKeepUuidResolver((id) => this.getCallUUIDForCallId(id));
        registerCustomNotificationCallChecker((callKeepUuid, callId) => {
          if (callKeepUuid && this.androidCustomNotificationCalls.has(callKeepUuid)) {
            return true;
          }
          if (callId) {
            const uuid = this.getCallUUIDForCallId(callId);
            if (uuid && this.androidCustomNotificationCalls.has(uuid)) {
              return true;
            }
          }
          return false;
        });
      }

      // iOS: prime InCallManager + ringback so first outgoing call gets ringback (no audible play at launch).
      if (Platform.OS === "ios") {
        this.warmUpRingbackSilent();
      }
    } catch (error) {
      console.error("Error initializing native call integration:", error);
      throw error;
    }
  }

  /**
   * iOS only: warm up InCallManager and ringback path without playing sound.
   * Run once after init so the first outgoing call plays ringback.
   * Resolves ringbackWarmUpPromise when done so startOutgoingCall can wait for it.
   */
  private warmUpRingbackSilent(): void {
    this.ringbackWarmUpPromise = new Promise<void>((resolve) => {
      this.ringbackWarmUpResolve = resolve;
    });
    const run = async () => {
      try {
        await new Promise((r) => setTimeout(r, 1500));
        InCallManager.stop();
        InCallManager.start({ media: "audio", auto: true });
        await new Promise((r) => setTimeout(r, 250));
        InCallManager.startRingback("_BUNDLE_");
        // Stop immediately so user does not hear any ring at launch — ringback only when call is placed.
        setTimeout(() => {
          InCallManager.stopRingback();
          InCallManager.stop();
          this.ringbackWarmUpResolve?.();
          this.ringbackWarmUpResolve = null;
        }, 0);
      } catch (_) {
        this.ringbackWarmUpResolve?.();
        this.ringbackWarmUpResolve = null;
      }
    };
    run();
  }

  /**
   * Display an incoming call in the native UI
   * @param callId SIP call ID
   * @param callInfo Call information
   * @returns Promise that resolves with the native call UUID
   */
  public async displayIncomingCall(
    callId: string,
    callInfo: CallInfo
  ): Promise<string> {
    if (!this.initialized) {
      throw new Error("Native call integration not initialized");
    }

    const callUUID = callInfo.callUuid || uuid();

    // Always show CallKeep UI and ringtone for incoming calls (foreground + background).
    // Ensures call screen opens and ringtone rings when app is open (web → mobile).
    try {
      // On Android, "handle" is used for TEL URI and should be numeric. On iOS, display name is fine.
      const sipUser =
        (callInfo.remoteUri?.match(/^sip:(.+)@/) || [])[1] ||
        callInfo.remoteDisplayName;
      const handle =
        Platform.OS === "android"
          ? sipUser?.replace(/\D/g, "") || sipUser || "0" // digits for TEL URI
          : callInfo.remoteDisplayName;

      console.log("📞 [NativeIntegration] Displaying incoming call:", {
        callUUID,
        handle,
        callerName: callInfo.remoteDisplayName,
        platform: Platform.OS
      });

      if (Platform.OS === "android") {
        const callerNumber = handle || "0";
        const callerName =
          callInfo.remoteDisplayName || callInfo.remoteUri || "Unknown Caller";
        const Notifications =
          NativeModules.VoxoConnectAndroidNotifications as {
            postIncomingCallNotification?: (
              uuid: string,
              num: string,
              name: string,
              secondLineMode: boolean
            ) => void;
            getEnableMobileCallNotifications?: () => boolean;
            getIncomingCallNotificationResult?: (
              uuid: string
            ) => Promise<string>;
            stopIncomingCallRingtone?: (uuid: string) => void;
            reportCallAnswered?: (uuid: string, callerName?: string) => void;
            reportIncomingCallCancelled?: (uuid: string, appInForeground?: boolean) => void;
          };

        const callNotifsEnabled =
          typeof Notifications?.getEnableMobileCallNotifications === "function"
            ? Notifications.getEnableMobileCallNotifications()
            : true;
        const appInForeground = AppState.currentState === "active";

        if (!callNotifsEnabled && !appInForeground) {
          console.log(
            "📞 [NativeIntegration] Suppressed incoming call — pref off, app not foreground"
          );
          return callUUID;
        }

        // Register for Answer/Reject before showing notification
        if (Notifications?.getIncomingCallNotificationResult) {
          Notifications.getIncomingCallNotificationResult(callUUID).then(
            (result: string) => {
              console.log(
                "📞 [NativeIntegration] Custom notification result:",
                result
              );
              if (result === "ANSWER") {
                const voipBridge = VoipBridge.getInstance();
                const isVoip =
                  voipBridge.isVoipCall(callUUID) ||
                  voipBridge.isVoipCall(callId) ||
                  hasPendingSipSession(callId) ||
                  hasPendingSipSession(callUUID);
                if (isVoip) {
                  const answerId =
                    voipBridge.isVoipCall(callUUID) ? callUUID
                    : voipBridge.isVoipCall(callId) ? callId
                    : hasPendingSipSession(callId) ? callId
                    : callUUID;
                  Notifications.stopIncomingCallRingtone?.(callUUID);
                  voipBridge.handleCallAnswer(answerId);
                } else {
                  this.onAnswerCall(callId);
                }
              } else if (result === "END_AND_ACCEPT") {
                DeviceEventEmitter.emit("SecondIncomingEndAndAccept", {
                  incomingCallId: callId,
                  incomingCallUuid: callUUID,
                  callerName
                });
              } else if (result === "REJECT" || result === "CANCEL") {
                if (this.shouldIgnoreIncomingNotificationReject(callUUID)) {
                  console.warn(
                    `📞 [NI] Ignoring notification ${result} for ${callUUID} — answer already in progress`
                  );
                  return;
                }
                // Dismiss UI immediately; mark so a late INVITE is auto-declined.
                markAndroidPendingDecline(callUUID);
                markAndroidUserDeclinedCall({
                  callUuid: callUUID,
                  sipCallId: callId,
                  callerNumber: callerNumber
                });
                const appInForeground = AppState.currentState === "active";
                Notifications.reportIncomingCallCancelled?.(
                  callUUID,
                  appInForeground
                );
                const voipBridge = VoipBridge.getInstance();
                // Prefer direct SIP decline on mapped session (603 via SessionManager).
                if (this.activeCalls.has(callUUID)) {
                  this.onEndCall(callId);
                } else if (voipBridge.isVoipCall(callUUID)) {
                  voipBridge.handleCallEnd(callUUID);
                } else if (voipBridge.isVoipCall(callId)) {
                  voipBridge.handleCallEnd(callId);
                } else if (
                  hasPendingSipSession(callId) ||
                  hasPendingSipSession(callUUID)
                ) {
                  voipBridge.handleCallEnd(
                    hasPendingSipSession(callId) ? callId : callUUID
                  );
                } else {
                  this.onEndCall(callId);
                }
                this.activeCalls.delete(callUUID);
                this.androidCustomNotificationCalls.delete(callUUID);
              }
            }
          );
        }

        if (callNotifsEnabled && Notifications?.postIncomingCallNotification) {
          this.androidCustomNotificationCalls.add(callUUID);
          const secondLineMode =
            callInfo.useEndAndAcceptSecondLine === true;
          Notifications.postIncomingCallNotification(
            callUUID,
            callerNumber,
            callerName,
            secondLineMode
          );
          console.log(
            "✅ [NativeIntegration] Displayed incoming call via custom notification"
          );
        } else if (!callNotifsEnabled) {
          console.log(
            "📞 [NativeIntegration] Foreground in-app incoming call — native tray notification skipped (pref off)"
          );
        } else {
          // Fallback to CallKeep if module unavailable
          CallKeep.displayIncomingCall(
            callUUID,
            handle,
            callInfo.remoteDisplayName || handle,
            "generic",
            false
          );
          console.log(
            "✅ [NativeIntegration] Displayed incoming call via CallKeep (fallback)"
          );
          this.clearAndroidCallKeepFallbackTimeout(callUUID);
          this.androidCallKeepFallbackTimeouts.set(
            callUUID,
            setTimeout(() => {
              this.androidCallKeepFallbackTimeouts.delete(callUUID);
              if (!this.activeCalls.has(callUUID)) {
                return;
              }
              const voipBridge = VoipBridge.getInstance();
              if (voipBridge.isVoipCall(callUUID)) {
                voipBridge.handleCallEnd(callUUID);
              } else if (voipBridge.isVoipCall(callId)) {
                voipBridge.handleCallEnd(callId);
              } else if (
                hasPendingSipSession(callId) ||
                hasPendingSipSession(callUUID)
              ) {
                voipBridge.handleCallEnd(
                  hasPendingSipSession(callId) ? callId : callUUID
                );
              } else {
                this.onEndCall(callId);
              }
              this.activeCalls.delete(callUUID);
              this.androidCustomNotificationCalls.delete(callUUID);
              try {
                InCallManager.stopRingtone();
                InCallManager.stop();
              } catch (_) {
                /* ignore */
              }
              try {
                CallKeep.endCall(callUUID);
              } catch (_) {
                /* ignore */
              }
            }, ANDROID_CALLKEEP_INCOMING_NO_ANSWER_MS)
          );
        }
      } else {
        // iOS: CallKeep
        CallKeep.displayIncomingCall(
          callUUID,
          handle,
          callInfo.remoteDisplayName || handle, // localizedCallerName
          "generic", // Handle Type (iOS only)
          false // hasVideo
        );
        console.log(
          "✅ [NativeIntegration] Displayed incoming call via CallKeep"
        );
      }

      // Android: native ring only when tray notification is posted; foreground-only uses InCallManager.
      const androidNotifications =
        NativeModules.VoxoConnectAndroidNotifications as {
          postIncomingCallNotification?: unknown;
          getEnableMobileCallNotifications?: () => boolean;
        } | undefined;
      const androidCallNotifsEnabled =
        Platform.OS !== "android" ||
        typeof androidNotifications?.getEnableMobileCallNotifications !==
          "function" ||
        androidNotifications.getEnableMobileCallNotifications();
      const useNativeAndroidIncomingRing =
        Platform.OS === "android" &&
        androidCallNotifsEnabled &&
        !!androidNotifications?.postIncomingCallNotification;

      if (useNativeAndroidIncomingRing) {
        InCallManager.stopRingtone();
        InCallManager.stopRingback();
        try {
          InCallManager.stop();
        } catch {
          /* ignore */
        }
      } else {
        // Ensure clean audio state before starting ringtone (prevents overlap from previous call)
        InCallManager.stopRingtone();
        InCallManager.stopRingback();
        InCallManager.stop();
        // Play ringtone for incoming call (Android: _DEFAULT_, iOS: _BUNDLE_ incallmanager_ringtone.mp3)
        const ringtone = Platform.OS === "android" ? "_DEFAULT_" : "_BUNDLE_";
        if (Platform.OS === "ios") {
          console.warn(
            `🔊 [NI-RINGBACK] ${new Date().toISOString()} displayIncomingCall: iOS starting ringtone (_BUNDLE_)`
          );
        }
        // Android VibrationEffect requires at least one non-zero timing — never pass []. Use valid pattern or undefined for no vibration.
        const vibratePattern: number | number[] =
          Platform.OS === "android"
            ? [0, 1000, 500, 1000] // delay 0ms, vibrate 1s, pause 500ms, vibrate 1s (repeat until stop)
            : 0;

        InCallManager.startRingtone(ringtone, vibratePattern, "default", -1);
        if (Platform.OS === "ios") {
          console.warn(
            `🔊 [NI-RINGBACK] ${new Date().toISOString()} displayIncomingCall: startRingtone() done`
          );
        }
      }

      // Map the native call UUID to the SIP call ID
      this.activeCalls.set(callUUID, callId);
      this.callDisplayNames.set(callId, callInfo.remoteDisplayName || callInfo.remoteUri || "Unknown");
      console.warn(
        `📞 [NI] ${new Date().toISOString()} displayIncomingCall: stored mapping callUUID=${callUUID} → callId=${callId} | activeCalls size=${
          this.activeCalls.size
        }`
      );

      // Process any pending actions for this UUID
      const pending = this.pendingActions.get(callUUID);
      if (pending) {
        logger.debug(
          `Processing ${pending.length} pending actions for ${callUUID}`
        );
        for (const action of pending) {
          switch (action.type) {
            case "answerCall": {
              const voipBridge = VoipBridge.getInstance();
              // Treat as VoIP if VoipBridge tracks it OR if a pending SlimSipClient session exists.
              if (voipBridge.isVoipCall(callId) || hasPendingSipSession(callId)) {
                voipBridge.handleCallAnswer(callId);
              } else {
                this.onAnswerCall(callId);
              }
              break;
            }
            case "endCall":
              {
                const voipBridge = VoipBridge.getInstance();
                if (voipBridge.isVoipCall(callId) || hasPendingSipSession(callId)) {
                  voipBridge.handleCallEnd(callId);
                } else {
                  this.onEndCall(callId);
                }
              }
              break;
            case "setMutedCall":
              if (action.payload?.muted) {
                this.onMuteCall(callId);
              } else {
                this.onUnmuteCall(callId);
              }
              break;
            case "DTMF":
              this.onSendDTMF(callId, action.payload?.digits);
              break;
          }
        }
        this.pendingActions.delete(callUUID);
      }

      return callUUID;
    } catch (error) {
      console.error("Error displaying incoming call:", error);
      throw error;
    }
  }

  /**
   * Start an outgoing call in the native UI
   * @param callId SIP call ID
   * @param destination Destination phone number or SIP URI
   * @param localizedCallerName Optional contact name (e.g. attended transfer / address book)
   * @returns Promise that resolves with the native call UUID
   */
  public async startOutgoingCall(
    callId: string,
    destination: string,
    localizedCallerName?: string
  ): Promise<string> {
    const ts = () => new Date().toISOString();
    const label = localizedCallerName?.trim();
    console.warn(
      `🔊 [NI-RINGBACK] ${ts()} startOutgoingCall ENTER platform=${
        Platform.OS
      } callId=${callId} destination=${destination} label=${
        label ?? "none"
      } initialized=${this.initialized}`
    );

    if (!this.initialized) {
      throw new Error("Native call integration not initialized");
    }

    try {
      // Generate a UUID for the native call
      const callUUID = uuid();

      const contactIdentifier = label || destination;
      CallKeep.startCall(
        callUUID,
        destination,
        contactIdentifier,
        "generic",
        false
      );
      console.warn(`🔊 [NI-RINGBACK] ${ts()} CallKeep.startCall done`);
      if (label && Platform.OS === "ios") {
        try {
          CallKeep.updateDisplay(callUUID, label, destination);
        } catch (updateErr) {
          console.warn(
            `🔊 [NI-RINGBACK] ${ts()} CallKeep.updateDisplay failed (non-fatal):`,
            updateErr
          );
        }
      }

      // iPhone only: play bundled "brrr brrr" ringback (incallmanager_ringback.mp3) for outgoing. Stopped when call is picked or ends.
      if (Platform.OS === "ios") {
        try {
          // Wait for silent warm-up to finish so ringback is reliable on first call (with timeout so we never block long).
          await Promise.race([
            this.ringbackWarmUpPromise ?? Promise.resolve(),
            new Promise((r) => setTimeout(r, RINGBACK_WARMUP_TIMEOUT_MS))
          ]);
          // Reset native InCallManager so start() actually runs (otherwise it returns early if _audioSessionInitialized). Fixes first-call-after-restart no ringback.
          console.log(
            `🔊 [NI-RINGBACK] ${ts()} iOS: InCallManager.stop() to ensure fresh audio session for ringback...`
          );
          InCallManager.stop();
          console.log(
            `🔊 [NI-RINGBACK] ${ts()} iOS: stopping any existing ringtone/ringback...`
          );
          InCallManager.stopRingtone();
          InCallManager.stopRingback();
          console.log(
            `🔊 [NI-RINGBACK] ${ts()} iOS: stopRingtone/stopRingback done`
          );

          // Start audio session without ringback first so session is fully active (native start() with ringback can play too early on first launch and fail).
          console.log(
            `🔊 [NI-RINGBACK] ${ts()} iOS: InCallManager.start({ media: 'audio', auto: true }) — no ringback yet...`
          );
          InCallManager.start({
            media: "audio",
            auto: true
          });
          console.log(
            `🔊 [NI-RINGBACK] ${ts()} iOS: InCallManager.start() done`
          );

          // Delay so audio session is fully active before ringback (required for first call after app restart).
          await new Promise((r) => setTimeout(r, 220));
          console.log(
            `🔊 [NI-RINGBACK] ${ts()} iOS: InCallManager.startRingback('_BUNDLE_')...`
          );
          InCallManager.startRingback("_BUNDLE_");
          console.log(
            `🔊 [NI-RINGBACK] ${ts()} iOS: startRingback() returned. If no sound: check Xcode console for RNInCallManager.startRingback() and 'no available media' (bundle file missing) or session errors.`
          );
        } catch (ringbackError) {
          console.error(
            `🔊 [NI-RINGBACK] ${ts()} iOS: ERROR during ringback setup:`,
            ringbackError
          );
        }
      } else if (Platform.OS === "android") {
        try {
          console.log(
            `🔊 [NI-RINGBACK] ${ts()} Android: starting InCallManager and ringback (_DTMF_ = proper brr-brr tone)...`
          );
          InCallManager.stopRingtone();
          InCallManager.stopRingback();
          InCallManager.stop();
          InCallManager.start({ media: "audio" });
          await new Promise((r) => setTimeout(r, 150));
          // Use _DTMF_ — ToneGenerator.TONE_CDMA_NETWORK_USA_RINGBACK (proper brr-brr).
          // _BUNDLE_ falls back to DEFAULT_RINGTONE_URI when incallmanager_ringback.mp3 isn't found,
          // which plays the incoming-call ringtone instead of ringback.
          InCallManager.startRingback("_DTMF_");
          console.log(
            `🔊 [NI-RINGBACK] ${ts()} Android: startRingback(_DTMF_) done`
          );
        } catch (ringbackError) {
          console.error(
            `🔊 [NI-RINGBACK] ${ts()} Android: ERROR during ringback setup:`,
            ringbackError
          );
        }
      } else {
        console.log(
          `🔊 [NI-RINGBACK] ${ts()} Skipping ringback (platform=${Platform.OS})`
        );
      }

      // Map the native call UUID to the SIP call ID
      this.activeCalls.set(callUUID, callId);
      this.callDisplayNames.set(callId, label || destination);
      console.warn(
        `📞 [NI] ${ts()} startOutgoingCall: stored mapping callUUID=${callUUID} → callId=${callId} | activeCalls size=${
          this.activeCalls.size
        }`
      );

      return callUUID;
    } catch (error) {
      console.error(`🔊 [NI-RINGBACK] ${ts()} startOutgoingCall ERROR:`, error);
      throw error;
    }
  }

  /**
   * Update the call state in the native UI
   * @param callId SIP call ID
   * @param state Call state
   */
  public async updateCallState(
    callId: string,
    state: CallState
  ): Promise<void> {
    console.warn(
      `📞 [NI] ${new Date().toISOString()} updateCallState called: callId=${callId} state=${state} initialized=${
        this.initialized
      }`
    );
    if (!this.initialized) {
      console.warn(`📞 [NI] ⚠️ updateCallState SKIPPED - not initialized`);
      return;
    }

    const callUUID = this.getCallUUID(callId);

    try {
      if (state === CallState.ENDED || state === CallState.FAILED) {
        console.warn(
          `🔊 [NI-RINGBACK] ${new Date().toISOString()} updateCallState received ENDED/FAILED — will stop ringback soon. If this appears right after startRingback, the call failed immediately.`
        );
      }
      switch (state) {
        case CallState.CONNECTED:
          // Always stop ringtone when call connects (foreground or background)
          InCallManager.stopRingtone();
          InCallManager.stopRingback();
          if (callUUID) {

            const usedCustomNotification =
              Platform.OS === "android" &&
              this.androidCustomNotificationCalls.has(callUUID);

            if (!usedCustomNotification) {

              CallKeep.setCurrentCallActive(callUUID);
              // Clear hold state when call becomes active (e.g. after unhold)
              CallKeep.setOnHold(callUUID, false);

            }
            const Notifications =
              NativeModules.VoxoConnectAndroidNotifications as {
                stopIncomingCallRingtone?: (uuid: string) => void;
                reportCallAnswered?: (uuid: string, name?: string) => void;
                updateCallActivityUi?: () => void;
                showOngoingCallNotification?: (uuid: string, name: string) => void;
              };

            if (usedCustomNotification) {
              const callerName = this.callDisplayNames.get(callId) || "Unknown";
              const inAppAnswer = this.answerInProgressUuids.has(callUUID);
              // markIncomingAnswerStarted already stopped ring + reset route at Accept — repeating
              // stopIncomingCallRingtone on CONNECTED flushes MODE_NORMAL mid-WebRtcAudioTrack playout.
              if (!inAppAnswer) {
                Notifications?.stopIncomingCallRingtone?.(callUUID);
                Notifications?.reportCallAnswered?.(callUUID, callerName);
              } else {
                console.warn(
                  `📞 [NI] ${new Date().toISOString()} CONNECTED: skip stopIncomingCallRingtone — already stopped at answer`
                );
              }
              Notifications?.updateCallActivityUi?.();
            }

            const applyConnectedAudio = () => {
              if (Platform.OS !== "android") {
                InCallManager.start({
                  media: "audio",
                  auto: true,
                  ringback: ""
                });
                return;
              }

              const inAppAnswer =
                usedCustomNotification &&
                this.answerInProgressUuids.has(callUUID);

              if (!inAppAnswer) {
                // Notification UI answer without markIncomingAnswerStarted — stop ring once here.
                Notifications?.stopIncomingCallRingtone?.(callUUID);
                InCallManager.start({
                  media: "audio",
                  auto: false,
                  ringback: ""
                });
                console.warn(
                  `📞 [NI] ${new Date().toISOString()} CONNECTED: InCallManager.start (notification answer path)`
                );
              } else {
                console.warn(
                  `📞 [NI] ${new Date().toISOString()} CONNECTED: skip InCallManager.start — SessionManager already started after ring stop`
                );
              }

              const speakerOn = getDesiredCallSpeaker();
              const schedulePlayoutRecovery = (delayMs: number) => {
                setTimeout(() => {
                  recoverCustomNotificationPlayout(
                    `[NI-CONNECTED] +${delayMs}ms`,
                    callId,
                    callUUID,
                    speakerOn
                  );
                }, delayMs);
              };

              if (usedCustomNotification) {
                // Defer until WebRtcAudioTrack startPlayout — setAudioDevice races break long-ring output.
                schedulePlayoutRecovery(200);
                schedulePlayoutRecovery(600);
              } else if (speakerOn) {
                reapplyDesiredCallSpeakerAndroid("[NI-CONNECTED]", callId, callUUID);
                setTimeout(
                  () =>
                    reapplyDesiredCallSpeakerAndroid("[NI-CONNECTED]", callId, callUUID),
                  350
                );
              }

              const callerName = this.callDisplayNames.get(callId) || "Unknown";
              Notifications?.showOngoingCallNotification?.(callUUID, callerName);
            };

            if (Platform.OS === "android" && usedCustomNotification) {
              const inAppAnswer = this.answerInProgressUuids.has(callUUID);
              if (inAppAnswer) {
                setTimeout(applyConnectedAudio, 200);
              } else {
                setTimeout(
                  applyConnectedAudio,
                  ANDROID_RING_TO_INCALL_DELAY_MS + 200
                );
              }
            } else {
              applyConnectedAudio();
            }

          }
          console.warn(
            `🔊 [NI-RINGBACK] ${new Date().toISOString()} CONNECTED: stopRingtone/stopRingback done`
          );
          break;

        case CallState.ENDED:
        case CallState.FAILED: {
          setCallActive(false);
          this.clearIncomingAnswerGuard(callId);
          InCallManager.stopRingtone();
          InCallManager.stopRingback();
          this.callDisplayNames.delete(callId);

          const uuidToEnd = callUUID ?? this.clearCallFromActiveCalls(callId);

          const usedCustomNotification =
            uuidToEnd &&
            Platform.OS === "android" &&
            this.androidCustomNotificationCalls.has(uuidToEnd);

          if (callUUID) {
            this.activeCalls.delete(callUUID);
          }

          if (uuidToEnd) {
            this.androidCustomNotificationCalls.delete(uuidToEnd);
          }

          // Android: always use reportCallEnded for teardown when we have a UUID.
          // cancelCallNotification only nm.cancel() + map remove; it does not stopForeground().
          // Custom and non-custom flows may still own a foreground notification id in the native map.
          if (Platform.OS === "android" && uuidToEnd) {
            const Notifications = NativeModules.VoxoConnectAndroidNotifications as {
              reportCallEnded?: (u: string, fg?: boolean) => void;
            };
            const appInForeground = AppState.currentState === "active";
            Notifications?.reportCallEnded?.(uuidToEnd, appInForeground);
          }

          // Only dismiss all when no mapped calls remain; otherwise refresh ongoing for the remaining leg.
          if (Platform.OS === "android") {
            const Notifications = NativeModules.VoxoConnectAndroidNotifications;
            if (this.activeCalls.size === 0) {
              Notifications?.dismissOngoingCallNotification?.();
            } else {
              const firstEntry = this.activeCalls.entries().next().value as
                | [string, string]
                | undefined;
              if (firstEntry) {
                const [remainingUuid, remainingCallId] = firstEntry;
                const callerName =
                  this.callDisplayNames.get(remainingCallId) || "Unknown";
                Notifications?.showOngoingCallNotification?.(
                  remainingUuid,
                  callerName
                );
              }
            }
          }

          if (uuidToEnd && !usedCustomNotification) {

            CallKeep.reportEndCallWithUUID(
              uuidToEnd,
              state === CallState.FAILED ? 1 : 2
            );

            CallKeep.endCall(uuidToEnd);
          }
          
          if (this.activeCalls.size === 0) {
            InCallManager.stop();
            CallKeep.endAllCalls();
            BackgroundTaskManager.endBackgroundTask();
          }

          break;
        }

        case CallState.HOLDING:
          if (callUUID) {
            CallKeep.setOnHold(callUUID, true);
          }
          break;
      }
    } catch (error) {
      console.error("📞 [NI] ❌ Error updating call state:", error);
    }
  }

  /**
   * Update the mute state in the native UI
   * @param callId SIP call ID
   * @param muted Whether the call should be muted
   */
  public async updateMuteState(callId: string, muted: boolean): Promise<void> {
    if (!this.initialized) {
      return;
    }

    // Find the native call UUID for the SIP call ID
    const callUUID = this.getCallUUID(callId);
    if (!callUUID) {
      return;
    }

    try {
      CallKeep.setMutedCall(callUUID, muted);
    } catch (error) {
      console.error("Error updating mute state:", error);
    }
  }

  /**
   * Event handlers - these should be overridden by the softphone
   */
  public onAnswerCall: (callId: string) => void = () => {};

  public onEndCall: (callId: string) => void = () => {};

  public onMuteCall: (callId: string) => void = () => {};

  public onUnmuteCall: (callId: string) => void = () => {};

  public onSendDTMF: (callId: string, digits: string) => void = () => {};

  /**
   * Set up app state monitoring for background call handling
   */
  private setupAppStateMonitoring(): void {
    AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      logger.debug(
        `App state changed from ${this.appState} to ${nextAppState}`
      );

      if (
        this.appState.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // App has come to the foreground
        logger.debug("App resumed from background - checking active calls");
        this.handleAppResume();
      } else if (
        this.appState === "active" &&
        nextAppState.match(/inactive|background/)
      ) {
        // App is going to background
        logger.debug("App going to background - maintaining call state");
        this.handleAppBackground();
      }

      this.appState = nextAppState;
    });
  }

  /**
   * Handle app resuming from background
   */
  private handleAppResume(): void {
    // Check if there are any active calls that need to be restored
    if (this.activeCalls.size > 0) {
      logger.debug(
        `Restoring ${this.activeCalls.size} active calls from background`
      );
      // The call state should be maintained by CallKit and the softphone
    }
  }

  /**
   * Handle app going to background
   */
  private handleAppBackground(): void {
    if (this.activeCalls.size > 0) {
      logger.debug(
        `Maintaining ${this.activeCalls.size} active calls in background`
      );
      // Start background task to maintain call state
      BackgroundTaskManager.startBackgroundTask();
      // Show ongoing call notification on Android when user backgrounds during a call (we skipped it when CONNECTED in foreground)
      if (Platform.OS === "android") {
        const firstEntry = this.activeCalls.entries().next().value as [string, string] | undefined;
        if (firstEntry) {
          const [callUUID, callId] = firstEntry;
          const callerName = this.callDisplayNames.get(callId) || "Unknown";
          const Notifications = NativeModules.VoxoConnectAndroidNotifications;
          Notifications?.showOngoingCallNotification?.(callUUID, callerName);
        }
      }
    }
  }

  private clearAndroidCallKeepFallbackTimeout(callUUID: string): void {
    const key = [...this.androidCallKeepFallbackTimeouts.keys()].find(
      (k) => k.toLowerCase() === callUUID.toLowerCase()
    );
    if (key) {
      clearTimeout(this.androidCallKeepFallbackTimeouts.get(key)!);
      this.androidCallKeepFallbackTimeouts.delete(key);
    }
  }

  /**
   * Set up CallKeep event listeners
   */
  private setupCallKeepListeners(): void {
    // Handle incoming calls answered from native UI
    // Handle incoming calls answered from native UI
    CallKeep.addEventListener("answerCall", ({ callUUID }) => {
      this.clearAndroidCallKeepFallbackTimeout(callUUID);
      console.log(
        "🔵 [NativeIntegration] 📞 ⚡ CallKeep answerCall event received:",
        {
          callUUID,
          timestamp: new Date().toISOString(),
          appState: this.appState,
          activeCallsSize: this.activeCalls.size,
          activeCallsKeys: Array.from(this.activeCalls.keys()),
          activeCallsEntries: Array.from(this.activeCalls.entries()).map(
            ([uuid, id]) => ({ uuid, id })
          )
        }
      );

      // Handle answer call from native UI
      let callId = this.activeCalls.get(callUUID);

      // iOS CallKit may uppercase the UUID. Try case-insensitive lookup.
      if (!callId) {
        const lowerUUID = callUUID.toLowerCase();
        for (const [storedUUID, storedCallId] of this.activeCalls.entries()) {
          if (storedUUID.toLowerCase() === lowerUUID) {
            callId = storedCallId;
            break;
          }
        }
      }

      // iOS killed state: displayIncomingCall was skipped so activeCalls has no mapping.
      // Check VoipBridge directly - it tracks VoIP calls by UUID from the push payload.
      if (!callId && Platform.OS === "ios") {
        const voipBridge = VoipBridge.getInstance();
        const lowerUUID = callUUID.toLowerCase();

        // Try exact match first, then lowercase
        if (voipBridge.isVoipCall(callUUID)) {
          callId = callUUID;
        } else if (voipBridge.isVoipCall(lowerUUID)) {
          callId = lowerUUID;
        }

        if (callId) {
          console.log(
            "🔵 [NativeIntegration] 📞 iOS: Found VoIP call via VoipBridge (killed state):",
            { callUUID, resolvedCallId: callId }
          );
          // Register the mapping for future use
          this.activeCalls.set(callUUID, callId);
        }
      }

      console.log("🔵 [NativeIntegration] 📞 UUID to callId mapping:", {
        callUUID,
        callId,
        found: !!callId
      });

      if (callId) {
        const voipBridge = VoipBridge.getInstance();
        // Treat as VoIP if VoipBridge tracks it OR if there's a pending SlimSipClient session.
        // VoipBridge.voipCalls can be cleared if VoipBridge was disposed/recreated (e.g. effect
        // re-run), but pendingSipSessions persists - so check both for robustness.
        const isVoip =
          voipBridge.isVoipCall(callId) || hasPendingSipSession(callId);
        console.log("🔵 [NativeIntegration] 📞 Call type check:", {
          callId,
          isVoip,
          hasPendingSession: hasPendingSipSession(callId),
          platform: Platform.OS,
          willCall: isVoip ? "voipBridge.handleCallAnswer" : "this.onAnswerCall"
        });

        if (isVoip) {
          console.log(
            "🔵 [NativeIntegration] 📞 VoIP call answered, calling voipBridge.handleCallAnswer:",
            callId
          );
          voipBridge.handleCallAnswer(callId);
          console.log(
            "🔵 [NativeIntegration] 📞 ✅ voipBridge.handleCallAnswer called"
          );

          // Return for VoIP calls on both platforms.
          // The SIP session establishment and answering is handled by
          // handleVoipAnswer in SoftphoneProvider (via answerVoipCall event).
          // Calling onAnswerCall here would fail because the SIP session
          // doesn't exist yet (especially in killed state).
          return;
        }

        console.log(
          "🔵 [NativeIntegration] 📞 Calling this.onAnswerCall:",
          callId
        );
        this.onAnswerCall(callId);
        console.log("🔵 [NativeIntegration] 📞 ✅ this.onAnswerCall called");
      } else {
        logger.warn(
          `Received answerCall for unknown UUID ${callUUID}, queuing`
        );
        console.log(
          "🔵 [NativeIntegration] 📞 ⚠️ Unknown UUID, queuing answerCall action:",
          {
            callUUID,
            activeCallsMap: Array.from(this.activeCalls.entries())
          }
        );
        if (!this.pendingActions.has(callUUID)) {
          this.pendingActions.set(callUUID, []);
        }
        this.pendingActions.get(callUUID)?.push({ type: "answerCall" });
      }
    });

    // Handle calls ended from native UI
    CallKeep.addEventListener("endCall", ({ callUUID }) => {
      this.clearAndroidCallKeepFallbackTimeout(callUUID);
      console.warn(
        `📞 [NI] ${new Date().toISOString()} CallKeep endCall event: callUUID=${callUUID} activeCalls=${JSON.stringify(
          Array.from(this.activeCalls.entries())
        )}`
      );
      let callId = this.activeCalls.get(callUUID);

      // Case-insensitive UUID lookup (iOS CallKit may uppercase)
      if (!callId) {
        const lowerUUID = callUUID.toLowerCase();
        for (const [storedUUID, storedCallId] of this.activeCalls.entries()) {
          if (storedUUID.toLowerCase() === lowerUUID) {
            callId = storedCallId;
            console.warn(
              `📞 [NI] endCall: case-insensitive match found: ${storedUUID} → ${storedCallId}`
            );
            break;
          }
        }
      }

      // iOS killed state fallback: check VoipBridge directly
      if (!callId && Platform.OS === "ios") {
        const voipBridge = VoipBridge.getInstance();
        const lowerUUID = callUUID.toLowerCase();
        if (voipBridge.isVoipCall(callUUID)) {
          callId = callUUID;
        } else if (voipBridge.isVoipCall(lowerUUID)) {
          callId = lowerUUID;
        }
        if (callId) {
          console.warn(
            `📞 [NI] endCall: VoipBridge fallback found callId=${callId}`
          );
        }
      }

      if (callId) {
        // Check if this is a VoIP call
        // VoIP calls use callUUID as callId; SessionManager uses different IDs.
        // When callId === callUUID (case-insensitive), treat as VoIP so we properly
        // terminate the SIP session when user hangs up from lock screen or power button.
        const voipBridge = VoipBridge.getInstance();
        const isVoipCall =
          voipBridge.isVoipCall(callId) ||
          hasPendingSipSession(callId) ||
          (Platform.OS === "ios" &&
            callId.toLowerCase() === callUUID.toLowerCase());

        if (isVoipCall) {
          console.warn(
            `📞 [NI] endCall: VoIP call → voipBridge.handleCallEnd(${callId})`
          );
          voipBridge.handleCallEnd(callId);
        } else {
          console.warn(`📞 [NI] endCall: SIP call → this.onEndCall(${callId})`);
          this.onEndCall(callId);
        }
        this.activeCalls.delete(callUUID);
        console.warn(
          `📞 [NI] endCall: removed ${callUUID} from activeCalls. Remaining: ${this.activeCalls.size}`
        );
      } else {
        // Unknown UUID - usually means we already ended this call ourselves
        logger.debug(
          `Received endCall for unknown UUID ${callUUID}, ignoring (likely already ended)`
        );
      }
    });

    // Handle calls muted from native UI
    CallKeep.addEventListener(
      "didPerformSetMutedCallAction",
      ({ callUUID, muted }) => {
        const callId = this.activeCalls.get(callUUID);
        if (callId) {
          // Emit event to be handled by the softphone
          if (muted) {
            this.onMuteCall(callId);
          } else {
            this.onUnmuteCall(callId);
          }
        }
      }
    );

    // Handle DTMF tones from native UI
    // CallKeep.addEventListener(
    //   "didReceiveStartCallAction",
    //   ({ callUUID, handle }) => {
    //     // This is for outgoing calls initiated from the native UI
    //     // Not implemented in this version
    //   }
    // );

    // Handle DTMF tones from native UI
    CallKeep.addEventListener(
      "didPerformDTMFAction",
      ({ callUUID, digits }) => {
        const callId = this.resolveCallIdForCallKeepUUID(callUUID);
        if (callId && digits != null && String(digits).length > 0) {
          this.onSendDTMF(callId, String(digits));
        }
      }
    );
  }

  private resolveCallIdForCallKeepUUID(callUUID: string): string | undefined {
    const callId = this.activeCalls.get(callUUID);
    if (callId) {
      return callId;
    }
    const lowerUUID = callUUID.toLowerCase();
    for (const [storedUUID, storedCallId] of this.activeCalls.entries()) {
      if (storedUUID.toLowerCase() === lowerUUID) {
        return storedCallId;
      }
    }
    return undefined;
  }

  /**
   * Get the native call UUID for a SIP call ID
   * @param callId SIP call ID
   * @returns Native call UUID or undefined if not found
   */
  private getCallUUID(callId: string): string | undefined {
    for (const [uuid, id] of this.activeCalls.entries()) {
      if (id === callId) {
        return uuid;
      }
    }
    // SessionManager uses SIP.js invitation.id (Call-ID + from tag); UI/VoIP often pass raw Call-ID / FCM UUID only.
    for (const [uuid, id] of this.activeCalls.entries()) {
      if (id.startsWith(callId) && callId.length >= 8) {
        return uuid;
      }
      if (callId.startsWith(id) && id.length >= 8) {
        return uuid;
      }
    }
    if (this.activeCalls.has(callId)) {
      return callId;
    }
    return undefined;
  }

  /**
   * Resolve CallKeep UUID for a SIP session id (DTMF, native UI).
   */
  public getCallUUIDForCallId(callId: string): string | undefined {
    return this.getCallUUID(callId);
  }

  /**
   * Android: user started answering — cancel native auto-decline and ignore stale REJECT.
   * Call as early as possible (InCallScreen Accept, notification Answer, handleVoipAnswer).
   */
  public markIncomingAnswerStarted(
    callIdOrUuid: string,
    callerName?: string
  ): void {
    if (Platform.OS !== "android") {
      return;
    }
    const callUUID =
      this.getCallUUID(callIdOrUuid) ??
      (this.activeCalls.has(callIdOrUuid) ? callIdOrUuid : callIdOrUuid);
    this.answerInProgressUuids.add(callUUID);

    const mappedCallId = this.activeCalls.get(callUUID);
    const displayName =
      callerName?.trim() ||
      (mappedCallId
        ? this.callDisplayNames.get(mappedCallId)
        : undefined) ||
      this.callDisplayNames.get(callIdOrUuid) ||
      "Unknown";

    const Notifications = NativeModules.VoxoConnectAndroidNotifications as {
      stopIncomingCallRingtone?: (uuid: string) => void;
      reportCallAnswered?: (uuid: string, name?: string) => void;
    };
    try {
      // Stop STREAM_RING synchronously before getUserMedia / WebRTC grabs audio focus.
      Notifications?.stopIncomingCallRingtone?.(callUUID);
      Notifications?.reportCallAnswered?.(callUUID, displayName);
    } catch (e) {
      console.warn("[NI] markIncomingAnswerStarted reportCallAnswered failed:", e);
    }
    console.warn(
      `📞 [NI] markIncomingAnswerStarted callUUID=${callUUID} (from ${callIdOrUuid})`
    );
  }

  private clearIncomingAnswerGuard(callIdOrUuid: string): void {
    const callUUID =
      this.getCallUUID(callIdOrUuid) ??
      (this.activeCalls.has(callIdOrUuid) ? callIdOrUuid : callIdOrUuid);
    this.answerInProgressUuids.delete(callUUID);
  }

  private shouldIgnoreIncomingNotificationReject(callUUID: string): boolean {
    return this.answerInProgressUuids.has(callUUID);
  }

  /**
   * Kill-state answer: native custom notification owns the call (no CallKeep displayIncomingCall).
   * Registers UUID ↔ SIP session mapping for speaker/DTMF and marks custom-notification routing.
   */
  public registerHeadlessCallMapping(
    callUuid: string,
    sipSessionId: string,
    displayName?: string
  ): void {
    this.activeCalls.set(callUuid, sipSessionId);
    this.androidCustomNotificationCalls.add(callUuid);
    if (displayName) {
      this.callDisplayNames.set(sipSessionId, displayName);
    }
    console.warn(
      `📞 [NI] registerHeadlessCallMapping callUUID=${callUuid} → callId=${sipSessionId}`
    );
  }

  /**
   * Remove a call from activeCalls by callId or callUUID.
   * Handles VoIP flow where callId === callUUID, and ensures cleanup on every end flow.
   */
  private clearCallFromActiveCalls(callIdOrUuid: string): string | undefined {
    let deletedUuid: string | undefined;
    for (const [uuid, id] of Array.from(this.activeCalls.entries())) {
      if (id === callIdOrUuid || uuid === callIdOrUuid) {
        this.activeCalls.delete(uuid);
        deletedUuid = uuid;
        break;
      }
    }
    return deletedUuid;
  }

  /**
   * Remove a call from activeCalls and dismiss Android ongoing notification.
   * Used when remote hangs up to guarantee cleanup (avoids notification reappearing on lock/unlock).
   * Safe to call even if call was already removed.
   */
  public removeCallAndDismissNotification(callIdOrUuid: string): void {
    const resolvedUuid =
      this.getCallUUID(callIdOrUuid) ??
      (this.activeCalls.has(callIdOrUuid) ? callIdOrUuid : undefined);
    const mappedCallId =
      resolvedUuid !== undefined
        ? this.activeCalls.get(resolvedUuid)
        : undefined;
    const hadCustomAndroid =
      Platform.OS === "android" &&
      resolvedUuid !== undefined &&
      this.androidCustomNotificationCalls.has(resolvedUuid);

    // Mirror pendingSipSessions: reportCallEnded (stopForeground for FGS) before clearing maps.
    // clearCallFromNative runs before updateCallState(ENDED) on some VoIP paths; without this,
    // only dismissOngoingCallNotification (nm.cancel) runs and the ongoing notification can stick.
    if (hadCustomAndroid && resolvedUuid) {
      const Notifications = NativeModules.VoxoConnectAndroidNotifications as {
        reportCallEnded?: (u: string, fg?: boolean) => void;
      };
      Notifications?.reportCallEnded?.(
        resolvedUuid,
        AppState.currentState === "active"
      );
    }

    this.clearCallFromActiveCalls(callIdOrUuid);
    if (resolvedUuid) {
      this.androidCustomNotificationCalls.delete(resolvedUuid);
    }
    this.callDisplayNames.delete(callIdOrUuid);
    if (mappedCallId) {
      this.callDisplayNames.delete(mappedCallId);
    }
    setCallActive(false);
    if (Platform.OS === "android") {
      const Notifications = NativeModules.VoxoConnectAndroidNotifications as {
        dismissOngoingCallNotification?: () => void;
        cancelCallNotification?: (u: string) => void;
      };
      if (this.activeCalls.size === 0) {
        Notifications?.dismissOngoingCallNotification?.();
      } else if (resolvedUuid) {
        Notifications?.cancelCallNotification?.(resolvedUuid);
      }
    }
    if (this.activeCalls.size === 0) {
      InCallManager.stop();
      BackgroundTaskManager.endBackgroundTask();
    }
  }

  /**
   * Answer a call via CallKeep (triggers native answer flow)
   * This should be used instead of calling answerCall directly to ensure
   * CallKeep is properly notified and audio routing works correctly
   * @param callId SIP call ID
   */
  public async answerCallViaCallKeep(callId: string): Promise<void> {
    const callUUID = this.getCallUUID(callId);
    if (!callUUID) {
      console.error(
        "📞 [NativeIntegration] Cannot answer via CallKeep - no UUID found for callId:",
        callId
      );
      throw new Error(`No CallKeep UUID found for call ${callId}`);
    }

    console.log("📞 [NativeIntegration] Answering call via CallKeep:", {
      callId,
      callUUID
    });

    // On iOS, this triggers the answerCall event which will call onAnswerCall
    // On Android, this also ensures proper audio routing
    CallKeep.answerIncomingCall(callUUID);
  }
}
