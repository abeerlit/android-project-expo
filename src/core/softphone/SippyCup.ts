import { Platform } from "react-native";
import CallKeep from "react-native-callkeep";
import { SessionManager, OutgoingCallLifecycle } from "./SessionManager.ts";
import { NativeIntegration } from "./NativeIntegration.ts";
import { SipConfig, CallInfo, CallState } from "./types.ts";
import { EventEmitter } from "events";
import { Logger } from "shared/utils/Logger.ts";
import {
  mergeCalls,
  addParticipantToCall
} from "shared/api/call-actions/methods.ts";
import { isRegistererTerminatedError } from "./sipRegistererErrors.ts";
import { getAppDisplayName } from "shared/branding/appBrand.ts";

const logger = new Logger("SippyCup: ");

/**
 * SippyCup is a high-level class that manages SIP sessions and provides a clean API
 * for making and receiving calls, handling call state, and managing media.
 *
 * It extends EventEmitter to provide an event-based architecture for call state change
 */
export class SippyCup extends EventEmitter {
  sessionManager: SessionManager;
  private nativeIntegration: NativeIntegration;
  private config: SipConfig;
  private isInitialized: boolean = false;
  private isRegistered: boolean = false;
  private readonly appName: string = getAppDisplayName();
  private isHoldOperationInProgress: boolean = false;
  private isMuteOperationInProgress: boolean = false;
  private nativeReadyPromise: Promise<void> | null = null;

  /** Ignore didPerformDTMFAction→onSendDTMF while in-app CallKeep+SessionManager is in progress (no duplicate SIP). */
  private dtmfSuppressNativeSipUntil = 0;

  // Transfer state is now managed in SoftphoneProvider
  // SippyCup only handles SIP operations

  /**
   * Create a new SippyCup instance
   * @param config SIP configuration
   * @param appName Application name for native UI (default: 'VOXOConnect')
   */
  constructor(config: SipConfig, appName?: string) {
    super();
    this.config = config;
    if (appName) {
      this.appName = appName;
    }
    // Use singleton instance to prevent duplicate SIP User Agents
    this.sessionManager = SessionManager.getInstance(this, config);
    this.nativeIntegration = new NativeIntegration({
      appName: this.appName
    });

    // Set up event handlers for native integration
    this.nativeIntegration.onAnswerCall = (callId) => {
      console.log(
        "🟢 [SippyCup] 📞 onAnswerCall called from NativeIntegration:",
        {
          callId,
          timestamp: new Date().toISOString()
        }
      );
      this.answerCall(callId).catch((error) => {
        console.error(
          "🟢 [SippyCup] 📞 ❌ Error answering call from native UI:",
          error
        );
      });
    };

    this.nativeIntegration.onEndCall = (callId) => {
      this.hangupCall(callId).catch((error) => {
        console.error("Error hanging up call from native UI:", error);
      });
    };

    this.nativeIntegration.onMuteCall = (callId) => {
      this.muteCall(callId).catch((error) => {
        console.error("Error muting call from native UI:", error);
      });
    };

    this.nativeIntegration.onUnmuteCall = (callId) => {
      this.unmuteCall(callId).catch((error) => {
        console.error("Error unmuting call from native UI:", error);
      });
    };

    this.nativeIntegration.onSendDTMF = (callId, digits) => {
      if (Date.now() < this.dtmfSuppressNativeSipUntil) {
        return;
      }
      this.sessionManager.sendDTMF(callId, digits).catch((error) => {
        console.error("Error sending DTMF from native UI:", error);
      });
    };

    // Set up event listeners for call state changes
    this.on("incomingCall", (callId, callInfo) => {
      this.ensureNativeReady()
        .then(() => this.nativeIntegration.displayIncomingCall(callId, callInfo))
        .catch((error) => {
          console.error("Error displaying incoming call in native UI:", error);
        });
    });

    this.on("callStateChanged", (callId, state) => {
      console.warn(
        `📞 [SippyCup] ${new Date().toISOString()} callStateChanged: callId=${callId} state=${state} → forwarding to NativeIntegration`
      );
      this.ensureNativeReady()
        .then(() => this.nativeIntegration.updateCallState(callId, state))
        .catch((error) => {
          console.error("Error updating call state in native UI:", error);
        });
    });

    // Set up event listeners for mute state changes
    this.on("callMuted", (callId) => {
      this.ensureNativeReady()
        .then(() => this.nativeIntegration.updateMuteState(callId, true))
        .catch((error) => {
          console.error("Error updating mute state in native UI:", error);
        });
    });

    this.on("callUnmuted", (callId) => {
      this.ensureNativeReady()
        .then(() => this.nativeIntegration.updateMuteState(callId, false))
        .catch((error) => {
          console.error("Error updating unmute state in native UI:", error);
        });
    });

    // Set up event listeners for speaker state changes
    this.on("callSpeakerOn", (_callId) => {
      // Speaker enabled for call
    });

    this.on("callSpeakerOff", (_callId) => {
      // Speaker disabled for call
    });
  }

  /**
   * Clear a call from NativeIntegration (activeCalls, notification).
   * Used when remote hangs up to guarantee cleanup before any async work.
   */
  public clearCallFromNative(callId: string): void {
    this.nativeIntegration.removeCallAndDismissNotification(callId);
  }

  public registerHeadlessCallMapping(
    callUuid: string,
    sipSessionId: string,
    displayName?: string
  ): void {
    this.nativeIntegration.registerHeadlessCallMapping(
      callUuid,
      sipSessionId,
      displayName
    );
  }

  /**
   * Initialize the SIP stack and register with the SIP server
   * @returns Promise that resolves when initialization is complete
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize native integration FIRST — required for incoming VoIP (SlimSipClient)
      // to show the call UI. If SessionManager.init fails (e.g. SIP.js/network),
      // NativeIntegration is still ready for displayIncomingCall.
      await this.nativeIntegration.initialize();

      // Initialize the session manager (SIP.js)
      await this.sessionManager.initialize();

      this.isInitialized = true;
      this.emit("initialized");
    } catch (error) {
      logger.error("Initialize Error:", error);
      this.emit("error", { type: "initialization", error });
      throw error;
    }
  }

  /**
   * Ensure NativeIntegration is initialized (idempotent, shared promise).
   */
  public async ensureNativeReady(): Promise<void> {
    if (this.nativeReadyPromise) {
      return this.nativeReadyPromise;
    }
    this.nativeReadyPromise = this.nativeIntegration.initialize().catch((error) => {
      this.nativeReadyPromise = null;
      throw error;
    });
    await this.nativeReadyPromise;
  }

  /**
   * Establish an inbound session for a specific call UUID
   * @param callUuid Unique Call UUID
   * @param callerIp IP address of the caller/server
   */
  public async establishInboundSession(
    callUuid: string,
    callerIp: string
  ): Promise<void> {
    try {
      await this.sessionManager.establishInboundSession(callUuid, callerIp);
    } catch (error) {
      this.emit("error", { type: "establishInboundSession", error });
      throw error;
    }
  }

  /**
   * Register with the SIP server
   * @returns Promise that resolves when registration is complete
   */
  public async register(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("SippyCup must be initialized before registering");
    }

    if (this.isRegistered) {
      return;
    }

    try {
      await this.sessionManager.register();
      this.isRegistered = true;
      if (Platform.OS === "android") {
        this.sessionManager.setSuppressPrimaryUaInvites(true);
      }
      this.emit("registered");
    } catch (error) {
      if (isRegistererTerminatedError(error)) {
        console.warn(
          "[SippyCup] register: terminated registerer (non-fatal, not marking registered)"
        );
        this.isRegistered = false;
        return;
      }
      this.emit("error", { type: "registration", error });
      throw error;
    }
  }

  /** True when kill-state / headless SIP dialogs or wake-up UAs are still active. */
  public hasActiveSipSessions(): boolean {
    return this.sessionManager.hasManagedSessions();
  }

  /** Instance registration state (prefer over React state — can desync after unregister). */
  public isStackRegistered(): boolean {
    return this.isRegistered;
  }

  /** Instance initialization state. */
  public isStackInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Outbound (transfer/consult) during an active kill-state/headless dialog:
   * initialize + register without assuming prior foreground registration.
   */
  public async ensureRegisteredForOutbound(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    if (!this.isRegistered) {
      await this.register();
    }
  }

  /**
   * Unregister from the SIP server
   * @returns Promise that resolves when unregistration is complete
   */
  public async unregister(): Promise<void> {
    if (!this.isRegistered) {
      return;
    }

    try {
      await this.sessionManager.unregister();
      this.isRegistered = false;
      if (Platform.OS === "android") {
        this.sessionManager.setSuppressPrimaryUaInvites(false);
      }
      this.emit("unregistered");
    } catch (error) {
      if (isRegistererTerminatedError(error)) {
        this.isRegistered = false;
        return;
      }
      this.emit("error", { type: "unregistration", error });
      throw error;
    }
  }

  /**
   * Make an outgoing call
   * @param destination SIP URI or phone number to call
   * @param options Additional options for the call
   * @param skipHold Whether to skip holding all active calls (used for attended transfer)
   * @returns Promise that resolves with the call ID
   */
  public async makeCall(
    destination: string,
    options: any = {}
  ): Promise<string> {
    if (!this.isRegistered) {
      throw new Error("SippyCup must be registered before making calls");
    }

    try {
      await this.holdAllCalls();
      // Hold existing calls before making new outbound call

      // 1) Prepare call (get callId) without sending INVITE so we can register with native first
      const callId = await this.sessionManager.makeCall(destination, options);
      logger.debug(
        `makeCall: got callId=${callId}, starting native UI then sending INVITE`
      );

      const displayLabel =
        typeof options?.displayName === "string" && options.displayName.trim()
          ? options.displayName.trim()
          : undefined;

      // 2) Start outgoing call in native UI so callUUID→callId mapping exists before any state events
      await this.nativeIntegration.startOutgoingCall(
        callId,
        destination,
        displayLabel
      );

      // 3) Send INVITE (emits OUTGOING/CONNECTING etc. — mapping already exists)
      await this.sessionManager.sendOutgoingInvite(callId);

      // 4) Voxo-mobile style: run established → completion + timeout so remote decline/end always cleans up
      const lifecycle = this.sessionManager.getOutgoingCallLifecycle(callId);
      if (lifecycle) {
        this.runOutgoingCallLifecycle(callId, lifecycle);
      }

      return callId;
    } catch (error) {
      this.emit("error", { type: "call", error });
      throw error;
    }
  }

  /** Outgoing call timeout (ms): if neither established nor terminated, force cleanup (e.g. web decline no 603). */
  private static readonly OUTGOING_CALL_TIMEOUT_MS = 90_000;

  /**
   * Run voxo-mobile style outgoing call lifecycle: await established, then completion.
   * On remote decline/failure, ensures updateCallState(ENDED) so ringback stops and CallKeep is updated.
   * Timeout ensures cleanup if 603/terminate never arrives (e.g. web decline).
   * Fire-and-forget; makeCall returns immediately.
   */
  private runOutgoingCallLifecycle(
    callId: string,
    lifecycle: OutgoingCallLifecycle
  ): void {
    const timeoutMs = SippyCup.OUTGOING_CALL_TIMEOUT_MS;
    const timeoutPromise = new Promise<never>((_, reject) => {
      const t = setTimeout(() => {
        logger.debug(
          `Outgoing call ${callId} timeout after ${timeoutMs}ms — forcing ENDED cleanup`
        );
        reject({
          originator: "local" as const,
          cause: "Timeout",
          timeoutMs
        });
      }, timeoutMs);
      // Allow cleanup to clear the timeout if call completes (optional: store ref and clear in finally)
      lifecycle.establishedPromise.finally(() => clearTimeout(t));
      lifecycle.completionPromise
        .catch(() => {})
        .finally(() => clearTimeout(t));
    });

    Promise.race([lifecycle.establishedPromise, timeoutPromise])
      .then(() => {
        // Call connected; ringback already stopped by updateCallState(CONNECTED) from stateChange
        return lifecycle.completionPromise;
      })
      .then((endReason) => {
        if (endReason.originator === "remote") {
          logger.debug(
            `Outgoing call ${callId} ended by remote — reporting to CallKeep`
          );
          this.nativeIntegration
            .updateCallState(callId, CallState.ENDED)
            .catch((e) =>
              console.warn(
                "[SippyCup] runOutgoingCallLifecycle updateCallState:",
                e
              )
            );
        }
      })
      .catch(
        (err: { originator?: string; cause?: string; timeoutMs?: number }) => {
          // Remote declined (603/486), timeout, or other failure — ensure cleanup
          console.warn(
            `📞 [SippyCup] ${new Date().toISOString()} Outgoing ${callId} lifecycle failed/declined/timeout:`,
            err?.originator,
            err?.cause,
            err?.timeoutMs != null ? `timeout=${err.timeoutMs}ms` : ""
          );
          this.nativeIntegration
            .updateCallState(callId, CallState.ENDED)
            .catch((e) =>
              console.warn(
                "[SippyCup] runOutgoingCallLifecycle updateCallState on reject:",
                e
              )
            );
        }
      )
      .finally(() => {
        logger.debug(`Outgoing call ${callId} lifecycle finished`);
      });
  }

  /**
   * Answer an incoming call
   * @param callId ID of the call to answer
   * @returns Promise that resolves when the call is answered
   */
  /** Android: cancel native auto-decline as soon as the user starts answering. */
  public beginIncomingAnswer(callId: string, callerName?: string): void {
    this.nativeIntegration.markIncomingAnswerStarted(callId, callerName);
  }

  public async answerCall(callId: string, callerName?: string): Promise<void> {
    console.log("🟢 [SippyCup] 📞 answerCall called:", {
      callId,
      timestamp: new Date().toISOString()
    });
    try {
      this.beginIncomingAnswer(callId, callerName);
      await this.sessionManager.answerCall(callId);
      console.log("🟢 [SippyCup] 📞 ✅ answerCall completed for:", callId);
    } catch (error) {
      this.emit("error", { type: "answer", error });
      console.error("🟢 [SippyCup] 📞 ❌ Error in answerCall:", error);
      throw error;
    }
  }

  /**
   * Answer an incoming call via CallKeep (recommended for foreground calls)
   * This triggers CallKeep's native answer flow, ensuring proper audio routing
   * and notification dismissal, especially on iOS.
   * @param callId ID of the call to answer
   * @returns Promise that resolves when CallKeep is notified
   */
  public async answerCallViaCallKeep(callId: string): Promise<void> {
    console.log("🟢 [SippyCup] 📞 answerCallViaCallKeep called:", {
      callId,
      timestamp: new Date().toISOString()
    });
    try {
      await this.nativeIntegration.answerCallViaCallKeep(callId);
      console.log("🟢 [SippyCup] 📞 ✅ CallKeep answer triggered for:", callId);
    } catch (error) {
      this.emit("error", { type: "answer", error });
      console.error(
        "🟢 [SippyCup] 📞 ❌ Error in answerCallViaCallKeep:",
        error
      );
      throw error;
    }
  }

  /**
   * Decline an incoming call
   * @param callId ID of the call to decline
   * @returns Promise that resolves when the call is declined
   */
  public async declineCall(callId: string): Promise<void> {
    try {
      await this.sessionManager.declineCall(callId);
    } catch (error) {
      this.emit("error", { type: "decline", error });
      throw error;
    }
  }

  /**
   * Hang up a call
   * @param callId ID of the call to hang up
   * @returns Promise that resolves when the call is hung up
   */
  public async hangupCall(callId: string): Promise<void> {
    try {
      await this.sessionManager.hangupCall(callId);
    } catch (error) {
      this.emit("error", { type: "hangup", error });
      throw error;
    }
  }

  /**
   * Hold a call
   * @param callId ID of the call to hold
   * @returns Promise that resolves when the call is held
   */
  public async holdCall(callId: string): Promise<void> {
    try {
      await this.sessionManager.holdCall(callId);
    } catch (error) {
      this.emit("error", { type: "hold", error });
      throw error;
    }
  }

  /**
   * Unhold a call
   * @param callId ID of the call to unhold
   * @returns Promise that resolves when the call is unheld
   */
  public async unholdCall(callId: string): Promise<void> {
    try {
      await this.sessionManager.unholdCall(callId);
    } catch (error) {
      this.emit("error", { type: "unhold", error });
      throw error;
    }
  }

  /**
   * Mute a call
   * @param callId ID of the call to mute
   * @returns Promise that resolves when the call is muted
   */
  public async muteCall(callId: string): Promise<void> {
    // Prevent concurrent mute operations
    if (this.isMuteOperationInProgress) {
      console.warn("Mute operation already in progress, ignoring request");
      return;
    }

    try {
      this.isMuteOperationInProgress = true;
      await this.sessionManager.muteCall(callId);
    } catch (error) {
      this.emit("error", { type: "mute", error });
      throw error;
    } finally {
      this.isMuteOperationInProgress = false;
    }
  }

  /**
   * Unmute a call
   * @param callId ID of the call to unmute
   * @returns Promise that resolves when the call is unmuted
   */
  public async unmuteCall(callId: string): Promise<void> {
    // Prevent concurrent mute operations
    if (this.isMuteOperationInProgress) {
      console.warn("Mute operation already in progress, ignoring request");
      return;
    }

    try {
      this.isMuteOperationInProgress = true;
      await this.sessionManager.unmuteCall(callId);
    } catch (error) {
      this.emit("error", { type: "unmute", error });
      throw error;
    } finally {
      this.isMuteOperationInProgress = false;
    }
  }

  /**
   * Set speakerphone on/off for a call
   * @param callId ID of the call to control a speaker for
   * @param enabled Whether to enable speakerphone
   * @returns Promise that resolves when the speaker state is set
   */
  public async setSpeaker(callId: string, enabled: boolean): Promise<void> {
    try {
      await this.sessionManager.setSpeaker(callId, enabled);
    } catch (error) {
      this.emit("error", { type: "speaker", error });
      throw error;
    }
  }

  /**
   * Perform blind transfer
   * @param sessionId ID of the session to transfer
   * @param number Phone number to transfer to
   */
  public async transfer(sessionId: string, number: string): Promise<void> {
    const session = this.findSession(sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    const uri = `sip:${number}@dev-sip.voxo.co`;

    try {
      await this.sessionManager.transfer(session, uri);
      await this.hangupCall(sessionId);
    } catch (error) {
      logger.error("[TRANSFER_TRACE] blind transfer (SessionManager) failed", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        sessionId,
        number
      });
      logger.error("Transfer failed:", error);
      this.emit("error", {
        type: "transfer",
        error,
        message: "There was an error transferring your call."
      });
      throw error;
    }
  }

  // This will start the 3-way conference call
  public async attendedTransferMergeNew(
    callId: string,
    mergeCallId: string,
    accessToken: string
  ): Promise<{ conferenceId: string } | void> {
    try {
      console.warn(
        "[MERGE-DIAG] attendedTransferMergeNew → mergeCalls",
        JSON.stringify({ callId, mergeCallId })
      );
      const { conferenceId } = await mergeCalls(
        accessToken,
        callId,
        mergeCallId
      );

      return { conferenceId };
    } catch (error) {
      console.error(`Error starting merge:`, error);

      // Emit error event for context to handle
      this.emit("error", {
        type: "attendedTransferMerge",
        error,
        message: "There was an error starting your conference call."
      });

      throw error;
    }
  }

  public async addParticipantToConference(
    conferenceId: string,
    mergeCallId: string,
    accessToken: string
  ): Promise<void> {
    try {
      await addParticipantToCall(accessToken, conferenceId, mergeCallId);
    } catch (error) {
      console.error(`Error adding participant to conference call:`, error);

      // Emit error event for context to handle
      this.emit("error", {
        type: "addParticipantToConference",
        error,
        message:
          "There was an error adding a participant to the conference call."
      });

      throw error;
    }
  }

  // -- sessionId: sessionId of the current call
  public async completeAttendedTransfer(
    originalCallId: string,
    transferCallId: string,
    options?: { terminateLocalLegs?: boolean }
  ): Promise<void> {
    try {
      const originalSession = this.findSession(originalCallId);
      const transferSession = this.findSession(transferCallId);

      if (!originalSession || !transferSession) {
        throw new Error("Session not found for attended transfer");
      }

      // Perform the SIP transfer
      await this.sessionManager.transfer(originalSession, transferSession);

      const terminateLocalLegs = options?.terminateLocalLegs ?? true;
      if (terminateLocalLegs) {
        // Transfer completion (handoff): terminate local legs once REFER succeeds.
        await this.sessionManager.hangupCall(originalCallId);
        await this.sessionManager.hangupCall(transferCallId);
      }

      // Emit completion event for context to handle (optional)
      this.emit("attendedTransferCompleted", {
        originalCallId,
        transferCallId,
        terminateLocalLegs
      });

      logger.debug(
        "Attended transfer completed successfully - all calls ended"
      );
    } catch (error) {
      logger.error("[TRANSFER_TRACE] completeAttendedTransfer (native) failed", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        originalCallId,
        transferCallId
      });
      logger.error("Failed to complete attended transfer:", error);

      this.emit("error", {
        type: "attendedTransferComplete",
        error,
        message: "There was an error completing the attended transfer."
      });

      throw error;
    }
  }

  /**
   * Cancel attended transfer
   * @param originalCallId Original call ID
   * @param transferCallId Transfer call ID to cancel
   */
  public async cancelAttendedTransfer(
    originalCallId: string,
    transferCallId: string
  ): Promise<void> {
    try {
      // Hang up the child call
      await this.hangupCall(transferCallId);

      // Unhold the parent call
      await this.unholdCall(originalCallId);

      // Attended transfer cancelled successfully
    } catch (error) {
      logger.error("Failed to cancel attended transfer:", error);
      this.emit("error", {
        type: "attendedTransferCancel",
        error,
        message: "There was an error cancelling the attended transfer."
      });
      throw error;
    }
  }

  /**
   * Send DTMF tones
   * @param callId ID of the call to send DTMF tones to
   * @param tones DTMF tones to send (0-9, *, #, A-D)
   * @returns Promise that resolves when the tones are sent
   */
  public async sendDTMF(callId: string, tones: string): Promise<void> {
    const valid = [...tones].filter((c) => /[0-9*#A-Da-d]/.test(c));
    const toSend = valid.join("");
    if (!toSend) {
      return;
    }

    const callUUID = this.nativeIntegration.getCallUUIDForCallId(callId);
    try {
      if (callUUID) {
        this.dtmfSuppressNativeSipUntil =
          Date.now() + 600 + valid.length * 200;
        for (let i = 0; i < valid.length; i++) {
          CallKeep.sendDTMF(callUUID, valid[i]);
          if (i < valid.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 120));
          }
        }
      }

      await this.sessionManager.sendDTMF(callId, toSend);
      if (callUUID) {
        this.dtmfSuppressNativeSipUntil = Date.now() + 400;
      }
    } catch (error) {
      this.emit("error", { type: "dtmf", error });
      throw error;
    }
  }

  /**
   * Get the active calls
   * @returns Array of active call IDs
   */
  public getActiveCalls(): string[] {
    return this.sessionManager.getActiveCalls();
  }

  /**
   * Get the call state
   * @param callId ID of the call to get the state for
   * @returns Call state
   */
  public getCallState(callId: string): any {
    return this.sessionManager.getCallState(callId);
  }

  /** XCID / server id for conference merge HTTP API (SessionManager INVITE headers). */
  public getServerCallIdForApi(callId: string): string | undefined {
    return this.sessionManager.getServerCallIdForApi(callId);
  }

  /**
   * Hold all active calls with mutex protection
   * @returns Promise that resolves with an array of call IDs that were successfully held
   */
  public async holdAllCalls(): Promise<string[]> {
    // Prevent concurrent hold operations
    if (this.isHoldOperationInProgress) {
      console.warn(
        "Hold operation already in progress, skipping concurrent request"
      );
      return [];
    }

    try {
      this.isHoldOperationInProgress = true;

      const heldCallIds = await this.sessionManager.holdAllCalls();

      // Emit events for each held call
      for (const callId of heldCallIds) {
        this.emit("callHeld", callId);
      }

      return heldCallIds;
    } catch (error) {
      this.emit("error", { type: "holdAllCalls", error });
      throw error;
    } finally {
      this.isHoldOperationInProgress = false;
    }
  }

  /**
   * Swap between original call and transfer call during attended transfer
   * Simple toggle: whichever call is currently active gets held, the other gets unheld
   * @param originalCallId Original call ID
   * @param transferCallId Transfer call ID
   */
  public async swapAttendedTransferCalls(
    originalCallId: string,
    transferCallId: string
  ): Promise<void> {
    try {
      const originalCall = this.sessionManager.getCallState(originalCallId);
      const transferCall = this.sessionManager.getCallState(transferCallId);

      if (!originalCall || !transferCall) {
        throw new Error("One or both calls not found");
      }

      // Hold the currently active call and unhold the other
      if (!originalCall.isOnHold) {
        // Original call is active, swap to transfer call
        await this.holdCall(originalCallId);
        await this.unholdCall(transferCallId);
      } else {
        // Transfer call is active, swap to original call
        await this.holdCall(transferCallId);
        await this.unholdCall(originalCallId);
      }
    } catch (error) {
      console.error(
        `Failed to swap attended transfer calls ${originalCallId} <-> ${transferCallId}:`,
        error
      );
      this.emit("error", {
        type: "attendedTransferSwap",
        error,
        message: "There was an error swapping the calls."
      });
      throw error;
    }
  }

  /**
   * Get current transfer state - now managed in SoftphoneProvider
   * This method is deprecated
   */
  public getTransferState() {
    console.warn(
      "getTransferState is deprecated - transfer state is now managed in SoftphoneProvider"
    );
    return {
      isTransferring: false,
      parentCallId: null,
      childCallId: null,
      activeCallId: null
    };
  }

  /**
   * Display an incoming call in the native UI
   * @param callId ID of the call
   * @param callInfo Call information
   * @returns Promise that resolves when the call is displayed
   */
  public async displayIncomingCall(
    callId: string,
    callInfo: CallInfo
  ): Promise<void> {
    try {
      await this.ensureNativeReady();
      await this.nativeIntegration.displayIncomingCall(callId, callInfo);
    } catch (error) {
      this.emit("error", { type: "displayCall", error });
      throw error;
    }
  }

  /**
   * Clean up and dispose of resources.
   * Resets SessionManager singleton so next login gets a fresh SIP stack.
   */
  public async dispose(): Promise<void> {
    this.sessionManager.dispose();
    await SessionManager.resetInstance();
    this.removeAllListeners();
  }

  /**
   * Find session by ID
   * @param sessionId Session ID to find
   * @returns Session or undefined if not found
   */
  private findSession(sessionId: string): any {
    const callState = this.sessionManager.getCallState(sessionId);
    if (!callState) {
      return undefined;
    }

    return this.sessionManager.getUnderlyingSessionForCallId(sessionId);
  }
}
