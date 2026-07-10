import events from "events";
// @ts-ignore to be refactored to TS
import jssip from "jssip";
import { AppState, Platform } from "react-native";
import DeviceInfo from "react-native-device-info";
import { SipSession } from "./SipSession";
// Using @react-native-community/geolocation instead of react-native-get-location
import Geolocation from "@react-native-community/geolocation";

const logger = {
  debug: (...args: any[]) => console.log("[SlimSipClient]", ...args),
  error: (...args: any[]) => console.error("[SlimSipClient]", ...args)
};

/** Incoming INVITE request (JsSIP) — same header resolution idea as SoftphoneProvider merge helpers. */
function getInviteHeaderValue(
  request: any,
  headerName: string
): string | undefined {
  if (!request) return undefined;
  if (typeof request.getHeader === "function") {
    const direct = request.getHeader(headerName);
    if (direct) return String(direct);
  }
  const headers = request.headers;
  if (!headers || typeof headers !== "object") return undefined;
  const target = headerName.toLowerCase();
  const matchedKey = Object.keys(headers).find(
    (k) => k.toLowerCase() === target
  );
  if (!matchedKey) return undefined;
  const val = headers[matchedKey];
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0] as any;
    if (typeof first === "string") return first;
    if (typeof first?.raw === "string") return first.raw;
  }
  if (typeof val === "string") return val;
  if (typeof (val as any)?.raw === "string") return (val as any).raw;
  return undefined;
}

/**
 * Log Xcid (merge id) from INVITE on Android only — shows in Logcat / Metro.
 * Native `android/` Gradle project does not parse SIP; JsSIP runs in JS under this repo.
 */
function logAndroidMergeXcidFromInvite(inviteRequest: any, callUuid: string) {
  if (Platform.OS !== "android") return;
  const xcid =
    getInviteHeaderValue(inviteRequest, "Xcid") ||
    getInviteHeaderValue(inviteRequest, "X-Cid") ||
    getInviteHeaderValue(inviteRequest, "XCID");
  const sipCallId =
    inviteRequest?.call_id ?? getInviteHeaderValue(inviteRequest, "Call-ID");
  const headerKeys = inviteRequest?.headers
    ? Object.keys(inviteRequest.headers)
    : [];
  const xcidLikeKeys = headerKeys.filter((k) =>
    /xcid|x-cid|call-id/i.test(k)
  );
  console.warn(
    "[ANDROID-MERGE-XCID] INVITE after register — merge / conference id (filter Logcat by ANDROID-MERGE-XCID)",
    JSON.stringify(
      {
        callUuid,
        hasXcid: !!xcid,
        xcid: xcid ?? null,
        sipCallId: sipCallId ?? null,
        xcidLikeHeaderKeys: xcidLikeKeys,
        headerKeyCount: headerKeys.length
      },
      null,
      2
    )
  );
}

export class WebSocketConnectTimeoutError extends Error {
  constructor() {
    super();
    this.message = "Websocket Connection Timeout";
  }
}

export class WebSocketConnectionError extends Error {
  constructor() {
    super();
    this.message = "An error occurred with websocket";
  }
}

export interface SipClientSettings {
  routeOptions?: RouteOptions;
  pcConfig: any;
  token: string;
  sipUri: string;
  name: string;
  wsUrl: string;
  password: string;
}

interface RouteOptions {
  direction: "inbound" | "outbound";
  callUuid: string;
  route?: string;
}

export class SlimSipClient extends events.EventEmitter {
  private settings: any;
  private pcConfig: any;
  private token: string;
  private ua: any;
  private rtcSession: any;
  private socket: any;
  private commonRegistrationHeaders: string[];
  private connectPromise: Promise<string | void>;
  private WSS_CONNECT_TIMEOUT: number = 5000;

  constructor(settings: SipClientSettings) {
    super();
    this.settings = settings;
    this.pcConfig = settings.pcConfig;
    this.token = settings.token;
    const _route = settings.routeOptions!;
    const wsUrl = settings.wsUrl;

    const JsSip = typeof jssip !== "undefined" ? jssip : require("jssip");
    if (!JsSip?.WebSocketInterface) {
      throw new Error("SlimSipClient: jssip.WebSocketInterface not available");
    }
    this.socket = new JsSip.WebSocketInterface(wsUrl);
    this.socket.via_transport = "ws";
    logger.debug("Socket1212", this.socket);
    this.ua = new JsSip.UA({
      password: settings.password,
      uri: settings.sipUri,
      display_name: settings.name,
      sockets: [this.socket],
      register_expires: 300,
      session_timers: true,
      no_answer_timeout: 120,
      register: true,
      user_agent: `${DeviceInfo.getApplicationName()} ${
        Platform.OS
      } ${DeviceInfo.getVersion()} ${DeviceInfo.getBuildNumber()}`,
      connection_recovery_min_interval: 1,
      connection_recovery_max_interval: 3
    });
    logger.debug("Sipp Settings", settings);
    logger.debug("Sipp User Agent", this.ua);
    this.commonRegistrationHeaders = ["Authorization: Bearer " + this.token];
    this.connectPromise = new Promise<void>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new WebSocketConnectTimeoutError());
      }, this.WSS_CONNECT_TIMEOUT);

      this.ua.once("connected", () => {
        logger.debug("Connection Promise Received");
        clearTimeout(timeoutHandle);
        resolve();
      });

      this.ua.once("disconnected", () => {
        logger.debug("Connection Promise Not Received");
        clearTimeout(timeoutHandle);
        reject(new WebSocketConnectionError());
      });
    });

    let isReconnecting = false;
    this.ua.once("registered", () => {
      //After first registration, we need to deal with reconnections
      this.ua.on("disconnected", () => {
        logger.debug("User Agent Disconnected");
        if (!isReconnecting) {
          this.emit("disconnected");

          this.ua.once("connected", () => {
            this.emit("reconnected");

            this.ua.once("registered", () => {
              this.emit("renegotiate");
              isReconnecting = false;
            });
          });

          isReconnecting = true;
        }
      });
    });
  }

  async connect() {
    return this.connectPromise;
  }

  async call(
    exten: string,
    uuid: string,
    outboundNumberId?: string
  ): Promise<SipSession> {
    const ua = this.ua;

    const rtcSessionPromise = new Promise<SipSession>((resolve) => {
      try {
        ua.once("newRTCSession", (establishedSession: any) => {
          const rtcSession = establishedSession.session;
          logger.debug("newRTCSession", rtcSession);

          this.rtcSession = rtcSession;

          const sipSession = new SipSession(rtcSession, this.ua, {
            pcConfig: this.pcConfig,
            callUuid: uuid
          });

          this.on("renegotiate", () => {
            sipSession.performRenegotiate();
          });

          resolve(sipSession);
        });
      } catch {
        logger.debug("there was an error");
      }
    });

    const extraHeaders = ["X-VoxoConnect-Call-Uuid: " + uuid];
    if (outboundNumberId) {
      logger.debug(
        "call() has a specific number id specified: " + outboundNumberId
      );
      extraHeaders.push(
        "X-VoxoConnect-Outbound-Number-ID: " + outboundNumberId
      );
    }

    if (exten == "911" || exten == "933") {
      try {
        // Get location for emergency calls
        const location = await new Promise<{
          latitude: number;
          longitude: number;
        }>((resolve, reject) => {
          Geolocation.getCurrentPosition(
            (position) =>
              resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
              }),
            (error) => reject(error),
            { enableHighAccuracy: true, timeout: 15000 }
          );
        });
        if (location) {
          extraHeaders.push(
            `X-Location: geo:${location.latitude},${location.longitude}`
          );
        }
      } catch (e) {
        logger.debug("there was an error getting location", e);
      }
    }

    ua.start();
    await this.connect();

    logger.debug("Connected and Setup Call");
    const obj = {
      data: {
        originalNumber: `sip:${exten}@dev-sip.voxo.co`,
        uuid: uuid
      },
      extraHeaders,
      mediaConstraints: { audio: true, video: false },
      rtcOfferConstraints: { mandatory: { OfferToReceiveVideo: false } }
    };

    logger.debug("Object for call", JSON.stringify(obj));
    ua.call(`sip:${exten}@dev-sip.voxo.co`, obj);

    return await rtcSessionPromise;
  }

  async establishInboundSession(
    callUuid: string,
    callerIp: string
  ): Promise<SipSession> {
    const ts = () => new Date().toISOString();
    console.warn(
      `🔵 [SIP] ${ts()} establishInboundSession START | uuid=${callUuid} ip=${callerIp} AppState=${
        AppState.currentState
      }`
    );
    const ua = this.ua;

    // Log UA/socket lifecycle to verify SIP stays active (especially in background)
    const logUaState = (ev: string, extra?: string) => {
      let socketState = "unknown";
      try {
        socketState =
          this.socket?.isConnected?.() ?? false ? "connected" : "disconnected";
      } catch (_) {
        // Safely ignore errors checking socket state
      }
      console.warn(
        `🔵 [SIP] ${ts()} UA event: ${ev} | callUuid=${callUuid} | socket=${socketState}${
          extra ? ` | ${extra}` : ""
        }`
      );
    };
    ua.on("connecting", () => logUaState("connecting"));
    ua.on("connected", () => logUaState("connected"));
    ua.on("disconnected", (data: any) =>
      logUaState(
        "disconnected",
        `data=${JSON.stringify(data?.error || data?.code || "")}`
      )
    );
    ua.on("registered", () => logUaState("registered"));
    ua.on("unregistered", () => logUaState("unregistered"));
    ua.on("registrationFailed", (data: any) => {
      const code = data?.response?.status_code;
      const reason = data?.response?.parseHeader?.("reason");
      logUaState(
        "registrationFailed",
        `status=${code} reason=${JSON.stringify(reason)}`
      );
    });

    const rtcSessionPromise = new Promise<SipSession>((resolve, reject) => {
      let timeoutHandle: any = null;

      ua.once("newRTCSession", (establishedSession: any) => {
        console.warn(
          `🔵 [SIP] ${ts()} ✅ INVITE RECEIVED (newRTCSession) for ${callUuid} — SIP is active, waiting for user answer`
        );
        const rtcSession = establishedSession.session;
        logger.debug("newRTCSession", rtcSession);

        this.rtcSession = rtcSession;

        logAndroidMergeXcidFromInvite(rtcSession?._request, callUuid);

        const sipSession = new SipSession(rtcSession, this.ua, {
          pcConfig: this.pcConfig,
          callUuid: callUuid
        });

        // Catch CANCEL (caller hung up) after INVITE received but before user answered
        rtcSession.on("failed", (data: any) => {

          console.log("🟪 [SlimSipClient] 📞 rtcSession failed", JSON.stringify(data));

          const cause = data?.cause || data?.originator || "";
          if(cause === "Rejected"){
           //Todo Create Notificaiton based on cause of the call 
          }
          console.warn(
            `🔵 [SIP] ${ts()} 🚫 rtcSession FAILED (caller hung up?) | callUuid=${callUuid} cause=${cause} originator=${
              data?.originator
            }`
          );
          sipSession.emit("sessionFailed", data);
        });

        this.on("renegotiate", () => {
          sipSession.performRenegotiate();
        });

        resolve(sipSession);

        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      });

      ua.once("registrationFailed", (data: any) => {
        const statusCode = data?.response?.status_code;
        const reason = data?.response?.parseHeader?.("reason");
        console.error(
          `🔵 [SIP] ${ts()} ❌ REGISTRATION FAILED for ${callUuid} | status=${statusCode} reason=${JSON.stringify(
            reason
          )} (caller hung up before INVITE?)`
        );
        if (statusCode == 404) {
          const reason = data.response.parseHeader("reason");
          if (reason?.cause === 200) {
            console.error(`🔵 [SIP] ${ts()} ❌ 404 reason=ANSWERED_ELSEWHERE`);
            reject({
              error: "INVITE_ANSWERED_ELSEWHERE",
              message: "Incoming invite was answered elsewhere"
            });
          } else {
            console.error(`🔵 [SIP] ${ts()} ❌ 404 reason=CANCELLED_EARLY`);
            reject({
              error: "INVITE_CANCELLED_EARLY",
              message: "Incoming invite was cancelled early"
            });
          }
        } else {
          console.error(
            `🔵 [SIP] ${ts()} ❌ Registration error:`,
            JSON.stringify(data?.response?.status_code)
          );
          reject(data);
        }
      });

      ua.once("registered", () => {
        console.warn(
          `🔵 [SIP] ${ts()} ✅ REGISTERED for ${callUuid} - waiting for INVITE (8s timeout)`
        );

        //When registration has succeeded, we remove the additional parameters, as any further
        //registrations will be in case of (meaningless) rereigsters and the more meaningful
        //register in case of reconnecting the websocket.
        ua.registrator().setExtraHeaders(this.commonRegistrationHeaders);

        timeoutHandle = setTimeout(() => {
          console.error(
            `🔵 [SIP] ${ts()} ❌ INVITE TIMEOUT (8s) for ${callUuid} - no INVITE after REGISTER`
          );
          reject({
            error: "RECEIVE_INVITE_TIMEOUT",
            message: "Timeout waiting for invite"
          });
        }, 8000);
      });
    });

    //Attach additional headers to signal the call we wish to retrieve from Drachtio
    console.warn(
      `🔵 [SIP] ${ts()} Setting headers: X-UUID=${callUuid} X-PUSH=1 X-IP=${callerIp}`
    );
    ua.registrator().setExtraHeaders([
      ...this.commonRegistrationHeaders,
      "X-UUID: " + callUuid,
      "X-PUSH: 1",
      "X-IP: " + callerIp
    ]);

    console.warn(`🔵 [SIP] ${ts()} Starting UA...`);
    ua.start();
    console.warn(
      `🔵 [SIP] ${ts()} Connecting WebSocket to ${
        this.settings.wsUrl
      } (callUuid=${callUuid})...`
    );
    await this.connect();

    console.warn(
      `🔵 [SIP] ${ts()} ✅ WebSocket connected | callUuid=${callUuid} | SIP active, waiting for INVITE or CANCEL...`
    );
    return rtcSessionPromise;
  }

  async rejectInboundSession(
    callUuid: string,
    _callId: string
  ): Promise<SipSession> {
    const ua = this.ua;

    const rtcSessionPromise = new Promise<SipSession>((resolve, reject) => {
      let timeoutHandle: any = null;
      ua.once("newRTCSession", (establishedSession: any) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const rtcSession = establishedSession.session;

        rtcSession.once("ended", (data: any) => resolve(data));
        rtcSession.once("failed", (data: any) => reject(data));

        rtcSession.terminate({
          status_code: 480,
          reason_phrase: "Temporarily Unavailable"
        });
      });

      ua.once("registrationFailed", (data: any) => {
        if (data.response.status_code == 404) {
          const reason = data.response.parseHeader("reason");
          if (reason?.cause === 200) {
            logger.debug("REJECT: INVITE_ANSWERED_ELSEWHERE", reason);
            reject({
              error: "INVITE_ANSWERED_ELSEWHERE",
              message: "Incoming invite was answered elsewhere"
            });
          } else {
            logger.debug("REJECT: INVITE_CANCELLED_EARLY");
            reject({
              error: "INVITE_CANCELLED_EARLY",
              message: "Incoming invite was cancelled early"
            });
          }
        } else {
          logger.debug("REJECT: ERROR", data);
          reject(data);
        }
      });

      ua.once("registered", () => {
        logger.debug("registered");

        ua.registrator().setExtraHeaders(this.commonRegistrationHeaders);
        timeoutHandle = setTimeout(() => {
          logger.debug("REJECT: RECEIVE_INVITE_TIMEOUT");
          reject({
            error: "RECEIVE_INVITE_TIMEOUT",
            message: "Timeout waiting for invite"
          });
        }, 8000);
      });
    });

    ua.registrator().setExtraHeaders([
      ...this.commonRegistrationHeaders,
      "X-UUID: " + callUuid,
      "X-PUSH: 1"
    ]);

    ua.start();
    await this.connect();

    return rtcSessionPromise;
  }

  async dispose() {
    logger.debug("dispose()");

    this.removeAllListeners();

    let resolveDisconnect = () => {};
    const disconnectPromise = new Promise<void>((resolve) => {
      resolveDisconnect = () => {
        logger.debug("Resolving disconnectPromise");
        resolve();
      };
    });

    const timeoutPromise = new Promise<void>((resolve) => {
      const timeoutHandle = setTimeout(() => {
        logger.debug("Resolving timeoutPromise");
        resolve();
        this.socket.disconnect();
      }, 5000);

      disconnectPromise
        .then(() => {
          logger.debug("Cancel timeout");
          clearTimeout(timeoutHandle);
          return;
        })
        .catch(() => {});
    });

    this.ua.once("disconnected", () => {
      logger.debug(
        "Websocket disconnected after dispose - detaching event handling"
      );
      this.ua.removeAllListeners();

      if (this.rtcSession) {
        this.rtcSession.removeAllListeners();
      }

      resolveDisconnect();
    });

    this.ua.stop();

    logger.debug("awaiting race");
    await Promise.race([disconnectPromise, timeoutPromise]);
  }
}
