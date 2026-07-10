import { EventEmitter } from "events";
import {
  SessionState,
  Inviter,
  Registerer,
  RegistererState,
  RegistererOptions,
  UserAgent,
  UserAgentOptions,
  InvitationAcceptOptions,
  Invitation,
  SessionInviteOptions,
  URI,
  InviterInviteOptions,
  Session,
  SessionReferOptions
} from "sip.js";
import { Platform } from "react-native";
import {
  mediaDevices,
  MediaStream,
  MediaStreamTrack,
  RTCRtpSender
} from "@daily-co/react-native-webrtc";
import InCallManager from "react-native-incall-manager";
import {
  applyCallSpeakerAndroid,
  getDesiredCallSpeaker,
  recoverCustomNotificationPlayout
} from "./androidCallAudio.ts";
import {
  SipConfig,
  CallState,
  CallDirection,
  CallInfo,
  CallOptions
} from "./types";
import RTCTrackEvent from "@daily-co/react-native-webrtc/lib/typescript/RTCTrackEvent";
import { ManagedSession } from "./ManagedSession";
import { isRegistererTerminatedError } from "./sipRegistererErrors.ts";

/** After native ring stop, yield before MODE_IN_COMMUNICATION + WebRTC capture. */
const ANDROID_RING_TO_INCALL_MS = 300;

/** Reason for call end (voxo-mobile style). */
export interface OutgoingCallEndReason {
  originator: "local" | "remote";
  cause?: string;
}

/** Lifecycle for an outgoing call: established + completion promises. */
export interface OutgoingCallLifecycle {
  establishedPromise: Promise<void>;
  completionPromise: Promise<OutgoingCallEndReason>;
}

interface OutgoingLifecycleState {
  establishedPromise: Promise<void>;
  resolveEst: () => void;
  rejectEst: (err: OutgoingCallEndReason) => void;
  completionPromise: Promise<OutgoingCallEndReason>;
  resolveComp: (v: OutgoingCallEndReason) => void;
  establishedResolved: boolean;
  weInitiatedTermination: boolean;
}

/**
 * SessionManager interfaces with the SIP.js library to manage SIP sessions
 * Singleton pattern ensures only one SIP User Agent exists across app lifecycle
 */
export class SessionManager {
  private static instance: SessionManager | null = null;

  private userAgent: UserAgent | null = null;
  private registerer: Registerer | null = null;
  private config: SipConfig;
  private eventEmitter: EventEmitter;
  private managedSessions: Map<string, ManagedSession> = new Map();
  /**
   * VoIP/FCM UUID, raw SIP Call-ID, CallInfo.id, etc. → canonical session id (SIP.js invitation.id).
   * answer/decline/hangup often pass the short Call-ID while managedSessions is keyed by invitation.id (Call-ID + from tag).
   */
  private aliasToCanonical: Map<string, string> = new Map();
  private canonicalToAliases: Map<string, Set<string>> = new Map();
  private localStream: MediaStream | null = null;
  private wakeUpUAs: Set<UserAgent> = new Set();

  /**
   * Android (via SippyCup): when true, reject new INVITEs on the primary UserAgent.
   * Inbound is expected via FCM + establishInboundSession (separate wake-up UAs with their own onInvite).
   * If the only copy of an inbound call hits the primary contact (no FCM), it will be declined.
   */
  private suppressPrimaryUaInvites = false;

  /** Outgoing call lifecycles for voxo-mobile style established() / callCompletion() flow */
  private outgoingLifecycles: Map<string, OutgoingLifecycleState> = new Map();

  /** Pending invite options for sendOutgoingInvite (callId → options) */
  private pendingInviteOptions: Map<string, InviterInviteOptions> = new Map();

  /** Full CallOptions for outbound legs (attended transfer fast-path, etc.) */
  private outgoingCallOptions: Map<string, CallOptions> = new Map();

  // Removed transfer state - handled by SippyCup now

  /**
   * Get singleton instance of SessionManager
   * @param eventEmitter EventEmitter to emit events to
   * @param config SIP configuration
   * @returns SessionManager singleton instance
   */
  public static getInstance(
    eventEmitter: EventEmitter,
    config: SipConfig
  ): SessionManager {
    if (!SessionManager.instance) {
      console.log("📱 [SessionManager] Creating new singleton instance");
      SessionManager.instance = new SessionManager(eventEmitter, config);
    } else {
      console.log(
        "📱 [SessionManager] Reusing existing singleton instance, updating eventEmitter"
      );
      // Update eventEmitter to route events to current SippyCup instance
      SessionManager.instance.eventEmitter = eventEmitter;
      // Update config if it has changed (e.g., user credentials updated)
      SessionManager.instance.config = config;
    }
    return SessionManager.instance;
  }

  /**
   * Reset singleton instance (for logout or testing)
   * This will dispose of the current instance and allow a new one to be created
   */
  public static async resetInstance(): Promise<void> {
    if (SessionManager.instance) {
      console.log("📱 [SessionManager] Resetting singleton instance");
      await SessionManager.instance.dispose();
      SessionManager.instance = null;
    }
  }

  /**
   * Create a new SessionManager (private constructor for singleton pattern)
   * @param eventEmitter EventEmitter to emit events to
   * @param config SIP configuration
   */
  private constructor(eventEmitter: EventEmitter, config: SipConfig) {
    this.eventEmitter = eventEmitter;
    this.config = config;
  }

  /** SIP Call-ID header (RFC) from session, when available */
  private getSipCallIdFromSession(session: Session): string | undefined {
    try {
      const req = (session as any).request;
      if (req?.callId) return String(req.callId);
    } catch {
      /* ignore */
    }
    return undefined;
  }

  /**
   * Register alternate ids for the same ManagedSession so answer/decline from notifications work.
   */
  private registerSessionAliases(
    canonicalId: string,
    managedSession: ManagedSession,
    extras: (string | undefined)[]
  ): void {
    const toRegister = new Set<string>();
    for (const e of extras) {
      if (e && e !== canonicalId) toRegister.add(e);
    }
    const info = managedSession.getCallInfo();
    if (info.id && info.id !== canonicalId) toRegister.add(info.id);
    if (info.callUuid && info.callUuid !== canonicalId) {
      toRegister.add(info.callUuid);
    }
    if (info.serverCallId && info.serverCallId !== canonicalId) {
      toRegister.add(info.serverCallId);
    }
    const sipCallId = this.getSipCallIdFromSession(
      managedSession.getUnderlyingSession()
    );
    if (sipCallId && sipCallId !== canonicalId) toRegister.add(sipCallId);

    let set = this.canonicalToAliases.get(canonicalId);
    if (!set) {
      set = new Set();
      this.canonicalToAliases.set(canonicalId, set);
    }
    for (const a of toRegister) {
      this.aliasToCanonical.set(a, canonicalId);
      set.add(a);
    }
  }

  private unregisterSessionAliases(canonicalId: string): void {
    const aliases = this.canonicalToAliases.get(canonicalId);
    if (aliases) {
      for (const a of aliases) {
        this.aliasToCanonical.delete(a);
      }
      this.canonicalToAliases.delete(canonicalId);
    }
  }

  /**
   * Resolve VoIP UUID / SIP Call-ID / composite session id → ManagedSession
   */
  private resolveManagedSession(callId: string): ManagedSession | undefined {
    if (!callId) return undefined;
    const viaAlias = this.aliasToCanonical.get(callId);
    if (viaAlias) {
      const ms = this.managedSessions.get(viaAlias);
      if (ms) return ms;
    }
    const direct = this.managedSessions.get(callId);
    if (direct) return direct;

    for (const [, ms] of this.managedSessions) {
      const key = ms.id;
      if (key === callId) return ms;
      if (key.startsWith(callId) && callId.length >= 8) return ms;
      const info = ms.getCallInfo();
      if (info.id === callId || info.callUuid === callId) return ms;
      if (info.serverCallId === callId) return ms;
      const sipId = this.getSipCallIdFromSession(ms.getUnderlyingSession());
      if (sipId === callId) return ms;
    }
    return undefined;
  }

  /** Remove session by canonical or any known alias */
  private removeManagedSession(sessionOrAliasId: string): void {
    const ms = this.resolveManagedSession(sessionOrAliasId);
    if (!ms) {
      const canonical = this.aliasToCanonical.get(sessionOrAliasId);
      if (canonical) {
        this.unregisterSessionAliases(canonical);
        this.managedSessions.delete(canonical);
      } else {
        this.managedSessions.delete(sessionOrAliasId);
      }
      return;
    }
    const canonicalId = ms.id;
    this.unregisterSessionAliases(canonicalId);
    this.managedSessions.delete(canonicalId);
  }

  /** True when any managed SIP dialog is already answered (Established). */
  private hasAnyEstablishedManagedSession(): boolean {
    for (const [, managedSession] of this.managedSessions) {
      const state = managedSession.getUnderlyingSession().state;
      if (state === SessionState.Established) {
        return true;
      }
    }
    return false;
  }

  /** Public helper for headless/native flows that need JS SIP truth for second-line mode. */
  public hasActiveAnsweredCall(): boolean {
    return this.hasAnyEstablishedManagedSession();
  }

  /** True when any SIP dialog or FCM wake-up UA is still active. */
  public hasManagedSessions(): boolean {
    return this.managedSessions.size > 0 || this.wakeUpUAs.size > 0;
  }

  private disposePrimaryRegisterer(): void {
    if (!this.registerer) {
      return;
    }
    try {
      if (this.registerer.state !== RegistererState.Terminated) {
        this.registerer.dispose();
      }
    } catch {
      /* non-fatal */
    }
    this.registerer = null;
  }

  /**
   * Initialize the SIP stack
   */
  public async initialize(): Promise<void> {
    if (this.userAgent) {
      return;
    }
    try {
      // Create the SIP user agent
      const userAgentOptions: UserAgentOptions = {
        uri: new URI("sip", this.config.user, this.config.domain),
        authorizationUsername: this.config.user,
        authorizationPassword: this.config.password,
        transportOptions: {
          server: this.config.uri
        },
        sessionDescriptionHandlerFactoryOptions: {
          peerConnectionConfiguration: {
            iceServers: this.config.iceServers || [
              { urls: "stun:stun.l.google.com:19302" }
            ]
          }
        },
        displayName: this.config.displayName
      };

      this.userAgent = new UserAgent(userAgentOptions);

      // Set up user agent event listeners
      this.userAgent.delegate = {
        onInvite: (invitation: Invitation) => {
          if (this.suppressPrimaryUaInvites) {
            console.warn(
              "[SessionManager] Rejecting INVITE on primary UA (Android FCM-only inbound policy)"
            );
            invitation.reject().catch(() => {});
            return;
          }
          this.handleIncomingCall(invitation);
        }
      };

      // Connect the user agent
      await this.userAgent.start();
    } catch (error) {
      console.error("Error initializing SIP user agent:", error);
      throw error;
    }
  }

  /**
   * sip.js keeps UserAgent in "Started" after {@link initialize}, but the WebSocket can drop
   * (idle timeout, Doze, network change). {@link UserAgent.start} then no-ops without reconnecting.
   * @returns true if {@link UserAgent.reconnect} was invoked (socket was down).
   */
  private async ensureTransportConnected(): Promise<boolean> {
    if (!this.userAgent) {
      throw new Error("User agent not initialized");
    }
    if (this.userAgent.isConnected()) {
      return false;
    }
    console.warn(
      `📱 [SessionManager] ${new Date().toISOString()} SIP WebSocket disconnected — reconnecting...`
    );
    await this.userAgent.reconnect();
    if (!this.userAgent.isConnected()) {
      throw new Error(
        "SIP transport failed to reconnect. Check network and try again."
      );
    }
    return true;
  }

  /**
   * Ensure WebSocket is up and, if we reconnected, re-REGISTER so the proxy binding matches
   * the new socket (fixes outbound INVITE after idle/background on Android).
   * Do not call {@link Registerer.register} when the transport was already connected — a
   * concurrent REGISTER from {@link register} may still be completing (401/digest), which
   * triggers "REGISTER request already in progress".
   */
  public async ensureReadyForOutbound(): Promise<void> {
    const didReconnect = await this.ensureTransportConnected();
    if (
      this.registerer &&
      didReconnect &&
      this.registerer.state !== RegistererState.Terminated
    ) {
      try {
        await this.registerer.register();
        console.log(
          `📱 [SessionManager] ${new Date().toISOString()} Re-REGISTER after transport ready`
        );
      } catch (e) {
        console.error(
          `📱 [SessionManager] Re-REGISTER after reconnect failed:`,
          e
        );
        throw e;
      }
    }
  }

  /**
   * Enable/disable rejecting inbound INVITEs on the primary UserAgent (Android outbound registration).
   * Wake-up UserAgents used by establishInboundSession are not affected.
   */
  public setSuppressPrimaryUaInvites(value: boolean): void {
    this.suppressPrimaryUaInvites = value;
  }

  /**
   * Register with the SIP server
   */
  public async register(): Promise<void> {
    if (!this.userAgent) {
      throw new Error("User agent not initialized");
    }

    await this.ensureTransportConnected();

    try {
      if (this.registerer?.state === RegistererState.Registered) {
        return;
      }

      if (
        this.registerer?.state === RegistererState.Terminated ||
        this.registerer?.state === RegistererState.Unregistered
      ) {
        this.disposePrimaryRegisterer();
      } else if (this.registerer) {
        this.disposePrimaryRegisterer();
      }

      // Create the registerer
      const registererOptions: RegistererOptions = {
        expires: this.config.registrationExpiration || 600
      };

      this.registerer = new Registerer(this.userAgent, registererOptions);

      // Set up registerer event listeners
      this.registerer.stateChange.addListener((state: RegistererState) => {
        switch (state) {
          case RegistererState.Registered:
            this.eventEmitter.emit("registered");
            break;
          case RegistererState.Unregistered:
            this.eventEmitter.emit("unregistered");
            break;
          case RegistererState.Terminated:
            this.registerer = null;
            break;
        }
      });

      // Register
      await this.registerer.register();
    } catch (error) {
      if (isRegistererTerminatedError(error)) {
        console.warn(
          "[SessionManager] register skipped: registerer terminated (non-fatal)"
        );
        this.disposePrimaryRegisterer();
        return;
      }
      console.error("Error registering with SIP server:", error);
      throw error;
    }
  }

  /**
   * Unregister from the SIP server
   */
  public async unregister(): Promise<void> {
    if (!this.registerer) {
      return;
    }

    try {
      if (this.registerer.state === RegistererState.Terminated) {
        this.disposePrimaryRegisterer();
        return;
      }
      await this.registerer.unregister();
    } catch (error: unknown) {
      if (isRegistererTerminatedError(error)) {
        this.disposePrimaryRegisterer();
        return;
      }
      console.error("Error unregistering from SIP server:", error);
      throw error;
    } finally {
      if (this.registerer?.state === RegistererState.Terminated) {
        this.disposePrimaryRegisterer();
      }
    }
  }

  /**
   * Make an outgoing call
   * @param destination SIP URI or phone number to call
   * @param options Additional options for the call
   * @returns Promise that resolves with the call ID
   */
  public async makeCall(
    destination: string,
    options: CallOptions = {}
  ): Promise<string> {
    if (!this.userAgent) {
      throw new Error("User agent not initialized");
    }

    await this.ensureReadyForOutbound();

    try {
      const stream =
        options.isAttendedTransferLeg && this.localStream
          ? this.localStream
          : await this.getLocalStream();
      this.localStream = stream;

      // Format the destination URI
      let targetUri: URI;
      if (destination.includes("@")) {
        // Parse full SIP URI
        const parts = destination.split("@");
        targetUri = new URI("sip", parts[0], parts[1]);
      } else {
        // Create SIP URI from phone number
        targetUri = new URI("sip", destination, this.config.domain);
      }

      // Create the session options
      const inviteOptions: SessionInviteOptions = {
        sessionDescriptionHandlerOptions: {
          constraints: {
            audio: this.config.useAudio !== false,
            video: this.config.useVideo === true
          }
        }
      };

      // Create invite options with custom headers
      const inviteRequestOptions: InviterInviteOptions = {};
      let extraHeaders: string[] = [];

      // Add custom headers if provided
      if (options.customHeaders) {
        extraHeaders = Object.entries(options.customHeaders).map(
          ([key, value]) => `${key}: ${value}`
        );
      }

      // Add VoxoConnect-specific headers
      if (options.callUuid) {
        extraHeaders.push(`X-VoxoConnect-Call-Uuid: ${options.callUuid}`);
      }

      if (options.outboundNumberId) {
        extraHeaders.push(
          `X-VoxoConnect-Outbound-Number-ID: ${options.outboundNumberId}`
        );
      }

      // Caller identity comes from SIP From header (UA displayName) - like voxo-mobile.
      // Do NOT send custom caller/callee headers; proxy may strip or misuse them.

      // Add location header for emergency calls
      if (
        (destination === "911" || destination === "933") &&
        options.locationData
      ) {
        const { latitude, longitude } = options.locationData;
        extraHeaders.push(`X-Location: geo:${latitude},${longitude}`);
      }

      // Add emergency call header if needed
      if (options.isEmergency) {
        extraHeaders.push("Priority: emergency");

        // Add location data if available and not already added
        if (
          options.locationData &&
          !extraHeaders.some((h) => h.startsWith("X-Location:"))
        ) {
          const { latitude, longitude } = options.locationData;
          extraHeaders.push(`Geolocation: geo:${latitude},${longitude}`);
        }
      }

      // Set the final extra headers
      if (extraHeaders.length > 0) {
        console.log("📞 [SM] makeCall extraHeaders:", extraHeaders);
        inviteRequestOptions.requestOptions = {
          extraHeaders
        };
      }

      // Create the inviter with session options
      const inviter = new Inviter(this.userAgent, targetUri, inviteOptions);

      // Do NOT start InCallManager here: NativeIntegration.startOutgoingCall (called by SippyCup right after makeCall) starts it with ringback. Starting here without ringback caused the first outgoing call after app open to have no ringback on iOS (second call worked because session was already warmed up).

      // Create call info
      const sessionId = inviter.id;

      // Extract server-side call ID from SIP Call-ID header (used by API)
      // Note: For outgoing calls, we'll extract this after the INVITE is created
      let serverCallId: string | undefined;
      try {
        // Access the internal request to get Call-ID header
        const inviterAny = inviter as any;
        if (inviterAny.request) {
          serverCallId = inviterAny.request.callId;
        }
      } catch (error) {
        console.warn(
          "Could not extract Call-ID header from outgoing call:",
          error
        );
      }

      const callInfo: CallInfo = {
        id: sessionId,
        serverCallId: serverCallId || sessionId, // Fallback to session ID if extraction fails
        state: CallState.OUTGOING,
        direction: CallDirection.OUTGOING,
        remoteDisplayName: destination,
        remoteUri: targetUri.toString(),
        startTime: new Date(),
        isMuted: false,
        isOnHold: false,
        isSpeakerOn: false,
        isEmergency: options.isEmergency || false,
        localStream: stream
      };

      // Create ManagedSession and store it
      const managedSession = new ManagedSession(
        inviter,
        callInfo,
        this.eventEmitter
      );
      this.managedSessions.set(sessionId, managedSession);
      this.registerSessionAliases(sessionId, managedSession, [
        serverCallId,
        callInfo.serverCallId
      ]);

      // Outgoing lifecycle: establishedPromise + completionPromise (voxo-mobile style)
      let resolveEst!: () => void;
      let rejectEst!: (err: OutgoingCallEndReason) => void;
      let resolveComp!: (v: OutgoingCallEndReason) => void;
      const establishedPromise = new Promise<void>((res, rej) => {
        resolveEst = res;
        rejectEst = rej;
      });
      const completionPromise = new Promise<OutgoingCallEndReason>(
        (resolve) => {
          resolveComp = resolve;
        }
      );
      this.outgoingLifecycles.set(sessionId, {
        establishedPromise,
        resolveEst,
        rejectEst,
        completionPromise,
        resolveComp,
        establishedResolved: false,
        weInitiatedTermination: false
      });

      // Set up session event listeners
      this.setupSessionListeners(managedSession);

      // Store invite options so sendOutgoingInvite can send the INVITE after
      // NativeIntegration.startOutgoingCall(callId) has created the callUUID mapping.
      this.pendingInviteOptions.set(sessionId, inviteRequestOptions);
      this.outgoingCallOptions.set(sessionId, options);

      console.log(
        `📞 [SM] ${new Date().toISOString()} makeCall: prepared outgoing callId=${sessionId} (INVITE not sent yet)`
      );
      return sessionId;
    } catch (error) {
      console.error("Error making call:", error);
      throw error;
    }
  }

  /**
   * Send the outgoing INVITE for a call prepared by makeCall().
   * Call this only after NativeIntegration.startOutgoingCall(callId) so the
   * callUUID→callId mapping exists before any callStateChanged (e.g. CONNECTING).
   * @param callId SIP call ID returned from makeCall()
   */
  public async sendOutgoingInvite(callId: string): Promise<void> {
    const managedSession = this.resolveManagedSession(callId);
    const inviteRequestOptions = this.pendingInviteOptions.get(callId);
    if (!managedSession || !inviteRequestOptions) {
      console.error(
        `📞 [SM] sendOutgoingInvite: no session or options for callId=${callId}`
      );
      throw new Error(
        `Cannot send INVITE: no session or options for call ${callId}`
      );
    }
    const session = managedSession.getUnderlyingSession();
    if (!(session instanceof Inviter)) {
      this.pendingInviteOptions.delete(callId);
      throw new Error(`Call ${callId} is not an outgoing Inviter`);
    }
    const callInfo = managedSession.getCallInfo();
    console.log(
      `📞 [SM] ${new Date().toISOString()} sendOutgoingInvite: emitting OUTGOING then sending INVITE for callId=${callId}`
    );
    this.eventEmitter.emit("outgoingCall", callId, callInfo);
    this.eventEmitter.emit("callStateChanged", callId, CallState.OUTGOING);
    const outgoingOpts = this.outgoingCallOptions.get(callId);
    try {
      if (!outgoingOpts?.isAttendedTransferLeg) {
        await this.ensureReadyForOutbound();
      }
      await session.invite(inviteRequestOptions);
      this.pendingInviteOptions.delete(callId);
      this.outgoingCallOptions.delete(callId);
    } catch (err) {
      this.pendingInviteOptions.delete(callId);
      this.outgoingCallOptions.delete(callId);
      throw err;
    }
  }

  /**
   * Answer an incoming call
   * @param callId ID of the call to answer
   */
  public async answerCall(callId: string): Promise<void> {
    console.log("🟡 [SessionManager] 📞 answerCall called:", {
      callId,
      timestamp: new Date().toISOString(),
      managedSessionsCount: this.managedSessions.size,
      managedSessionsKeys: Array.from(this.managedSessions.keys())
    });

    const managedSession = this.resolveManagedSession(callId);
    if (!managedSession) {
      console.error("🟡 [SessionManager] 📞 ❌ No managedSession found:", {
        callId,
        availableSessions: Array.from(this.managedSessions.keys()),
        aliases: Array.from(this.aliasToCanonical.keys())
      });
      throw new Error(`No incoming call found with ID ${callId}`);
    }

    const canonicalCallId = managedSession.id;

    console.log("🟡 [SessionManager] 📞 ManagedSession found:", {
      callId,
      canonicalCallId,
      state: managedSession.getCallInfo().state,
      timestamp: new Date().toISOString()
    });

    const session = managedSession.getUnderlyingSession();
    if (!(session instanceof Invitation)) {
      console.error("🟡 [SessionManager] 📞 ❌ Session is not an Invitation:", {
        callId,
        sessionType: session.constructor.name
      });
      throw new Error(`Session ${canonicalCallId} is not an incoming call`);
    }

    try {
      if (Platform.OS === "android") {
        // beginIncomingAnswer() stops native ring synchronously; brief yield then start
        // InCallManager BEFORE getUserMedia/accept so WebRTC binds while in call mode.
        await new Promise<void>((resolve) =>
          setTimeout(resolve, ANDROID_RING_TO_INCALL_MS)
        );
        console.log(
          "🟡 [SessionManager] 📞 Starting InCallManager (Android, post ring-stop)..."
        );
        InCallManager.start({ media: "audio", auto: false, ringback: "" });
        console.log("🟡 [SessionManager] 📞 ✅ InCallManager started (Android)");
      }

      managedSession.setCallState(CallState.CONNECTING);
      console.log("🟡 [SessionManager] 📞 Setting call state to CONNECTING...");

      // Attach remote track handler before accept() — ontrack fires during Establishing.
      this.setupRemoteMedia(managedSession, canonicalCallId);

      if (Platform.OS !== "android") {
        console.log("🟡 [SessionManager] 📞 Getting local media stream...");
        const stream = await this.getLocalStream();
        this.localStream = stream;
        managedSession.setLocalStream(stream);
        console.log("🟡 [SessionManager] 📞 ✅ Local media stream obtained");
      } else {
        console.log(
          "🟡 [SessionManager] 📞 Android: defer getUserMedia to SIP accept() (single capture)"
        );
      }

      if (Platform.OS !== "android") {
        console.log("🟡 [SessionManager] 📞 Starting InCallManager...");
        InCallManager.start({ media: "audio" });
        console.log("🟡 [SessionManager] 📞 ✅ InCallManager started");
      }

      // Accept the invitation
      const acceptOptions: InvitationAcceptOptions = {
        sessionDescriptionHandlerOptions: {
          constraints: {
            audio: this.config.useAudio !== false,
            video: this.config.useVideo === true
          }
        }
      };

      console.log("🟡 [SessionManager] 📞 Accepting SIP invitation...");
      await (session as Invitation).accept(acceptOptions);

      if (Platform.OS === "android") {
        const sdh = (session as Invitation).sessionDescriptionHandler as {
          localMediaStream?: MediaStream;
        } | null;
        const local = sdh?.localMediaStream;
        if (local) {
          this.localStream = local;
          managedSession.setLocalStream(local);
          console.log("🟡 [SessionManager] 📞 ✅ Local media stream from SIP accept");
        }
      }

      console.log("🟡 [SessionManager] 📞 ✅ SIP 200 OK sent");
    } catch (error) {
      console.error("🟡 [SessionManager] 📞 ❌ Error answering call:", error);
      throw error;
    }
  }

  /**
   * Decline an incoming call
   * @param callId ID of the call to decline
   */
  public async declineCall(callId: string): Promise<void> {
    const managedSession = this.resolveManagedSession(callId);
    if (!managedSession) {
      throw new Error(`No incoming call found with ID ${callId}`);
    }
    const canonicalCallId = managedSession.id;

    const session = managedSession.getUnderlyingSession();
    if (!(session instanceof Invitation)) {
      throw new Error(`Session ${canonicalCallId} is not an incoming call`);
    }

    try {
      await (session as Invitation).reject();

      // Update call state
      managedSession.setCallState(CallState.ENDED);
      managedSession.setEndTime(new Date());

      // Emit state change so NativeIntegration calls CallKeep.endCall()
      this.eventEmitter.emit("callStateChanged", canonicalCallId, CallState.ENDED);
      this.eventEmitter.emit("callEnded", canonicalCallId, "declined");

      // Clean up
      this.removeManagedSession(canonicalCallId);
      InCallManager.stop();
    } catch (error) {
      console.error("Error declining call:", error);
      throw error;
    }
  }

  /**
   * Hang up a call with proper state-based termination
   * @param callId ID of the call to hang up
   */
  public async hangupCall(callId: string): Promise<void> {
    const managedSession = this.resolveManagedSession(callId);
    if (!managedSession) {
      throw new Error(`No call found with ID ${callId}`);
    }
    const canonicalCallId = managedSession.id;

    const session = managedSession.getUnderlyingSession();
    const sessionState = session.state;

    console.log(
      `Attempting to hang up call ${canonicalCallId} in state: ${sessionState}`
    );

    try {
      // Use the appropriate termination method based on session type and state
      if (session instanceof Inviter) {
        // Mark that we initiated hangup so lifecycle reports originator: 'local'
        const lifecycle = this.outgoingLifecycles.get(canonicalCallId);
        if (lifecycle) {
          lifecycle.weInitiatedTermination = true;
        }
        // Outgoing call
        if (
          sessionState === SessionState.Initial ||
          sessionState === SessionState.Establishing
        ) {
          // Cancel outgoing call that hasn't been established yet
          console.log(
            `Canceling outgoing call ${canonicalCallId} in ${sessionState} state`
          );
          await session.cancel();
        } else if (sessionState === SessionState.Established) {
          // Hang up established outgoing call
          console.log(`Hanging up established outgoing call ${canonicalCallId}`);
          await session.bye();
        } else {
          // Handle other states (Terminating, Terminated, etc.)
          console.log(
            `Attempting bye() for outgoing call ${canonicalCallId} in ${sessionState} state`
          );
          await session.bye();
        }
      } else if (session instanceof Invitation) {
        // Incoming call
        if (sessionState === SessionState.Initial) {
          // Reject incoming call that hasn't been answered
          console.log(
            `Rejecting incoming call ${canonicalCallId} in ${sessionState} state`
          );
          await session.reject();
        } else if (sessionState === SessionState.Established) {
          // Hang up established incoming call
          console.log(`Hanging up established incoming call ${canonicalCallId}`);
          await session.bye();
        } else {
          // Handle other states
          console.log(
            `Attempting bye() for incoming call ${canonicalCallId} in ${sessionState} state`
          );
          await session.bye();
        }
      } else {
        // Fallback for other session types
        console.log(
          `Using fallback bye() for call ${canonicalCallId} (session type: ${session.constructor.name})`
        );
        await session.bye();
      }

      // Update call state
      managedSession.setCallState(CallState.ENDED);
      managedSession.setEndTime(new Date());

      // Emit state change so NativeIntegration calls CallKeep.endCall()
      console.warn(
        `📞 [SM] ${new Date().toISOString()} hangupCall: emitting callStateChanged ENDED for ${canonicalCallId}`
      );
      this.eventEmitter.emit("callStateChanged", canonicalCallId, CallState.ENDED);
      console.warn(
        `📞 [SM] ${new Date().toISOString()} hangupCall: emitting callEnded for ${canonicalCallId}`
      );
      this.eventEmitter.emit("callEnded", canonicalCallId, "hung up");

      console.warn(
        `📞 [SM] ${new Date().toISOString()} Successfully terminated call ${canonicalCallId}`
      );

      // Clean up
      this.removeManagedSession(canonicalCallId);

      // Stop InCallManager if no active calls
      if (this.managedSessions.size === 0) {
        InCallManager.stop();
      }
    } catch (error) {
      console.error(
        `Error hanging up call ${canonicalCallId} (state: ${sessionState}):`,
        error
      );

      // Even if termination fails, clean up local state to prevent stuck calls
      console.log(
        `Forcing cleanup of call ${canonicalCallId} after termination failure`
      );

      managedSession.setCallState(CallState.ENDED);
      managedSession.setEndTime(new Date());

      this.eventEmitter.emit("callStateChanged", canonicalCallId, CallState.ENDED);
      this.eventEmitter.emit("callEnded", canonicalCallId, "terminated with error");
      this.removeManagedSession(canonicalCallId);

      if (this.managedSessions.size === 0) {
        InCallManager.stop();
      }

      throw error;
    }
  }

  /**
   * Get outgoing call lifecycle (established + completion promises) for voxo-mobile style flow.
   * Use establishedPromise to wait for answer or reject on decline; then completionPromise for remote hangup.
   * @param callId SIP call ID (session id)
   * @returns Lifecycle or null if not an outgoing call
   */
  public getOutgoingCallLifecycle(
    callId: string
  ): OutgoingCallLifecycle | null {
    const ms = this.resolveManagedSession(callId);
    const canonical = ms?.id ?? callId;
    const state = this.outgoingLifecycles.get(canonical);
    if (!state) return null;
    return {
      establishedPromise: state.establishedPromise,
      completionPromise: state.completionPromise
    };
  }

  /**
   * Hold a call using SIP re-INVITE
   * @param callId ID of the call to hold
   */
  public async holdCall(callId: string): Promise<void> {
    const managedSession = this.resolveManagedSession(callId);
    if (!managedSession) {
      throw new Error(`No call found with ID ${callId}`);
    }
    await managedSession.hold();
  }

  /**
   * Unhold a call using SIP re-INVITE
   * @param callId ID of the call to unhold
   */
  public async unholdCall(callId: string): Promise<void> {
    const managedSession = this.resolveManagedSession(callId);
    if (!managedSession) {
      throw new Error(`No call found with ID ${callId}`);
    }
    await managedSession.unhold();
  }

  /**
   * Mute a call
   * @param callId ID of the call to mute
   */
  public async muteCall(callId: string): Promise<void> {
    const managedSession = this.resolveManagedSession(callId);
    if (!managedSession) {
      throw new Error(`No call found with ID ${callId}`);
    }
    await managedSession.mute();
  }

  /**
   * Unmute a call
   * @param callId ID of the call to unmute
   */
  public async unmuteCall(callId: string): Promise<void> {
    const managedSession = this.resolveManagedSession(callId);
    if (!managedSession) {
      throw new Error(`No call found with ID ${callId}`);
    }
    await managedSession.unmute();
  }

  /**
   * Set speakerphone on/off for a call
   * @param callId ID of the call to control speaker for
   * @param enabled Whether to enable speakerphone
   */
  public async setSpeaker(callId: string, enabled: boolean): Promise<void> {
    const managedSession = this.resolveManagedSession(callId);
    if (!managedSession) {
      throw new Error(`No call found with ID ${callId}`);
    }

    try {
      if (Platform.OS === "android") {
        applyCallSpeakerAndroid(enabled, "[SP-SPEAKER] SessionManager", callId);
      } else {
        InCallManager.setForceSpeakerphoneOn(enabled);
      }

      managedSession.setSpeaker(enabled);
    } catch (error) {
      console.error(`Error setting speaker for call ${callId}:`, error);
      throw error;
    }
  }

  /**
   * Send DTMF tones
   * Tries WebRTC inband DTMF first (works for peer-to-peer). Falls back to SIP INFO
   * (application/dtmf-relay) for IVRs and service numbers where WebRTC DTMF may not be supported
   * (e.g. Android react-native-webrtc).
   * @param callId ID of the call to send DTMF tones to
   * @param tones DTMF tones to send (0-9, *, #, A-D)
   */
  public async sendDTMF(callId: string, tones: string): Promise<void> {
    const managedSession = this.resolveManagedSession(callId);
    if (!managedSession) {
      throw new Error(`No call found with ID ${callId}`);
    }
    const canonicalId = managedSession.id;

    const session = managedSession.getUnderlyingSession();

    // Try WebRTC inband DTMF first (works for peer-to-peer / simple setups)
    const webrtcSuccess = await this.sendDTMFViaWebRTC(managedSession, tones);
    if (webrtcSuccess) {
      this.eventEmitter.emit("dtmfSent", canonicalId, tones);
      return;
    }

    // Fallback: SIP INFO (application/dtmf-relay) - required by many IVRs/service numbers
    // (e.g. Android where audioSender.dtmf may be undefined)
    await this.sendDTMFViaSipInfo(session, tones);
    this.eventEmitter.emit("dtmfSent", canonicalId, tones);
  }

  private async sendDTMFViaWebRTC(
    managedSession: ManagedSession,
    tones: string
  ): Promise<boolean> {
    try {
      const sdh = managedSession.sessionDescriptionHandler;
      if (!sdh) return false;

      const pc = (sdh as any).peerConnection;
      if (!pc) return false;

      const senders = pc.getSenders();
      const audioSender = senders.find(
        (sender: RTCRtpSender) => sender.track && sender.track.kind === "audio"
      );
      if (!audioSender || !audioSender.dtmf) return false;

      for (const tone of tones) {
        audioSender.dtmf.insertDTMF(tone, 100, 70);
        await new Promise((resolve) => setTimeout(resolve, 170));
      }
      return true;
    } catch {
      return false;
    }
  }

  private async sendDTMFViaSipInfo(
    session: Session,
    tones: string
  ): Promise<void> {
    const sessionAny = session as any;
    if (typeof sessionAny.info !== "function") {
      throw new Error("DTMF not supported (no WebRTC DTMF or SIP INFO)");
    }

    for (const tone of tones) {
      await sessionAny.info({
        requestOptions: {
          body: {
            contentDisposition: "render",
            contentType: "application/dtmf-relay",
            content: `Signal=${tone}\r\nDuration=100`
          }
        }
      });
      await new Promise((resolve) => setTimeout(resolve, 120)); // inter-digit gap
    }
  }

  /**
   * Transfer a call
   * @param session - Session with the transferee to transfer
   * @param target - The referral target (Session for attended transfer, string for blind transfer)
   * @param options - Optional refer options
   * @remarks
   * If target is a Session this is an attended transfer completion (REFER with Replaces),
   * otherwise this is a blind transfer (REFER). Attempting an attended transfer
   * completion on a call that has not been answered will be rejected. To implement
   * an attended transfer with early completion, hangup the call with the target
   * and execute a blind transfer to the target.
   */
  public async transfer(
    session: Session,
    target: Session | string,
    options?: SessionReferOptions
  ): Promise<void> {
    console.log(`[${session.id}] Referring session...`);

    if (target instanceof Session) {
      return session.refer(target, options).then(() => {
        return;
      });
    }

    const uri = UserAgent.makeURI(target);
    if (!uri) {
      return Promise.reject(
        new Error(`Failed to create a valid URI from "${target}"`)
      );
    }

    return session.refer(uri, options).then(() => {
      return;
    });
  }

  /**
   * Get the active calls
   * @returns Array of active call IDs
   */
  public getActiveCalls(): string[] {
    return Array.from(this.managedSessions.keys());
  }

  /**
   * Get the call state
   * @param callId ID of the call to get the state for
   * @returns Call state
   */
  public getCallState(callId: string): CallInfo | undefined {
    const managedSession = this.resolveManagedSession(callId);
    return managedSession ? managedSession.getCallInfo() : undefined;
  }

  /**
   * Backend HTTP merge/API id: prefer XCID (or Xcid / X-Cid) from the dialog INVITE request,
   * then CallInfo.serverCallId. Used when SlimSip pendingSipSessions is empty (Android FCM / SessionManager).
   */
  private extractXcidFromSessionRequest(
    session: Session | undefined
  ): string | undefined {
    if (!session) return undefined;
    try {
      const req = (session as any).request;
      if (req && typeof req.getHeader === "function") {
        const raw =
          req.getHeader("Xcid") ||
          req.getHeader("XCID") ||
          req.getHeader("X-Cid");
        if (raw == null) return undefined;
        const v = typeof raw === "string" ? raw.trim() : String(raw).trim();
        return v || undefined;
      }
    } catch {
      /* ignore */
    }
    return undefined;
  }

  public getServerCallIdForApi(callId: string): string | undefined {
    const ms = this.resolveManagedSession(callId);
    if (!ms) return undefined;
    const fromInvite = this.extractXcidFromSessionRequest(
      ms.getUnderlyingSession()
    );
    if (fromInvite) return fromInvite;
    const info = ms.getCallInfo();
    const sid = info?.serverCallId;
    if (sid && sid !== ms.id) return sid;
    return undefined;
  }

  /**
   * Resolve VoIP / SIP Call-ID alias to the underlying SIP.js session (for SippyCup, transfers, etc.).
   */
  public getUnderlyingSessionForCallId(callId: string): Session | undefined {
    return this.resolveManagedSession(callId)?.getUnderlyingSession();
  }

  /**
   * Hold all active calls
   * @returns Promise that resolves with array of call IDs that were successfully helr
   */
  public async holdAllCalls(): Promise<string[]> {
    const heldCallIds: string[] = [];
    const failedCallIds: string[] = [];
    const activeCalls = Array.from(this.managedSessions.keys());

    if (activeCalls.length === 0) {
      console.log("No active calls to hold");
      return heldCallIds;
    }

    console.log(
      `Attempting to hold ${activeCalls.length} active calls:`,
      activeCalls
    );

    // Hold each active call
    for (const callId of activeCalls) {
      try {
        const managedSession = this.managedSessions.get(callId);

        if (!managedSession) {
          console.log(`Skipping call ${callId} - session not found`);
          continue;
        }

        // Check if call is already held
        if (managedSession.isHeld) {
          heldCallIds.push(callId);
          console.log(`Call ${callId} was already on hold`);
          continue;
        }

        // Only hold calls that are connected
        if (managedSession.callState !== CallState.CONNECTED) {
          console.log(
            `Skipping call ${callId} - not connected (state: ${managedSession.callState})`
          );
          continue;
        }

        // Check if session has recent re-INVITE activity
        const session = managedSession.getUnderlyingSession() as any;
        if (session._inviteOutgoing || session._inviteIncoming) {
          console.log(`Skipping call ${callId} - SIP re-INVITE in progress`);
          continue;
        }

        // Attempt to hold the call
        await this.holdCall(callId);
        heldCallIds.push(callId);
        console.log(
          `Successfully held call ${callId} (was ${managedSession.callState})`
        );
      } catch (error) {
        failedCallIds.push(callId);
        console.error(`Failed to hold call ${callId}:`, error);
        // Continue with other calls even if one fails
      }
    }

    // Log summary of operation
    const summary = {
      successful: heldCallIds,
      failed: failedCallIds
    };

    if (failedCallIds.length > 0) {
      console.warn(
        `Hold operation completed with ${failedCallIds.length} failures:`,
        summary
      );
    } else {
      console.log(summary);
    }

    return heldCallIds;
  }

  /**
   * Clean up and dispose of resources
   */
  public dispose(): void {
    this.suppressPrimaryUaInvites = true;

    // Hang up all active calls
    for (const [callId, managedSession] of this.managedSessions.entries()) {
      try {
        managedSession.bye();
      } catch (error) {
        console.error(`Error hanging up call ${callId}:`, error);
      }
    }

    // Stop user agent first so Registerer is disposed; skip explicit unregister
    // (calling unregister on a Registerer that gets disposed by stop() causes "Terminated" errors)
    this.disposePrimaryRegisterer();
    if (this.userAgent) {
      try {
        this.userAgent.stop();
      } catch (error) {
        console.error("Error stopping user agent:", error);
      }
      this.userAgent = null;
    }
    this.registerer = null;

    // Stop InCallManager
    InCallManager.stop();

    // Clear map
    this.managedSessions.clear();
    this.aliasToCanonical.clear();
    this.canonicalToAliases.clear();

    // Stop all wake-up UAs
    for (const ua of this.wakeUpUAs) {
      try {
        ua.stop();
      } catch (error) {
        console.error("Error stopping wake-up UA:", error);
      }
    }
    this.wakeUpUAs.clear();
  }

  /**
   * Establish an inbound session for a specific call UUID using custom headers
   * This implements the "wake-up" strategy for robust incoming call delivery
   */
  /**
   * Establish inbound session for killed-state calling
   * This follows voxo-mobile's SlimSipClient.establishInboundSession pattern:
   * 1. Create wake-up UA with X-UUID, X-PUSH, X-IP headers
   * 2. Register and wait for INVITE (8-second timeout)
   * 3. Return Session when INVITE arrives
   * 4. Handle registration failures (404, answered elsewhere, cancelled)
   */
  public async establishInboundSession(
    callUuid: string,
    callerIp: string
  ): Promise<Session> {
    console.log(
      `🔶 [SessionManager] ESTABLISHING INBOUND SESSION for UUID: ${callUuid}, IP: ${callerIp}`
    );

    return new Promise<Session>((resolve, reject) => {
      let timeoutHandle: NodeJS.Timeout | null = null;
      let wakeUpUA: UserAgent | null = null;
      let registerer: Registerer | null = null;
      /** One wake REGISTER binds one INVITE; the UA stays up for the dialog. Extra INVITEs to the same Contact are for a new FCM session (new UA). */
      let wakeInviteConsumed = false;
      /** After resolve/reject, voluntary REGISTER removal must not trigger REGISTRATION_FAILED reject. */
      let wakeEstablishSettled = false;
      let wakeBindingReleased = false;

      const markWakeEstablishSettled = () => {
        wakeEstablishSettled = true;
      };

      const releaseWakeRegistration = async () => {
        if (wakeBindingReleased || !registerer) return;
        wakeBindingReleased = true;
        const reg = registerer;
        registerer = null;
        try {
          if (reg.state !== RegistererState.Terminated) {
            await reg.unregister();
          }
        } catch {
          /* non-fatal */
        }
        try {
          if (reg.state !== RegistererState.Terminated) {
            reg.dispose();
          }
        } catch {
          /* non-fatal */
        }
        console.log(
          `🔶 [SessionManager] Released wake-up REGISTER Contact for ${callUuid} (in-dialog traffic does not need this binding)`
        );
      };

      void (async () => {
        try {
          // Create wake-up UserAgent
          const userAgentOptions: UserAgentOptions = {
            uri: new URI("sip", this.config.user, this.config.domain),
            authorizationUsername: this.config.user,
            authorizationPassword: this.config.password,
            transportOptions: {
              server: this.config.uri
            },
            displayName: this.config.displayName,
            delegate: {
              onInvite: (invitation: Invitation) => {
                if (wakeInviteConsumed) {
                  console.warn(
                    `🔶 [SessionManager] Wake-up UA: rejecting extra INVITE (dialog already bound for ${callUuid}). New inbound must use a new FCM wake-up.`
                  );
                  void invitation
                    .reject({ statusCode: 486, reasonPhrase: "Busy Here" })
                    .catch(() => {});
                  return;
                }

                wakeInviteConsumed = true;

                console.log(
                  `🔶 [SessionManager] ✅ WakeUp UA received INVITE for ${callUuid}`
                );

                // Clear timeout since we got the INVITE
                if (timeoutHandle) {
                  clearTimeout(timeoutHandle);
                  timeoutHandle = null;
                }

                // Create CallInfo for this incoming call
                const sessionId = invitation.id;
                const remoteUri = invitation.remoteIdentity.uri.toString();
                const remoteDisplayName =
                  invitation.remoteIdentity.displayName || remoteUri;
                const sipCallId = this.getSipCallIdFromSession(invitation);
                const xcid =
                  invitation.request.getHeader("Xcid") ||
                  invitation.request.getHeader("XCID");

                // id must match SIP.js invitation / ManagedSession.id so callStateChanged
                // and React calls[sessionId] use the same key (push UUID stays in callUuid).
                const callInfo: CallInfo = {
                  id: sessionId,
                  callUuid,
                  serverCallId: (xcid as string) || sipCallId || callUuid || sessionId,
                  state: CallState.INCOMING,
                  direction: CallDirection.INCOMING,
                  remoteDisplayName: remoteDisplayName,
                  remoteUri: remoteUri,
                  startTime: new Date(),
                  isMuted: false,
                  isOnHold: false,
                  isSpeakerOn: false,
                  isEmergency: false,
                  audioState: "active"
                };

                // Create ManagedSession
                const managedSession = new ManagedSession(
                  invitation,
                  callInfo,
                  this.eventEmitter
                );

                // Store the session
                this.managedSessions.set(sessionId, managedSession);
                this.registerSessionAliases(sessionId, managedSession, [
                  callUuid,
                  sipCallId,
                  callUuid || sessionId
                ]);
                callInfo.useEndAndAcceptSecondLine =
                  this.hasAnyEstablishedManagedSession();

                // Defer wake REGISTER removal until dialog ends (see setupSessionListeners Terminated).
                managedSession.setWakeReleaseBeforeUaStop(releaseWakeRegistration);

                // Set up session listeners so we receive BYE (remote hangup) and emit callEnded
                this.setupSessionListeners(managedSession);

                // Emit incomingCall so headless task's invitePromise resolves (Android background)
                this.eventEmitter.emit("incomingCall", sessionId, callInfo);

                console.log(
                  `🔶 [SessionManager] Created ManagedSession for ${callUuid}, resolving promise`
                );

                markWakeEstablishSettled();
                // Resolve with the SIP.js Session
                resolve(invitation);
              }
            }
          };

          console.log(`🔶 [SessionManager] Creating new UserAgent for wake-up`);
          wakeUpUA = new UserAgent(userAgentOptions);
          this.wakeUpUAs.add(wakeUpUA);

          console.log(`🔶 [SessionManager] Starting UserAgent...`);
          await wakeUpUA.start();

          // Create registerer with wake-up headers (like voxo-mobile)
          console.log(
            `🔶 [SessionManager] Creating Registerer with X-UUID, X-PUSH, X-IP headers`
          );
          registerer = new Registerer(wakeUpUA, {
            extraHeaders: [
              `X-UUID: ${callUuid}`,
              `X-PUSH: 1`,
              `X-IP: ${callerIp}`
            ],
            expires: 120
          });

          // Handle registration state changes
          registerer.stateChange.addListener((state) => {
            console.log(
              `🔶 [SessionManager] Registerer state changed: ${state}`
            );

            if (state === RegistererState.Registered) {
              console.log(
                `🔶 [SessionManager] ✅ SUCCESSFULLY REGISTERED WAKEUP UA`
              );

              // Set timeout for receiving INVITE (8 seconds like voxo-mobile)
              timeoutHandle = setTimeout(() => {
                console.error(
                  `🔶 [SessionManager] ❌ RECEIVE_INVITE_TIMEOUT (8 seconds)`
                );
                markWakeEstablishSettled();
                reject({
                  error: "RECEIVE_INVITE_TIMEOUT",
                  message: "Timeout waiting for invite after 8 seconds"
                });

                // Cleanup
                if (wakeUpUA) {
                  wakeUpUA.stop().catch(() => {});
                  this.wakeUpUAs.delete(wakeUpUA);
                }
              }, 8000);
            } else if (
              state === RegistererState.Terminated ||
              state === RegistererState.Unregistered
            ) {
              if (wakeEstablishSettled) {
                console.log(
                  `🔶 [SessionManager] Wake-up registerer ${state} after INVITE handled (expected after unregister)`
                );
                return;
              }

              console.error(
                `🔶 [SessionManager] ❌ Registration failed or terminated: ${state}`
              );

              markWakeEstablishSettled();
              // Check for specific error codes (like voxo-mobile does)
              // In sip.js, we need to check the registerer's last response
              reject({
                error: "REGISTRATION_FAILED",
                message: `Registration ${state}`
              });

              // Cleanup
              if (timeoutHandle) {
                clearTimeout(timeoutHandle);
              }
              if (wakeUpUA) {
                wakeUpUA.stop().catch(() => {});
                this.wakeUpUAs.delete(wakeUpUA);
              }
            }
          });

          // Register
          console.log(
            `🔶 [SessionManager] Registering WakeUp UA with headers...`
          );
          await registerer.register();
        } catch (error) {
          console.error(
            `🔶 [SessionManager] ❌ Error in establishInboundSession:`,
            error
          );

          markWakeEstablishSettled();
          // Cleanup
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
          if (wakeUpUA) {
            wakeUpUA.stop().catch(() => {});
            if (wakeUpUA) this.wakeUpUAs.delete(wakeUpUA);
          }

          reject(error);
        }
      })();
    });
  }

  /**
   * Handle an incoming call
   * @param invitation Incoming call invitation
   * @param callUuid Optional native call UUID from wake-up process
   */
  private handleIncomingCall(invitation: Invitation, callUuid?: string): void {
    // Get session ID (SIP.js internal ID)
    const sessionId = invitation.id;
    const remoteUri = invitation.remoteIdentity.uri.toString();
    const remoteDisplayName =
      invitation.remoteIdentity.displayName || remoteUri;

    // Extract SIP headers
    const headers = invitation.request.headers;

    // If callUuid was not passed, try to extract from X-UUID header if present
    if (!callUuid) {
      // Some servers might reflect it back
      callUuid = invitation.request.getHeader("X-UUID");
    }

    // Check if this is an auto-reject call type
    if (this.config.autoReject && this.config.autoRejectTypes) {
      for (const type of this.config.autoRejectTypes) {
        if (headers[type.toLowerCase()]) {
          // Auto-reject the call
          invitation.reject();
          return;
        }
      }
    }

    // Extract server-side call ID from Xcid header (used by API)
    const serverCallId =
      invitation.request.getHeader("Xcid") ||
      invitation.request.getHeader("XCID") ||
      sessionId;

    // Create call info
    const callInfo: CallInfo = {
      id: sessionId, // Use session ID as the primary ID for local tracking
      callUuid, // Store native call UUID
      state: CallState.INCOMING,
      direction: CallDirection.INCOMING,
      remoteDisplayName,
      remoteUri,
      startTime: new Date(),
      isMuted: false,
      isOnHold: false,
      isSpeakerOn: false,
      isEmergency: false, // Check headers for emergency status
      // Store server call ID for API calls
      serverCallId
    };

    // Create ManagedSession and store it
    const managedSession = new ManagedSession(
      invitation,
      callInfo,
      this.eventEmitter
    );
    this.managedSessions.set(sessionId, managedSession);
    const sipCallId = this.getSipCallIdFromSession(invitation);
    this.registerSessionAliases(sessionId, managedSession, [
      callUuid,
      sipCallId
    ]);
    callInfo.useEndAndAcceptSecondLine = this.hasAnyEstablishedManagedSession();

    // Set up session event listeners
    this.setupSessionListeners(managedSession);

    // Emit incoming call event
    this.eventEmitter.emit("incomingCall", sessionId, callInfo);
    this.eventEmitter.emit("callStateChanged", sessionId, CallState.INCOMING);

    // Auto-answer if configured
    if (this.config.autoAnswer) {
      this.answerCall(sessionId).catch((error) => {
        console.error("Error auto-answering call:", error);
      });
    }
  }

  /**
   * Set up event listeners for a session
   * @param managedSession Session to set up listeners for
   */
  private setupSessionListeners(managedSession: ManagedSession): void {
    const callId = managedSession.id;
    const session = managedSession.getUnderlyingSession();

    session.stateChange.addListener((state: SessionState) => {
      console.log(
        `🟡 [SessionManager] 📞 Call ${callId} session state changed to ${state}`,
        {
          callId,
          sessionState: state,
          timestamp: new Date().toISOString()
        }
      );

      switch (state) {
        case SessionState.Establishing:
          managedSession.setCallState(CallState.CONNECTING);
          break;
        case SessionState.Established: {
          const lifecycle = this.outgoingLifecycles.get(callId);
          if (lifecycle && !lifecycle.establishedResolved) {
            lifecycle.establishedResolved = true;
            lifecycle.resolveEst();
          }
          managedSession.setCallState(CallState.CONNECTED);
          managedSession.setAnswerTime(new Date());
          this.eventEmitter.emit("callConnected", callId);
          console.log(
            "🟡 [SessionManager] 📞 Session established, setting call state to CONNECTED..."
          );

          // Set up remote media handling when connected
          this.setupRemoteMedia(managedSession, callId);

          // FCM wake inbound: drop REGISTER binding once dialog is up so expiry/refresh
          // timers cannot crash the app after background freeze or post-call idle.
          const wakeRelease = managedSession.getWakeReleaseBeforeUaStop?.();
          if (wakeRelease) {
            managedSession.clearWakeReleaseBeforeUaStop();
            void wakeRelease().catch(() => {});
          }

          // Call connected - let SippyCup handle any transfer logic
          break;
        }
        case SessionState.Terminating:
        case SessionState.Terminated: {
          const lifecycle = this.outgoingLifecycles.get(callId);
          if (lifecycle) {
            if (!lifecycle.establishedResolved) {
              const reason = lifecycle.weInitiatedTermination
                ? { originator: "local" as const, cause: "Canceled" }
                : { originator: "remote" as const, cause: "Declined" };
              console.warn(
                `📞 [SM] ${new Date().toISOString()} Outgoing ${callId} rejected before connect: ${
                  reason.originator
                } / ${reason.cause}`
              );
              lifecycle.rejectEst(reason);
            } else {
              lifecycle.resolveComp({
                originator: lifecycle.weInitiatedTermination
                  ? "local"
                  : "remote",
                cause: "Terminated"
              });
            }
            this.outgoingLifecycles.delete(callId);
          }
          console.warn(
            `📞 [SM] ${new Date().toISOString()} Outgoing call ${callId} TERMINATED (callee declined/ended) — stopping ringback`
          );
          managedSession.setCallState(CallState.ENDED);
          managedSession.setEndTime(new Date());
          this.eventEmitter.emit("callStateChanged", callId, CallState.ENDED);
          this.eventEmitter.emit(
            "callEnded",
            callId,
            state === SessionState.Terminated ? "terminated" : "terminating"
          );

          // Bidirectional relationship cleanup - clear from both sides
          const childSessionId = managedSession.childSession;
          const parentSessionId = managedSession.parentSession;

          // Clear relationship from child if this was a parent
          if (childSessionId) {
            const childSession = this.managedSessions.get(childSessionId);
            if (childSession) {
              console.log(
                `[${callId}] Clearing child relationship from ${childSessionId}`
              );
              childSession.clearRelationships();
            }
          }

          // Clear relationship from parent if this was a child
          if (parentSessionId) {
            const parentSession = this.managedSessions.get(parentSessionId);
            if (parentSession) {
              console.log(
                `[${callId}] Clearing parent relationship from ${parentSessionId}`
              );
              parentSession.clearRelationships();
            }
          }

          // Clean up session relationships for this session
          managedSession.clearRelationships();

          // Clean up
          this.removeManagedSession(callId);

          // Stop InCallManager if no active calls
              if (this.managedSessions.size === 0) {
                InCallManager.stop();
          }

          // Wake-up UA: unregister before stop; only on Terminated (not Terminating)
          if (state === SessionState.Terminated) {
            const sess = managedSession.getUnderlyingSession();
            const ua = sess.userAgent;
            if (ua && this.wakeUpUAs.has(ua)) {
              const otherActiveSessions = Array.from(this.managedSessions.values()).filter(
                (ms) => ms.id !== callId && ms.getUnderlyingSession().userAgent === ua
              );
              if (otherActiveSessions.length > 0) {
                console.log(`[SessionManager] WakeUp UA kept alive`, otherActiveSessions.map((ms) => ms.id));
                break;
              }

              const release = managedSession.getWakeReleaseBeforeUaStop?.();
              const finishStop = () => {
                console.log(
                  "[SessionManager] Stopping WakeUp UA for terminated session"
                );
                try {
                  ua.stop();
                } catch (e) {
                  console.error("Error stopping wake-up UA:", e);
                }
                this.wakeUpUAs.delete(ua);
              };
              if (release) {
                void release().finally(() => finishStop());
              } else {
                finishStop();
              }
            }
          }
          break;
        }
      }
    });
  }

  /**
   * Set up remote media handling for a session
   * @param session Session to set up remote media for
   * @param callId Call ID
   */
  private attachRemoteAudioTrack(
    managedSession: ManagedSession,
    callId: string,
    track: MediaStreamTrack | null | undefined
  ): void {
    if (!track || track.kind !== "audio") {
      return;
    }
    if (!track.enabled) {
      track.enabled = true;
    }
    console.log(
      `🟡 [SessionManager] attachRemoteAudioTrack callId=${callId} id=${track.id} enabled=${track.enabled} readyState=${track.readyState} muted=${track.muted}`
    );
    if (!managedSession.remoteStream) {
      managedSession.setRemoteStream(new MediaStream());
    }
    const remoteStream = managedSession.remoteStream;
    if (!remoteStream || remoteStream.getTracks().includes(track)) {
      return;
    }
    remoteStream.addTrack(track);
    this.eventEmitter.emit("remoteStream", callId, remoteStream);

    if (Platform.OS === "android") {
      const callUuid = managedSession.getCallInfo().callUuid;
      recoverCustomNotificationPlayout(
        "[SM-REMOTE]",
        callId,
        callUuid,
        getDesiredCallSpeaker()
      );
    }
  }

  private setupRemoteMedia(
    managedSession: ManagedSession,
    callId: string
  ): void {
    try {
      const session = managedSession.getUnderlyingSession();
      const sdh = session.sessionDescriptionHandler;
      if (!sdh) return;

      const pc = (sdh as any).peerConnection;
      if (!pc) return;

      pc.ontrack = (event: RTCTrackEvent<"track">) => {
        this.attachRemoteAudioTrack(managedSession, callId, event.track);
      };

      // Tracks may arrive during accept() before Established sets this handler.
      const receivers = pc.getReceivers?.() ?? [];
      for (const receiver of receivers) {
        this.attachRemoteAudioTrack(managedSession, callId, receiver.track);
      }
    } catch (error) {
      console.error("Error setting up remote media:", error);
    }
  }

  /**
   * Get the local media stream
   * @returns Promise that resolves with the local media stream
   */
  private async getLocalStream(): Promise<MediaStream> {
    try {
      const constraints = {
        audio: this.config.useAudio !== false,
        video: this.config.useVideo === true
      };

      const stream = await mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (error) {
      console.error("Error getting local media stream:", error);
      throw error;
    }
  }
}
