import { NativeModules, Platform } from "react-native";
import { EventEmitter } from "events";
import { setCallActive } from "../callState";
import { VoipCallData } from "../notifications/NotificationManager";
import {
  dismissStaleAndroidVoipCall,
  shouldSkipStaleVoipPush
} from "../notifications/voipPushStaleCheck.ts";
import { CallInfo, CallState, CallDirection } from "./types";
import { Logger } from "shared/utils/Logger.ts";
import BackgroundTaskManager from "../background/BackgroundTaskManager.ts";

const logger = new Logger("VoipBridge: ");

/**
 * VoipBridge handles the integration between VoIP push notifications
 * and the softphone system for incoming calls
 */
/** Pending call data when handleVoipCall runs before SoftphoneProvider has listeners (e.g. kill-state Answer) */
export type PendingIncomingCall = {
  callUuid: string;
  callInfo: CallInfo;
  callData: VoipCallData;
};

export class VoipBridge extends EventEmitter {
  private static instance: VoipBridge | null = null;
  private _initialized: boolean = false;
  private voipCalls: Set<string> = new Set();
  private voipCallData: Map<string, VoipCallData> = new Map();
  /** Stored when handleVoipCall runs before any listener (kill-state Answer flow) */
  private pendingIncomingCall: PendingIncomingCall | null = null;

  private constructor() {
    super();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): VoipBridge {
    if (!VoipBridge.instance) {
      VoipBridge.instance = new VoipBridge();
    }
    return VoipBridge.instance;
  }

  /**
   * Check if the VoIP bridge has been initialized.
   * Used by background handler to decide whether to use VoipBridge path or headless task fallback.
   */
  public isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Initialize the VoIP bridge
   */
  public async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }

    // Initialize background task manager for iOS
    await BackgroundTaskManager.initialize();

    // VoIP Bridge initialized
    this._initialized = true;
    logger.debug("VoIP Bridge initialized with background task support");
  }

  public async handleVoipCall(callData: VoipCallData): Promise<void> {
    console.log("🟦 [VoipBridge] 📞 handleVoipCall called:", {
      callUuid: callData.callUuid,
      callerName: callData.callerName,
      callerNumber: callData.callerNumber,
      isInitialized: this._initialized,
      existingVoipCalls: Array.from(this.voipCalls),
      timestamp: new Date().toISOString()
    });

    const voipPayload = (callData.payload ?? {}) as Record<string, unknown>;
    if (
      Platform.OS === "android" &&
      shouldSkipStaleVoipPush(
        voipPayload,
        callData.callUuid,
        "VoipBridge.handleVoipCall"
      )
    ) {
      dismissStaleAndroidVoipCall(callData.callUuid, callData);
      return;
    }

    if (!this._initialized) {
      if (Platform.OS === "android") {
        const AndroidNotifications =
          NativeModules.VoxoConnectAndroidNotifications;
        if (AndroidNotifications?.startInboundCallHeadlessTask) {
          console.warn(
            "🟦 [VoipBridge] 📞 Bridge not init — starting Android headless inbound (background/foreground race)"
          );
          try {
            const payload = callData.payload ?? {};
            await AndroidNotifications.startInboundCallHeadlessTask(
              callData.callUuid,
              callData.callerName,
              callData.callerNumber,
              payload
            );
            return;
          } catch (headlessErr) {
            console.error(
              "🟦 [VoipBridge] 📞 ❌ startInboundCallHeadlessTask failed:",
              headlessErr
            );
          }
        }
      }
      console.error("🟦 [VoipBridge] 📞 ❌ VoIP Bridge not initialized");
      logger.error("VoIP Bridge not initialized");
      return;
    }

    try {
      console.log("🟦 [VoipBridge] 📞 Starting background task...");
      BackgroundTaskManager.startBackgroundTask();

      // Skip on Android: handleIncomingVoipCall is iOS-only (no-op on Android, logs warning)
      if (Platform.OS === "ios") {
        console.log(
          "🟦 [VoipBridge] 📞 Calling BackgroundTaskManager.handleIncomingVoipCall..."
        );
        await BackgroundTaskManager.handleIncomingVoipCall(callData.payload);
        console.log(
          "🟦 [VoipBridge] 📞 ✅ BackgroundTaskManager.handleIncomingVoipCall completed"
        );
      }

      const callInfo: CallInfo = {
        id: callData.callUuid,
        callUuid: callData.callUuid,
        state: CallState.INCOMING,
        direction: CallDirection.INCOMING,
        remoteDisplayName: callData.callerName,
        remoteUri: `sip:${callData.callerNumber}@dev-sip.voxo.co`,
        startTime: new Date(),
        isMuted: false,
        isOnHold: false,
        isSpeakerOn: false,
        isEmergency: false,
        // Store original VoIP payload for reference
        voipPayload: callData.payload,
        // Add VoIP-specific metadata
        audioState: "active"
      };

      console.log("🟦 [VoipBridge] 📞 Created CallInfo object:", {
        id: callInfo.id,
        state: callInfo.state,
        remoteDisplayName: callInfo.remoteDisplayName,
        remoteUri: callInfo.remoteUri
      });

      // Mark call active so APP_FOREGROUND sagas skip heavy fetches when user
      // accepts from notification (app briefly backgrounds then returns)
      setCallActive(true);

      // Track this as a VoIP call and store the data
      this.voipCalls.add(callData.callUuid);
      this.voipCallData.set(callData.callUuid, callData);
      console.log(
        "🟦 [VoipBridge] 📞 Added to voipCalls Set. Total VoIP calls:",
        this.voipCalls.size
      );

      // Store pending call for kill-state: when handleVoipCall runs before SoftphoneProvider mounts,
      // listeners won't exist. SoftphoneProvider will read this on setup.
      this.pendingIncomingCall = {
        callUuid: callData.callUuid,
        callInfo,
        callData
      };
      console.log(
        "🟦 [VoipBridge] 📞 Stored pendingIncomingCall for kill-state flow"
      );

      // Emit events that the softphone system can listen to
      console.log("🟦 [VoipBridge] 📞 Emitting 'incomingVoipCall' event...");
      this.emit("incomingVoipCall", callData.callUuid, callInfo);
      console.log("🟦 [VoipBridge] 📞 Emitting 'callStateChanged' event...");
      this.emit("callStateChanged", callData.callUuid, CallState.INCOMING);
      console.log("🟦 [VoipBridge] 📞 ✅ NEW CALL CREATED AND EVENTS EMITTED");

      // Start connection quality monitoring for VoIP calls
      this.startConnectionQualityMonitoring(callData.callUuid);
    } catch (error) {
      console.error("🟦 [VoipBridge] 📞 ❌ Error handling VoIP call:", error);
      logger.error("Error handling VoIP call:", error);
      // End background task on error
      BackgroundTaskManager.endBackgroundTask();
    }
  }

  /**
   * Start monitoring connection quality for a VoIP call
   */
  private startConnectionQualityMonitoring(callId: string): void {
    // In a real implementation, you would monitor WebRTC stats
    // For now, we'll simulate connection quality updates
    setTimeout(() => {
      this.emit("connectionQualityChanged", callId, "good");
    }, 2000);
  }

  public handleCallAnswer(callId: string): void {
    console.log("🟦 [VoipBridge] 📞 handleCallAnswer called:", {
      callId,
      isVoipCall: this.isVoipCall(callId),
      voipCalls: Array.from(this.voipCalls),
      timestamp: new Date().toISOString()
    });

    this.emit("answerVoipCall", callId);

    console.log("🟦 [VoipBridge] 📞 ✅ answerVoipCall event emitted");
  }

  /**
   * Handle call end from native UI
   * This is called when user ends the call from CallKeep
   */
  public handleCallEnd(callId: string): void {
    this.emit("endVoipCall", callId);
    this.voipCalls.delete(callId);
    this.voipCallData.delete(callId);
  }

  /**
   * Check if a call is a VoIP call (not a direct SIP call)
   */
  public isVoipCall(callId: string): boolean {
    // Check if this call ID is tracked as a VoIP call
    return this.voipCalls.has(callId);
  }

  /** True while FCM/VoIP inbound flow has UUIDs in voipCalls (answer path owns SIP via SlimSip). */
  public hasTrackedVoipCalls(): boolean {
    return this.voipCalls.size > 0;
  }

  /**
   * Register a call answered from killed state (headless task) as a VoIP call.
   * Allows setSpeaker to use InCallManager and muteCall/unmuteCall to find the headless session.
   */
  public registerHeadlessAnsweredCall(callUuid: string): void {
    this.voipCalls.add(callUuid);
  }

  /**
   * Get VoIP call data for a call ID
   * This can be used to retrieve original VoIP payload
   */
  public getVoipCallData(callId: string): VoipCallData | null {
    return this.voipCallData.get(callId) || null;
  }

  /**
   * Get and clear pending incoming call (from kill-state Answer flow).
   * Called by SoftphoneProvider when it mounts - if handleVoipCall ran before listeners were set up.
   */
  public getAndClearPendingIncomingCall(): PendingIncomingCall | null {
    const pending = this.pendingIncomingCall;
    this.pendingIncomingCall = null;
    return pending;
  }

  /**
   * Cleanup
   */
  public dispose(): void {
    this.removeAllListeners();
    this.voipCalls.clear();
    this.voipCallData.clear();
    this._initialized = false;
    VoipBridge.instance = null;
  }
}

// Export singleton instance
export default VoipBridge.getInstance();
