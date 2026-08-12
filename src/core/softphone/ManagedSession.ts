import { EventEmitter } from "events";
import NetInfo, { NetInfoSubscription } from "@react-native-community/netinfo";
import { Session, SessionState, SessionInviteOptions } from "sip.js";
import { SessionDescriptionHandler } from "sip.js/lib/platform/web";
import { MediaStream } from "@daily-co/react-native-webrtc";
import { CallInfo, CallState } from "./types";

/**
 * ManagedSession wraps a SIP.js Session with enhanced state tracking and management
 * This provides a single source of truth for session state and handles common operations
 * with built-in early exit logic and automatic event emission.
 */
export class ManagedSession {
  private session: Session;
  private callInfo: CallInfo;
  private eventEmitter: EventEmitter;
  private reinviteInProgress: boolean = false;

  // Parent-child session relationships (only one layer deep)
  private childSessionId?: string;
  private parentSessionId?: string;
  private relationshipType: "parent" | "child" | "standalone" = "standalone";

  /**
   * FCM wake inbound only: unregister push Contact before stopping wake UserAgent
   * so REGISTER expires=0 runs before ua.stop() (avoids intermittent WS 1006).
   */
  private wakeReleaseBeforeUaStop?: () => Promise<void>;

  // Current audio state for centralized management
  private currentAudioState: "active" | "muted" | "held" | "disabled" =
    "disabled";

  /** ICE / network drop recovery (Android sip.js path — mirrors JsSIP SipSession). */
  private iceRestartInFlight = false;
  private iceDisconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private iceRestartAttempts = 0;
  private waitingForNetwork = false;
  private pendingIceRecoverReason: "disconnected" | "failed" | null = null;
  private netInfoUnsubscribe: NetInfoSubscription | null = null;
  private offlineWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private iceListenerAttached = false;
  private static readonly MAX_ICE_RESTARTS = 5;
  private static readonly ICE_DISCONNECT_GRACE_MS = 3000;
  private static readonly ICE_RESTART_COOLDOWN_MS = 5000;
  private static readonly OFFLINE_WAIT_MS = 60_000;

  constructor(
    session: Session,
    callInfo: CallInfo,
    eventEmitter: EventEmitter
  ) {
    this.session = session;
    this.callInfo = callInfo;
    this.eventEmitter = eventEmitter;
  }

  // Delegation to underlying session properties
  get id(): string {
    return this.session.id;
  }

  get state(): SessionState {
    return this.session.state;
  }

  get sessionDescriptionHandler() {
    return this.session.sessionDescriptionHandler;
  }

  // State getters
  get isHeld(): boolean {
    return this.callInfo.isOnHold;
  }

  get isMuted(): boolean {
    return this.callInfo.isMuted;
  }

  get isSpeakerOn(): boolean {
    return this.callInfo.isSpeakerOn;
  }

  get callState(): CallState {
    return this.callInfo.state;
  }

  get direction(): string {
    return this.callInfo.direction;
  }

  get remoteUri(): string {
    return this.callInfo.remoteUri;
  }

  get remoteDisplayName(): string {
    return this.callInfo.remoteDisplayName;
  }

  get startTime(): Date {
    return this.callInfo.startTime;
  }

  get answerTime(): Date | undefined {
    return this.callInfo.answerTime;
  }

  get endTime(): Date | undefined {
    return this.callInfo.endTime;
  }

  get isEmergency(): boolean {
    return this.callInfo.isEmergency;
  }

  get localStream() {
    return this.callInfo.localStream;
  }

  get remoteStream() {
    return this.callInfo.remoteStream;
  }

  // Get the active state
  get isActive(): boolean {
    return this.callInfo.isActive || false;
  }

  // Parent-child relationship getters
  get childSession(): string | undefined {
    return this.childSessionId;
  }

  get parentSession(): string | undefined {
    return this.parentSessionId;
  }

  get sessionRelationshipType(): "parent" | "child" | "standalone" {
    return this.relationshipType;
  }

  get audioState(): "active" | "muted" | "held" | "disabled" {
    return this.currentAudioState;
  }

  get hasChildSession(): boolean {
    return !!this.childSessionId;
  }

  get hasParentSession(): boolean {
    return !!this.parentSessionId;
  }

  // Event listener delegation
  get stateChange() {
    return this.session.stateChange;
  }

  // Get complete call info
  getCallInfo(): CallInfo {
    return { ...this.callInfo };
  }

  setWakeReleaseBeforeUaStop(fn: () => Promise<void>): void {
    this.wakeReleaseBeforeUaStop = fn;
  }

  getWakeReleaseBeforeUaStop(): (() => Promise<void>) | undefined {
    return this.wakeReleaseBeforeUaStop;
  }

  clearWakeReleaseBeforeUaStop(): void {
    this.wakeReleaseBeforeUaStop = undefined;
  }

  // State setters with automatic event emission
  setHeld(held: boolean): void {
    if (this.callInfo.isOnHold === held) {
      return; // No change needed
    }

    this.callInfo.isOnHold = held;
    this.callInfo.state = held ? CallState.HOLDING : CallState.CONNECTED;

    // Emit appropriate events
    if (held) {
      this.eventEmitter.emit("callStateChanged", this.id, CallState.HOLDING);
      this.eventEmitter.emit("callHeld", this.id);
    } else {
      this.eventEmitter.emit("callStateChanged", this.id, CallState.CONNECTED);
      this.eventEmitter.emit("callUnheld", this.id);
    }
  }

  setMuted(muted: boolean): void {
    if (this.callInfo.isMuted === muted) {
      return; // No change needed
    }

    this.callInfo.isMuted = muted;

    // Emit appropriate events
    if (muted) {
      this.eventEmitter.emit("callMuted", this.id);
    } else {
      this.eventEmitter.emit("callUnmuted", this.id);
    }
  }

  setSpeaker(speakerOn: boolean): void {
    if (this.callInfo.isSpeakerOn === speakerOn) {
      return; // No change needed
    }

    this.callInfo.isSpeakerOn = speakerOn;

    // Emit appropriate events
    if (speakerOn) {
      this.eventEmitter.emit("callSpeakerOn", this.id);
    } else {
      this.eventEmitter.emit("callSpeakerOff", this.id);
    }
  }

  setCallState(state: CallState): void {
    const previousState = this.callInfo.state;
    if (previousState === state) {
      console.log("🟣 [ManagedSession] 📞 setCallState: No change needed:", {
        callId: this.id,
        state,
        previousState,
        timestamp: new Date().toISOString()
      });
      return; // No change needed
    }

    console.log("🟣 [ManagedSession] 📞 setCallState: State changing:", {
      callId: this.id,
      previousState,
      newState: state,
      timestamp: new Date().toISOString()
    });
    this.callInfo.state = state;
    this.eventEmitter.emit("callStateChanged", this.id, state);

    console.log("🟣 [ManagedSession] 📞 ✅ callStateChanged event emitted:", {
      callId: this.id,
      state,
      eventListeners: this.eventEmitter.listenerCount("callStateChanged"),
      timestamp: new Date().toISOString()
    });
  }

  setAnswerTime(time: Date): void {
    this.callInfo.answerTime = time;
  }

  setEndTime(time: Date): void {
    this.callInfo.endTime = time;
  }

  setLocalStream(stream: MediaStream): void {
    this.callInfo.localStream = stream;
  }

  setRemoteStream(stream: MediaStream): void {
    this.callInfo.remoteStream = stream;
  }

  // Hold/Unhold with simplified audio state management
  async hold(): Promise<void> {
    // Early exit if already held
    if (this.isHeld) {
      console.log(`Call ${this.id} is already held, skipping hold operation`);
      return;
    }

    // Wait for any ongoing re-INVITE to complete (both local and SIP.js state)
    if (this.reinviteInProgress || this.isSessionReinviteInProgress()) {
      console.log(`Call ${this.id} has re-INVITE in progress, waiting...`);
      await this.waitForReinviteCompletion();
    }

    // Double-check after waiting - if still in progress, throw error
    if (this.isSessionReinviteInProgress()) {
      throw new Error(
        `Cannot hold call ${this.id}: SIP re-INVITE still in progress`
      );
    }

    const sessionDescriptionHandler = this.session.sessionDescriptionHandler;
    if (!(sessionDescriptionHandler instanceof SessionDescriptionHandler)) {
      throw new Error(
        "Session's session description handler not instance of SessionDescriptionHandler."
      );
    }

    // Set up re-INVITE options for hold
    const options: SessionInviteOptions = {
      requestDelegate: {
        onAccept: (): void => {
          console.log(
            `[${this.id}] Hold re-INVITE accepted, setting audio to held state`
          );
          this.setHeld(true);
          // Set audio to held state - disable both sender and receiver
          this.setAudioState("held");
        },
        onReject: (): void => {
          console.warn(`[${this.id}] Hold re-invite request was rejected`);
        }
      }
    };

    // Set hold in session description handler options
    const sessionDescriptionHandlerOptions = this.session
      .sessionDescriptionHandlerOptionsReInvite as any;
    sessionDescriptionHandlerOptions.hold = true;
    this.session.sessionDescriptionHandlerOptionsReInvite =
      sessionDescriptionHandlerOptions;

    try {
      console.log(`[${this.id}] Sending hold re-INVITE`);
      this.reinviteInProgress = true;

      // Send re-INVITE for hold
      await this.session.invite(options);

      console.log(`[${this.id}] Hold re-INVITE completed successfully`);
      this.reinviteInProgress = false;

      // Ensure audio is in held state
      this.setAudioState("held");
    } catch (error) {
      this.reinviteInProgress = false;
      console.error(`Error holding call ${this.id}:`, error);
      throw error;
    }
  }

  async unhold(): Promise<void> {
    // Wait for any ongoing re-INVITE to complete (both local and SIP.js state)
    if (this.reinviteInProgress || this.isSessionReinviteInProgress()) {
      console.log(`Call ${this.id} has re-INVITE in progress, waiting...`);
      await this.waitForReinviteCompletion();
    }

    // Double-check after waiting - if still in progress, throw error
    if (this.isSessionReinviteInProgress()) {
      throw new Error(
        `Cannot unhold call ${this.id}: SIP re-INVITE still in progress`
      );
    }

    console.log(
      `[${this.id}] Starting unhold operation - current mute state: ${this.isMuted}`
    );

    const sessionDescriptionHandler = this.session.sessionDescriptionHandler;
    if (!(sessionDescriptionHandler instanceof SessionDescriptionHandler)) {
      throw new Error(
        "Session's session description handler not instance of SessionDescriptionHandler."
      );
    }

    // Track if the re-INVITE was accepted
    let reInviteAccepted = false;

    // Set up re-INVITE options for unhold
    const options: SessionInviteOptions = {
      requestDelegate: {
        onAccept: (): void => {
          console.log(
            `[${this.id}] Unhold re-INVITE accepted, setting audio to active state`
          );
          reInviteAccepted = true;
          this.setHeld(false);

          // Set audio to appropriate active state (active or muted)
          this.setAudioState(this.isMuted ? "muted" : "active");
        },
        onReject: (): void => {
          console.warn(`[${this.id}] Unhold re-invite request was rejected`);
        }
      }
    };

    // Set unhold in session description handler options
    const sessionDescriptionHandlerOptions = this.session
      .sessionDescriptionHandlerOptionsReInvite as any;
    sessionDescriptionHandlerOptions.hold = false;
    this.session.sessionDescriptionHandlerOptionsReInvite =
      sessionDescriptionHandlerOptions;

    try {
      console.log(`[${this.id}] Sending unhold re-INVITE`);
      this.reinviteInProgress = true;

      // Send re-INVITE for unhold
      await this.session.invite(options);

      console.log(`[${this.id}] Unhold re-INVITE completed successfully`);
      this.reinviteInProgress = false;

      // Add fallback if re-INVITE wasn't accepted
      if (!reInviteAccepted) {
        console.warn(
          `[${this.id}] Re-INVITE completed but onAccept wasn't called, setting audio state as fallback`
        );
        this.setHeld(false);
        this.setAudioState(this.isMuted ? "muted" : "active");
      }

      // Verify audio state is correct
      this.verifyAudioState();
    } catch (error) {
      this.reinviteInProgress = false;
      console.error(`Error unholding call ${this.id}:`, error);
      throw error;
    }
  }

  // Mute/Unmute with simplified audio state management
  async mute(): Promise<void> {
    // Early exit if already muted
    if (this.isMuted) {
      console.log(`Call ${this.id} is already muted, skipping mute operation`);
      return;
    }

    try {
      this.setMuted(true);
      // Update audio state based on current conditions
      if (this.isHeld) {
        this.setAudioState("held");
      } else {
        this.setAudioState("muted");
      }
    } catch (error) {
      console.error(`Error muting call ${this.id}:`, error);
      throw error;
    }
  }

  async unmute(): Promise<void> {
    // Early exit if not muted
    if (!this.isMuted) {
      console.log(`Call ${this.id} is not muted, skipping unmute operation`);
      return;
    }

    try {
      this.setMuted(false);
      // Update audio state based on current conditions
      if (this.isHeld) {
        this.setAudioState("held");
      } else {
        this.setAudioState("active");
      }
    } catch (error) {
      console.error(`Error unmuting call ${this.id}:`, error);
      throw error;
    }
  }

  // New centralized audio state management
  setAudioState(audioState: "active" | "muted" | "held" | "disabled"): void {
    console.log(`[${this.id}] Setting audio state to: ${audioState}`);

    // Update internal state
    this.currentAudioState = audioState;

    const sessionDescriptionHandler = this.session.sessionDescriptionHandler;
    if (!(sessionDescriptionHandler instanceof SessionDescriptionHandler)) {
      console.warn(
        `[${this.id}] SessionDescriptionHandler not available for audio state: ${audioState}`
      );
      return;
    }

    // Add a small delay to ensure WebRTC session is ready
    setTimeout(() => {
      try {
        console.log(`[${this.id}] Applying audio state: ${audioState}`);

        switch (audioState) {
          case "active":
            // Enable both sender and receiver tracks
            console.log(
              `[${this.id}] Enabling both sender and receiver tracks`
            );
            sessionDescriptionHandler.enableReceiverTracks(true);
            sessionDescriptionHandler.enableSenderTracks(true);
            break;
          case "muted":
            // Enable receiver, disable sender
            console.log(
              `[${this.id}] Enabling receiver, disabling sender tracks`
            );
            sessionDescriptionHandler.enableReceiverTracks(true);
            sessionDescriptionHandler.enableSenderTracks(false);
            break;
          case "held":
            // Hold is signaled via SDP (re-INVITE). Disable receivers only so the user does
            // not hear the held party. Do not disable sender tracks: getUserMedia often
            // returns the same underlying mic track for concurrent calls; disabling senders
            // sets track.enabled=false globally and can mute the Add-People leg until mute
            // is toggled (which re-enables senders on the active leg).
            console.log(
              `[${this.id}] Hold: disabling receiver tracks only (keeping senders — shared mic)`
            );
            sessionDescriptionHandler.enableReceiverTracks(false);
            sessionDescriptionHandler.enableSenderTracks(true);
            break;
          case "disabled":
            console.log(
              `[${this.id}] Disabling both sender and receiver tracks`
            );
            sessionDescriptionHandler.enableReceiverTracks(false);
            sessionDescriptionHandler.enableSenderTracks(false);
            break;
        }

        console.log(
          `[${this.id}] Audio state successfully set to: ${audioState}`
        );

        // Emit audio state change event
        this.eventEmitter.emit("audioStateChanged", this.id, audioState);
      } catch (error) {
        console.error(
          `[${this.id}] Error setting audio state to ${audioState}:`,
          error
        );
      }
    }, 100); // Small delay to ensure WebRTC session is ready
  }

  // Verify audio state matches expected state
  verifyAudioState(): void {
    try {
      const sessionDescriptionHandler = this.session.sessionDescriptionHandler;
      if (sessionDescriptionHandler instanceof SessionDescriptionHandler) {
        const peerConnection = (sessionDescriptionHandler as any)
          .peerConnection;
        if (peerConnection) {
          const senders = peerConnection.getSenders();
          const receivers = peerConnection.getReceivers();

          console.log(
            `[${this.id}] Audio state verification - Senders: ${senders.length}, Receivers: ${receivers.length}`
          );

          // Log sender track states
          senders.forEach((sender: any, index: number) => {
            const track = sender.track;
            if (track && track.kind === "audio") {
              console.log(
                `[${this.id}] Sender track ${index}: enabled=${track.enabled}, readyState=${track.readyState}`
              );
            }
          });

          // Log receiver track states
          receivers.forEach((receiver: any, index: number) => {
            const track = receiver.track;
            if (track && track.kind === "audio") {
              console.log(
                `[${this.id}] Receiver track ${index}: enabled=${track.enabled}, readyState=${track.readyState}`
              );
            }
          });
        } else {
          console.warn(
            `[${this.id}] PeerConnection not available for audio verification`
          );
        }
      }
    } catch (error) {
      console.error(`[${this.id}] Error verifying audio state:`, error);
    }
  }

  // Set the active state of this session (used by SessionManager)
  setActiveState(isActive: boolean): void {
    const wasActive = this.isActive;
    if (wasActive === isActive) return;

    console.log(
      `[${this.id}] Setting active state to: ${isActive} (was: ${wasActive})`
    );

    // Update active state
    this.callInfo.isActive = isActive;

    // Update audio state based on new active state
    if (isActive) {
      // Became active - set appropriate audio state
      if (this.isHeld) {
        this.setAudioState("held");
      } else if (this.isMuted) {
        this.setAudioState("muted");
      } else {
        this.setAudioState("active");
      }
    } else {
      // No longer active - disable audio
      this.setAudioState("disabled");
    }

    // Emit active state change event
    this.eventEmitter.emit("sessionActiveStateChanged", this.id, isActive);
  }

  // Delegation to underlying session methods
  async invite(options?: SessionInviteOptions): Promise<any> {
    return this.session.invite(options);
  }

  async bye(): Promise<any> {
    this.clearIceRecoveryState();
    return this.session.bye();
  }

  async cancel(): Promise<void> {
    this.clearIceRecoveryState();
    return (this.session as any).cancel();
  }

  async reject(): Promise<void> {
    this.clearIceRecoveryState();
    return (this.session as any).reject();
  }

  async accept(options?: any): Promise<void> {
    return (this.session as any).accept(options);
  }

  private getPeerConnection(): RTCPeerConnection | null {
    try {
      const sdh = this.session.sessionDescriptionHandler as any;
      return (sdh?.peerConnection as RTCPeerConnection) ?? null;
    } catch {
      return null;
    }
  }

  private static isNetOnline(state: {
    isConnected: boolean | null;
    isInternetReachable: boolean | null;
  }): boolean {
    return state.isConnected === true && state.isInternetReachable !== false;
  }

  clearIceRecoveryState(): void {
    if (this.iceDisconnectTimer) {
      clearTimeout(this.iceDisconnectTimer);
      this.iceDisconnectTimer = null;
    }
    if (this.offlineWaitTimer) {
      clearTimeout(this.offlineWaitTimer);
      this.offlineWaitTimer = null;
    }
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = null;
    }
    this.waitingForNetwork = false;
    this.pendingIceRecoverReason = null;
    this.iceRestartInFlight = false;
  }

  /**
   * Watch ICE for drops after answer; wait for network if offline, then re-INVITE
   * with iceRestart so media returns when connectivity comes back (Android).
   */
  startIceRecoveryMonitoring(): void {
    if (this.iceListenerAttached) {
      return;
    }
    const pc = this.getPeerConnection();
    if (!pc) {
      console.warn(
        `[CALL-DROP][SM] no peerConnection yet for ICE monitor`,
        this.id
      );
      return;
    }
    this.iceListenerAttached = true;
    console.warn(`[CALL-DROP][SM] ICE recovery monitor attached`, this.id);

    pc.addEventListener("iceconnectionstatechange", () => {
      const iceState = pc.iceConnectionState;
      console.warn(`[CALL-DROP][SM] iceConnectionState=${iceState}`, this.id);

      if (iceState === "connected" || iceState === "completed") {
        this.iceRestartAttempts = 0;
        // Keep monitor; only clear timers / offline wait / in-flight gate.
        if (this.iceDisconnectTimer) {
          clearTimeout(this.iceDisconnectTimer);
          this.iceDisconnectTimer = null;
        }
        if (this.offlineWaitTimer) {
          clearTimeout(this.offlineWaitTimer);
          this.offlineWaitTimer = null;
        }
        if (this.netInfoUnsubscribe) {
          this.netInfoUnsubscribe();
          this.netInfoUnsubscribe = null;
        }
        this.waitingForNetwork = false;
        this.pendingIceRecoverReason = null;
        this.iceRestartInFlight = false;
        this.eventEmitter.emit("mediaRecoverNeeded", this.id);
        return;
      }

      if (this.session.state !== SessionState.Established) {
        return;
      }

      if (iceState === "disconnected") {
        if (this.iceDisconnectTimer) {
          clearTimeout(this.iceDisconnectTimer);
        }
        this.iceDisconnectTimer = setTimeout(() => {
          this.iceDisconnectTimer = null;
          if (
            pc.iceConnectionState === "disconnected" &&
            this.session.state === SessionState.Established
          ) {
            void this.recoverIce("disconnected");
          }
        }, ManagedSession.ICE_DISCONNECT_GRACE_MS);
        return;
      }

      if (iceState === "failed") {
        if (this.iceDisconnectTimer) {
          clearTimeout(this.iceDisconnectTimer);
          this.iceDisconnectTimer = null;
        }
        void this.recoverIce("failed");
      }
    });
  }

  /**
   * App returned to foreground during an active call — reconnect signaling and
   * kick ICE/audio recovery immediately (do not wait for the disconnect grace).
   */
  async recoverAfterForeground(): Promise<void> {
    if (this.session.state !== SessionState.Established) {
      return;
    }
    console.warn(`[CALL-DROP][SM] foreground resume recovery`, this.id);

    if (this.iceDisconnectTimer) {
      clearTimeout(this.iceDisconnectTimer);
      this.iceDisconnectTimer = null;
    }

    // Always ask UI/audio layer to re-bind playout (Android often mutes on bg).
    this.eventEmitter.emit("mediaRecoverNeeded", this.id);

    try {
      await this.ensureSessionTransportConnected();
    } catch (e) {
      console.warn(
        `[CALL-DROP][SM] transport reconnect on resume failed`,
        this.id,
        e
      );
    }

    if (this.session.state !== SessionState.Established) {
      return;
    }

    const pc = this.getPeerConnection();
    const ice = pc?.iceConnectionState;
    console.warn(
      `[CALL-DROP][SM] foreground ICE state=${ice ?? "none"}`,
      this.id
    );

    if (
      !pc ||
      ice === "failed" ||
      ice === "disconnected" ||
      ice === "closed" ||
      ice === "new"
    ) {
      void this.recoverIce(ice === "failed" || ice === "closed" ? "failed" : "disconnected");
    }
  }

  private waitForNetworkThenRecover(
    reason: "disconnected" | "failed"
  ): void {
    this.pendingIceRecoverReason = reason;
    if (this.waitingForNetwork) {
      return;
    }
    this.waitingForNetwork = true;
    console.warn(
      `[CALL-DROP][SM] network offline — waiting up to ${ManagedSession.OFFLINE_WAIT_MS}ms (${reason})`,
      this.id
    );

    if (!this.offlineWaitTimer) {
      this.offlineWaitTimer = setTimeout(() => {
        this.offlineWaitTimer = null;
        if (this.session.state !== SessionState.Established) {
          return;
        }
        const pc = this.getPeerConnection();
        const iceOk =
          pc?.iceConnectionState === "connected" ||
          pc?.iceConnectionState === "completed";
        if (!iceOk) {
          console.warn(
            `[CALL-DROP][SM] still offline/unrecovered after ${ManagedSession.OFFLINE_WAIT_MS}ms — ending call`,
            this.id
          );
          void this.bye().catch((e) => {
            console.error("[CALL-DROP][SM] bye after offline wait failed", e);
          });
        }
      }, ManagedSession.OFFLINE_WAIT_MS);
    }

    if (!this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe = NetInfo.addEventListener((state) => {
        if (!ManagedSession.isNetOnline(state)) {
          return;
        }
        if (this.session.state !== SessionState.Established) {
          this.clearIceRecoveryState();
          return;
        }
        const pending = this.pendingIceRecoverReason || reason;
        console.warn(
          `[CALL-DROP][SM] network restored — retrying ICE (${pending})`,
          this.id
        );
        if (this.netInfoUnsubscribe) {
          this.netInfoUnsubscribe();
          this.netInfoUnsubscribe = null;
        }
        if (this.offlineWaitTimer) {
          clearTimeout(this.offlineWaitTimer);
          this.offlineWaitTimer = null;
        }
        this.waitingForNetwork = false;
        this.pendingIceRecoverReason = null;
        this.iceRestartAttempts = 0;
        this.iceRestartInFlight = false;
        this.eventEmitter.emit("mediaRecoverNeeded", this.id);
        void this.recoverIce(pending);
      });
    }
  }

  private async ensureSessionTransportConnected(): Promise<void> {
    const ua = this.session.userAgent as {
      isConnected?: () => boolean;
      reconnect?: () => Promise<void>;
    };
    if (!ua?.isConnected || ua.isConnected()) {
      return;
    }
    if (!ua.reconnect) {
      throw new Error("UserAgent.reconnect unavailable");
    }
    console.warn(
      `[CALL-DROP][SM] SIP WebSocket down — reconnecting before ICE restart`,
      this.id
    );
    await ua.reconnect();
    if (!ua.isConnected()) {
      throw new Error("SIP transport reconnect failed");
    }
  }

  private async recoverIce(
    reason: "disconnected" | "failed"
  ): Promise<void> {
    if (this.session.state !== SessionState.Established) {
      return;
    }
    if (this.isHeld) {
      console.warn(
        `[CALL-DROP][SM] skip ICE recovery while on hold (${reason})`,
        this.id
      );
      return;
    }
    if (this.iceRestartInFlight || this.reinviteInProgress) {
      console.warn(
        `[CALL-DROP][SM] ICE recovery already in flight (${reason})`,
        this.id
      );
      return;
    }

    let online = true;
    try {
      const net = await NetInfo.fetch();
      online = ManagedSession.isNetOnline(net);
    } catch (e) {
      console.warn("[CALL-DROP][SM] NetInfo.fetch failed, assuming online", e);
    }

    if (this.session.state !== SessionState.Established) {
      return;
    }

    if (!online) {
      this.waitForNetworkThenRecover(reason);
      return;
    }

    if (this.iceRestartAttempts >= ManagedSession.MAX_ICE_RESTARTS) {
      console.warn(
        `[CALL-DROP][SM] ICE recovery exhausted after ${this.iceRestartAttempts} attempts (${reason}), ending call`,
        this.id
      );
      try {
        await this.bye();
      } catch (e) {
        console.error("[CALL-DROP][SM] bye after ICE failure failed", e);
        this.eventEmitter.emit("callEnded", this.id, `ICE_${reason}`);
      }
      return;
    }

    this.iceRestartAttempts += 1;
    this.iceRestartInFlight = true;
    console.warn(
      `[CALL-DROP][SM] ICE restart attempt ${this.iceRestartAttempts}/${ManagedSession.MAX_ICE_RESTARTS} (${reason}) — keep call up, waiting for media`,
      this.id
    );

    try {
      if (this.reinviteInProgress || this.isSessionReinviteInProgress()) {
        await this.waitForReinviteCompletion();
      }
      if (this.session.state !== SessionState.Established) {
        return;
      }
      await this.ensureSessionTransportConnected();
      if (this.session.state !== SessionState.Established) {
        return;
      }

      // Prefer local ICE restart when the peer connection supports it; still send
      // re-INVITE so the remote side renegotiates candidates.
      const pc = this.getPeerConnection() as RTCPeerConnection & {
        restartIce?: () => void;
      };
      try {
        pc?.restartIce?.();
      } catch {
        /* optional */
      }

      const options: SessionInviteOptions = {
        sessionDescriptionHandlerOptions: {
          offerOptions: { iceRestart: true },
          iceGatheringTimeout: 8000
        } as any,
        requestDelegate: {
          onAccept: (): void => {
            console.warn(
              `[CALL-DROP][SM] ICE restart re-INVITE accepted — recovering playout`,
              this.id
            );
            this.eventEmitter.emit("mediaRecoverNeeded", this.id);
          },
          onReject: (): void => {
            console.warn(
              `[CALL-DROP][SM] ICE restart re-INVITE rejected`,
              this.id
            );
          }
        }
      };

      this.reinviteInProgress = true;
      await this.session.invite(options);
      this.reinviteInProgress = false;

      if (this.session.state === SessionState.Established) {
        this.eventEmitter.emit("mediaRecoverNeeded", this.id);
      }
    } catch (e) {
      this.reinviteInProgress = false;
      if (this.session.state !== SessionState.Established) {
        console.warn(
          `[CALL-DROP][SM] ICE restart aborted — call already ended`,
          this.id
        );
      } else {
        console.error("[CALL-DROP][SM] ICE restart re-INVITE failed", e);
      }
    } finally {
      setTimeout(() => {
        this.iceRestartInFlight = false;
      }, ManagedSession.ICE_RESTART_COOLDOWN_MS);
    }
  }

  /**
   * Set this session as a parent with a child session
   * @param childSessionId - ID of the child session
   */
  setAsParent(childSessionId: string): void {
    if (this.relationshipType === "child") {
      throw new Error(
        `Session ${this.id} cannot be parent - it's already a child session`
      );
    }

    this.childSessionId = childSessionId;
    this.relationshipType = "parent";

    console.log(
      `[${this.id}] Set as parent session with child: ${childSessionId}`
    );
    this.eventEmitter.emit(
      "sessionRelationshipChanged",
      this.id,
      "parent",
      childSessionId
    );
  }

  /**
   * Set this session as a child with a parent session
   * @param parentSessionId - ID of the parent session
   */
  setAsChild(parentSessionId: string): void {
    if (this.relationshipType === "parent") {
      throw new Error(
        `Session ${this.id} cannot be child - it already has a child session`
      );
    }

    this.parentSessionId = parentSessionId;
    this.relationshipType = "child";

    console.log(
      `[${this.id}] Set as child session with parent: ${parentSessionId}`
    );
    this.eventEmitter.emit(
      "sessionRelationshipChanged",
      this.id,
      "child",
      parentSessionId
    );
  }

  // Parent-child relationship management methods

  /**
   * Clear parent-child relationships and make standalone
   */
  clearRelationships(): void {
    const wasParent = this.relationshipType === "parent";
    const wasChild = this.relationshipType === "child";
    const relatedId = wasParent ? this.childSessionId : this.parentSessionId;

    this.childSessionId = undefined;
    this.parentSessionId = undefined;
    this.relationshipType = "standalone";

    console.log(`[${this.id}] Cleared relationships, now standalone`);
    this.eventEmitter.emit(
      "sessionRelationshipCleared",
      this.id,
      wasParent ? "parent" : wasChild ? "child" : "standalone",
      relatedId
    );
  }

  /**
   * Get transfer state information for this session
   */
  getTransferInfo(): {
    isInTransfer: boolean;
    transferRole: "original" | "transfer" | "none";
    relatedSessionId?: string;
  } {
    if (this.relationshipType === "parent") {
      return {
        isInTransfer: true,
        transferRole: "original",
        relatedSessionId: this.childSessionId
      };
    } else if (this.relationshipType === "child") {
      return {
        isInTransfer: true,
        transferRole: "transfer",
        relatedSessionId: this.parentSessionId
      };
    } else {
      return {
        isInTransfer: false,
        transferRole: "none"
      };
    }
  }

  // Get the underlying session if needed (should be rare)
  getUnderlyingSession(): Session {
    return this.session;
  }

  // Check if SIP.js session has ongoing re-INVITE operations
  private isSessionReinviteInProgress(): boolean {
    try {
      const session = this.session as any;

      // Check SIP.js internal state for ongoing re-INVITE
      if (session._inviteOutgoing || session._inviteIncoming) {
        return true;
      }

      // Check session description handler state
      const sdh = session.sessionDescriptionHandler;
      if (
        sdh &&
        (sdh as any)._modifiers &&
        (sdh as any)._modifiers.length > 0
      ) {
        return true;
      }

      // Check for pending transactions
      if (session._dialogs && session._dialogs.size > 0) {
        for (const dialog of session._dialogs.values()) {
          if (
            (dialog as any)._inviteOutgoing ||
            (dialog as any)._inviteIncoming
          ) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      console.warn(`Error checking SIP.js session re-INVITE state: ${error}`);
      return false;
    }
  }

  // Wait for ongoing re-INVITE operations to complete with SIP.js state checking
  private async waitForReinviteCompletion(): Promise<void> {
    const maxWaitTime = 5000; // 5 seconds maximum wait
    const checkInterval = 100; // Check every 100ms
    let waitedTime = 0;

    while (
      (this.reinviteInProgress || this.isSessionReinviteInProgress()) &&
      waitedTime < maxWaitTime
    ) {
      console.log(
        `Call ${this.id} waiting for re-INVITE completion... (${waitedTime}ms)`
      );
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      waitedTime += checkInterval;
    }

    if (this.reinviteInProgress || this.isSessionReinviteInProgress()) {
      console.warn(
        `Call ${this.id} re-INVITE still in progress after ${maxWaitTime}ms, proceeding anyway`
      );
      this.reinviteInProgress = false; // Reset the flag to prevent permanent blocking
    } else {
      console.log(
        `Call ${this.id} re-INVITE completion wait finished successfully (${waitedTime}ms)`
      );
    }
  }
}
