/* eslint-disable @typescript-eslint/no-unused-vars */
import events from "events";
// @ts-ignore to be refactored to TS
import jssip from "jssip";

const logger = {
  debug: (...args: any[]) => console.log("[SipSession]", ...args),
  error: (...args: any[]) => console.error("[SipSession]", ...args)
};

export class RtcStats {
  networkType?: string;
  natTraversal: "STUN" | "TURN" | "NONAT" | undefined;
  localIp: string | undefined;

  bytesSent: number = 0;
  bytesSentPerSecond: number = 0;

  bytesReceived: number = 0;
  bytesReceivedPerSecond: number = 0;

  localRTT: number | undefined;
  remoteRTT: number | undefined;

  receivedJitter: number | undefined;
  transmitJitter: number | undefined;

  receivedPackageLoss: number | undefined;
  transmitPackageLoss: number | undefined;

  inboundAudioLevel: number = 0;
}

interface SipSessionOptions {
  pcConfig: any;
  callUuid: string;
}

enum SessionStatus {
  init,
  ringing,
  answered,
  failed,
  ended
}

interface JsSIPPeerConnectionEvent {
  peerconnection: RTCPeerConnection;
}

interface JsSIPNameAddrHeader {
  display_name: string;
  uri: string;
}

interface JsSIPRTCSession {
  _connection: RTCPeerConnection;
  remote_identity: JsSIPNameAddrHeader;
  direction: "incoming" | "outgoing";
  status: string;
  C: any;
  answer(args: any): void;
  terminate(args: any): void;
  isInProgress(): boolean;
  isEstablished(): boolean;
  isEnded(): boolean;
  mute(args?: any): void;
  unmute(args?: any): void;
  hold(args?: any): void;
  unhold(args?: any): void;
  refer(target: string, args?: any): void;
  sendDTMF(tone: string, args?: any): void;
  renegotiate(options?: any): void;
  on(
    event:
      | "peerconnection"
      | "connecting"
      | "sending"
      | "provisional"
      | "progress"
      | "accepted"
      | "confirmed"
      | "ended"
      | "failed"
      | "newDTMF"
      | "newInfo"
      | "hold"
      | "unhold"
      | "muted"
      | "unmuted"
      | "reinvite"
      | "update"
      | "refer"
      | "replaces"
      | "sdp"
      | "icecandidate"
      | "getusermediafailed"
      | "peerconnection:createofferfailed"
      | "peerconnection:createanswerfailed"
      | "peerconnection:setlocaldescriptionfailed"
      | "peerconnection:setremotedescriptionfailed",
    handler: any
  ): void;
  once(
    event:
      | "peerconnection"
      | "connecting"
      | "sending"
      | "progress"
      | "accepted"
      | "confirmed"
      | "ended"
      | "failed"
      | "newDTMF"
      | "newInfo"
      | "hold"
      | "unhold"
      | "muted"
      | "unmuted"
      | "reinvite"
      | "update"
      | "refer"
      | "replaces"
      | "sdp"
      | "icecandidate"
      | "getusermediafailed"
      | "peerconnection:createofferfailed"
      | "peerconnection:createanswerfailed"
      | "peerconnection:setlocaldescriptionfailed"
      | "peerconnection:setremotedescriptionfailed",
    handler: any
  ): void;
}

class SipSession extends events.EventEmitter {
  private rtcSession: JsSIPRTCSession;
  private ua: any;
  private pcConfig: any;
  callUuid: string;
  status: SessionStatus;
  muted: boolean = false;
  localHold: boolean = false;
  remoteHold: boolean = false;
  speakerPhone: boolean = false;
  renegAllowed: boolean = false;

  private iceGatherTimeout: number = 10000;

  constructor(
    rtcSession: JsSIPRTCSession,
    ua: any,
    options: SipSessionOptions
  ) {
    super();

    // JsSIP.RTCSession instance.
    this.rtcSession = rtcSession;
    this.ua = ua;

    // Save given RTCPeerConnection config.
    this.pcConfig = options.pcConfig;

    //uuid for callkeep
    this.callUuid = options.callUuid;

    this.status = SessionStatus.init;

    if (this.rtcSession._connection) {
      //Outbound calls already has a peer connection
      logger.debug("Outbound call already has a peer connecteion.");
      this.onPeerConnection(this.rtcSession._connection);
    } else {
      //Inbound calls won't get a peer connection before answering
      logger.debug("Inbound calls wont get a peer connection before answering");
      this.rtcSession.on("peerconnection", (data: JsSIPPeerConnectionEvent) => {
        this.onPeerConnection(data.peerconnection);
      });
    }

    this.rtcSession.on("provisional", (evt: any) => {
      logger.debug("provisional", evt);

      if (evt.originator === "remote" && evt.response.status_code === 100) {
        this.emit("remoteTrying");
      }
    });

    this.rtcSession.on("progress", (evt: any) => {
      this.status = SessionStatus.ringing;
      this.emit("remoteProgress");

      if (evt.originator === "remote" && evt.response.status_code === 180) {
        logger.debug("remoteRinging");
        this.emit("remoteRinging");
      } else if (
        evt.originator === "remote" &&
        evt.response.status_code === 183
      ) {
        logger.debug("remoteSessionProgress");
        this.emit("remoteSessionProgress");
      }
    });

    this.rtcSession.on("accepted", () => {
      this.emit("accepted");
      this.status = SessionStatus.answered;
    });

    this.rtcSession.on("muted", () => {
      this.muted = true;
    });

    this.rtcSession.on("unmuted", () => {
      this.muted = false;
    });

    this.rtcSession.on("hold", (data: any) => {
      switch (data.originator) {
        case "local":
          this.localHold = true;
          break;
        case "remote":
          this.remoteHold = true;
          break;
      }
    });

    this.rtcSession.on("unhold", (data: any) => {
      switch (data.originator) {
        case "local":
          this.localHold = false;
          break;
        case "remote":
          this.remoteHold = false;
          break;
      }
    });

    this.rtcSession.on("refer", (data: any) => {
      const { request, accept } = data;

      // Let's always accept incoming REFERs.
      accept(
        (rtcSession: any) => {
          // Set the replaces flag into the session so it won't play ringing.
          if (request.refer_to.uri.hasHeader("replaces")) {
            rtcSession.data.replaces = true;
          }
        },
        {
          mediaConstraints: { audio: true, video: false },
          pcConfig: this.pcConfig
        }
      );
    });

    this.rtcSession.on("replaces", (data: any) => {
      const { accept } = data;

      accept((rtcSession: any) => {
        // Set the replaces flag into the session so it won't ring.
        rtcSession.data.replaces = true;

        // Auto-answer (unless already answered).
        if (!rtcSession.isEstablished()) {
          rtcSession.answer({
            mediaConstraints: { audio: true, video: false },
            pcConfig: this.pcConfig
          });
        }
      });
    });

    // Handle remote hang-up (BYE) or call failure after established — dismiss CallKit and clean up
    this.rtcSession.on("ended", (data: any) => {
      if (this.status !== SessionStatus.ended) {
        this.status = SessionStatus.ended;
        console.warn(
          `🔵 [SipSession] rtcSession ended (remote BYE) for ${this.callUuid}`
        );
        this.emit("sessionEnded", data);
      }
    });
    this.rtcSession.on("failed", (data: any) => {
      // For established calls that fail (e.g. network), also emit sessionEnded
      if (
        this.status === SessionStatus.answered &&
        this.status !== SessionStatus.ended
      ) {
        this.status = SessionStatus.ended;
        console.warn(
          `🔵 [SipSession] rtcSession failed (established call) for ${this.callUuid}`,
          data?.cause || data
        );
        this.emit("sessionEnded", data);
      }
    });

    let forceIceReadyTimer: any = null;

    /* Handle ICE Candidate Gathering */
    this.rtcSession.on("icecandidate", (evt: any) => {
      logger.debug("ICE Candidate Received", evt?.candidate?.candidate);

      if (!forceIceReadyTimer) {
        this.rtcSession._connection.addEventListener(
          "icegatheringstatechange",
          () => {
            if (
              forceIceReadyTimer &&
              this.rtcSession._connection.iceGatheringState === "complete"
            ) {
              logger.debug("ICE Gathering Complete, cancelling timeout");

              clearTimeout(forceIceReadyTimer);
              forceIceReadyTimer = null;
            }
          }
        );

        logger.debug(
          "ICE Gathering Started, queueing " +
            this.iceGatherTimeout +
            " timeout."
        );
        forceIceReadyTimer = setTimeout(() => {
          logger.debug(
            "ICE Gather timeout reached, forcing ICE Ready",
            this.rtcSession._connection
          );

          forceIceReadyTimer = null;
          evt.ready();
        }, this.iceGatherTimeout);
      }
    });
  }

  async performRenegotiate(): Promise<void> {
    this.rtcSession._connection.restartIce();
    this.renegAllowed = true;
  }

  private onPeerConnection(pc: RTCPeerConnection) {
    logger.debug("Reached On Peer Connection");
    pc.addEventListener("addstream", () => {
      logger.debug("playing remote audio (addstream)");
    });

    pc.addEventListener("negotiationneeded", (evt) => {
      if (this.renegAllowed) {
        this.renegAllowed = false;
        logger.debug("negotiationneeded", evt);
        this.rtcSession.renegotiate({
          rtcOfferConstraints: { iceRestart: true }
        });
      }
    });

    pc.addEventListener("iceconnectionstatechange", (evt) => {
      logger.debug("iceConnectionState", pc.iceConnectionState);
    });
  }

  get answered(): boolean {
    return this.status === SessionStatus.answered;
  }

  /** True when the rtcSession has already ended (e.g. remote BYE). Do not send 603/BYE. */
  isEnded(): boolean {
    return this.rtcSession?.isEnded?.() ?? false;
  }

  isOutgoing(): boolean {
    return this.rtcSession.direction === "outgoing";
  }

  isIncoming(): boolean {
    return this.rtcSession.direction === "incoming";
  }

  answer(): void {
    if (this.status !== SessionStatus.answered) {
      console.log(`🔵 [SipSession] Answering call ${this.callUuid}`);
      logger.debug("Answering call");
      this.rtcSession.answer({
        mediaConstraints: { audio: true, video: false },
        rtcOfferConstraints: { mandatory: { OfferToReceiveVideo: false } },
        rtcAnswerConstraints: { mandatory: { OfferToReceiveVideo: false } }
      });
    } else {
      logger.debug("Already answered, no-op", this);
      return;
    }

    if (this.rtcSession.isEstablished()) {
      this.status = SessionStatus.answered;
    }
  }

  sipTerminate(): void {
    if (this.rtcSession.isEnded()) {
      logger.debug("sipTerminate() Session is already ended", this);
      return;
    }

    logger.debug("sipTerminate()");
    this.rtcSession.terminate({
      status_code: null,
      reason_phrase: null
    });
  }

  sipRejectUserBusy(): void {
    if (this.rtcSession.isEnded()) {
      logger.debug("sipTerminate() Session is already ended", this);
      return;
    }

    logger.debug("sipTerminate()");
    this.rtcSession.terminate({
      status_code: 603,
      reason_phrase: "Decline"
    });
  }

  webRTCmute(): void {
    this.rtcSession.mute({ audio: true, video: true });
  }

  webRTCunmute(): void {
    this.rtcSession.unmute({ audio: true, video: true });
  }

  sipHold(): void {
    this.rtcSession.hold();
  }

  sipUnhold(): void {
    this.rtcSession.unhold();
  }

  sendSipInfoDtmf(tone: string): void {
    if (tone) {
      logger.debug("Send DTMF via SIP INFO", tone);
      this.rtcSession.sendDTMF(tone, {
        duration: 250,
        interToneGap: 1200
      });
    }
  }

  blindTransfer(destination: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.rtcSession.refer("sip:" + destination + "@dev-sip.voxo.co", {
        eventHandlers: {
          requestSucceeded: (data: any) => resolve(data),
          requestFailed: (data: any) => reject(data),
          failed: (data: any) => reject(data)
        }
      });
    });
  }

  attendedTransferTo(target: SipSession): Promise<any> {
    const targetSession = target.rtcSession;
    return new Promise((resolve, reject) => {
      this.rtcSession.refer(targetSession.remote_identity.uri, {
        eventHandlers: {
          requestSucceeded: (data: any) => resolve(data),
          requestFailed: (data: any) => reject(data),
          failed: (data: any) => reject(data)
        },
        replaces: targetSession
      });
    });
  }

  /** Resolve when session is established. Listens for both 'accepted' and 'confirmed',
   * plus a polling fallback for when app backgrounds (events may be delayed).
   * Timeout after 20s to avoid hanging. */
  established(): Promise<any> {
    const ESTABLISH_TIMEOUT_MS = 20000;
    const POLL_INTERVAL_MS = 300;

    const promise = new Promise<any>((resolve, reject) => {
      let resolved = false;
      let timeoutId: ReturnType<typeof setTimeout>;
      let pollId: ReturnType<typeof setInterval>;

      const onFailed = (data: any) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        logger.debug("Establish Failed");
        reject(data);
      };

      const onAccepted = (data: any) => {
        logger.debug("Establish Accepted");
        resolveOnce(data);
      };

      const onConfirmed = (data: any) => {
        logger.debug("Establish Confirmed");
        resolveOnce(data);
      };

      const cleanup = () => {
        clearTimeout(timeoutId);
        clearInterval(pollId);
        this.rtcSession.removeListener("failed", onFailed);
        this.rtcSession.removeListener("accepted", onAccepted);
        this.rtcSession.removeListener("confirmed", onConfirmed);
      };

      const resolveOnce = (data?: any) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(data);
      };

      this.rtcSession.once("failed", onFailed);
      this.rtcSession.once("accepted", onAccepted);
      this.rtcSession.once("confirmed", onConfirmed);

      timeoutId = setTimeout(() => {
        if (resolved) return;
        if (this.rtcSession.isEstablished && this.rtcSession.isEstablished()) {
          logger.debug("Establish: resolved via isEstablished() at timeout");
          resolveOnce({});
          return;
        }
        resolved = true;
        cleanup();
        logger.debug("Establish: timeout waiting for accepted/confirmed");
        reject(new Error("establish_timeout"));
      }, ESTABLISH_TIMEOUT_MS);

      pollId = setInterval(() => {
        if (resolved) return;
        if (this.rtcSession.isEstablished && this.rtcSession.isEstablished()) {
          logger.debug("Establish: resolved via isEstablished() poll (app may have been backgrounded)");
          resolveOnce({});
        }
      }, POLL_INTERVAL_MS);
    });

    promise.catch(() => {});
    return promise;
  }

  callCompletion(): Promise<any> {
    return new Promise((resolve, reject) => {
      this.rtcSession.once("failed", (data: any) => {
        reject(data);
      });

      this.rtcSession.once("ended", (data: any) => {
        resolve(data);
      });
    });
  }
}

export { SipSession };
