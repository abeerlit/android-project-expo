import type { MediaStream } from "@daily-co/react-native-webrtc";

/**
 * RTCIceServer interface (copied from WebRTC standard)
 */
export interface RTCIceServer {
  credential?: string;
  url?: string;
  urls?: string | string[];
  username?: string;
}

/**
 * Configuration for SIP connection
 */
export interface SipConfig {
  /**
   * SIP server WebSocket URI (e.g., wss://sip.example.com:8089/ws)
   */
  uri: string;

  /**
   * SIP user (e.g., 1000)
   */
  user: string;

  /**
   * SIP password
   */
  password: string;

  /**
   * SIP domain (e.g., sip.example.com)
   */
  domain: string;

  /**
   * Display name for outgoing calls
   */
  displayName?: string;

  /**
   * Registration expiration in seconds (default: 600)
   */
  registrationExpiration?: number;

  /**
   * Whether to use session timers (default: true)
   */
  sessionTimers?: boolean;

  /**
   * ICE servers for WebRTC
   */
  iceServers?: RTCIceServer[];

  /**
   * Whether to use ICE (default: true)
   */
  useIce?: boolean;

  /**
   * Whether to use DTLS (default: true)
   */
  useDtls?: boolean;

  /**
   * Whether to use SRTP (default: true)
   */
  useSrtp?: boolean;

  /**
   * Whether to use STUN (default: true)
   */
  useStun?: boolean;

  /**
   * Whether to use TURN (default: false)
   */
  useTurn?: boolean;

  /**
   * Whether to use audio (default: true)
   */
  useAudio?: boolean;

  /**
   * Whether to use video (default: false)
   */
  useVideo?: boolean;

  /**
   * Whether to use ringing (default: true)
   */
  useRinging?: boolean;

  /**
   * Whether to auto-answer incoming calls (default: false)
   */
  autoAnswer?: boolean;

  /**
   * Whether to auto-reject specific call types (default: false)
   */
  autoReject?: boolean;

  /**
   * Call types to auto-reject (e.g., ['auto-answer'])
   */
  autoRejectTypes?: string[];
}

/**
 * Call state
 */
export enum CallState {
  IDLE = "idle",
  INCOMING = "incoming",
  OUTGOING = "outgoing",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  HOLDING = "holding",
  HELD = "held",
  ENDED = "ended",
  FAILED = "failed"
}

/**
 * Call direction
 */
export enum CallDirection {
  INCOMING = "incoming",
  OUTGOING = "outgoing"
}

/**
 * Call information
 */
export interface CallInfo {
  /**
   * Call ID (SIP.js session ID for local tracking)
   */
  /**
   * Call ID (SIP.js session ID for local tracking)
   */
  id: string;

  /**
   * Native call UUID (mapped from CallKeep)
   */
  callUuid?: string;

  /**
   * Server-side call ID (from Xcid header or Call-ID)
   * Used for API calls to the backend
   */
  serverCallId?: string;

  /**
   * Android incoming UI hint: show "End and accept" only when another leg
   * is already answered (SIP dialog Established). Never set this based on
   * "another ringing invite".
   */
  useEndAndAcceptSecondLine?: boolean;

  /**
   * Call state
   */
  state: CallState;

  /**
   * Call direction
   */
  direction: CallDirection;

  /**
   * Remote party display name
   */
  remoteDisplayName: string;

  /**
   * Remote party URI
   */
  remoteUri: string;

  /**
   * Start time of the call
   */
  startTime: Date;

  /**
   * Answer time of the call (undefined if not answered yet)
   */
  answerTime?: Date;

  /**
   * End time of the call (undefined if not ended yet)
   */
  endTime?: Date;

  /**
   * Whether the call is muted
   */
  isMuted: boolean;

  /**
   * Whether the call is on hold
   */
  isOnHold: boolean;

  /**
   * Whether the speakerphone is enabled
   */
  isSpeakerOn: boolean;

  /**
   * Whether the call is an emergency call
   */
  isEmergency: boolean;

  /**
   * Whether this call is currently active (receiving audio)
   */
  isActive?: boolean;

  /**
   * Session relationship type for transfer management
   */
  relationshipType?: "parent" | "child" | "standalone";

  /**
   * Original VoIP push payload (for VoIP calls)
   */
  voipPayload?: any;

  /**
   * Child session ID (for parent sessions in attended transfers)
   */
  childSessionId?: string;

  /**
   * Parent session ID (for child sessions in attended transfers)
   */
  parentSessionId?: string;

  /**
   * Current audio state
   */
  audioState?: "active" | "muted" | "held" | "disabled";

  /**
   * Local media stream
   */
  localStream?: MediaStream;

  /**
   * Remote media stream
   */
  remoteStream?: MediaStream;
}

/**
 * Options for making a call
 */
export interface CallOptions {
  /**
   * Custom headers to include in the call
   */
  customHeaders?: Record<string, string>;

  /**
   * Whether this is an emergency call
   */
  isEmergency?: boolean;

  /**
   * Location data for emergency calls
   */
  locationData?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    altitude?: number;
    altitudeAccuracy?: number;
    heading?: number;
    speed?: number;
  };

  /**
   * Call UUID for tracking purposes
   */
  callUuid?: string;

  /**
   * Outbound number ID for specific number selection
   */
  outboundNumberId?: string;

  /**
   * Pre-resolved contact display name (e.g. from Keypad contact picker).
   * When provided, InCallScreen will use this instead of lookup.
   */
  displayName?: string;

  /**
   * Pre-resolved contact avatar path (e.g. from Keypad contact picker).
   * When provided, InCallScreen will use this instead of lookup.
   */
  avatarPath?: string | null;

  /**
   * Caller display name (mobile user) - sent as X-VoxoConnect-Caller-Name for web
   */
  callerDisplayName?: string;

  /**
   * Caller number/extension (mobile user) - sent as X-VoxoConnect-Caller-Number for web
   */
  callerNumber?: string;

  /**
   * Callee display name (contact being called) - sent as X-VoxoConnect-Callee-Name for web
   */
  calleeDisplayName?: string;

  /**
   * Callee number (destination) - sent as X-VoxoConnect-Callee-Number for web
   */
  calleeNumber?: string;

  /**
   * Skip holdAllCalls before outbound (attended transfer: parent hold runs in parallel).
   */
  skipHold?: boolean;

  /**
   * Parent session id for attended transfer consult leg.
   */
  attendedTransferParentSessionId?: string;

  /**
   * Second leg during attended transfer — reuse media and skip ringback warm-up.
   */
  isAttendedTransferLeg?: boolean;
}

/**
 * Transfer state for attended transfers
 */
export enum TransferState {
  IDLE = "idle",
  DIALING = "dialing",
  CONNECTED = "connected",
  TRANSFERRING = "transferring",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  FAILED = "failed"
}

/**
 * Transfer type
 */
export enum TransferType {
  BLIND = "blind",
  ATTENDED = "attended"
}

/**
 * Conference state
 */
export interface ConferenceState {
  conferenceId: string;
  participants: string[];
  isActive: boolean;
}

/**
 * Remote party information (compatible with API)
 */
export interface RemoteParty {
  cidNum: string;
  cidName?: string;
  extension?: string;
}

/**
 * Enhanced call information for advanced features
 */
export interface SoftphoneCall {
  /**
   * Call ID from the backend/API
   */
  callId: string;

  /**
   * Session ID from SIP.js (for session management)
   */
  sessionId: string;

  /**
   * Call state
   */
  state: CallState;

  /**
   * Call direction
   */
  direction: CallDirection;

  /**
   * Remote party display name
   */
  remoteDisplayName: string;

  /**
   * Remote party URI
   */
  remoteUri: string;

  /**
   * Remote party information
   */
  remoteParty?: RemoteParty;

  /**
   * Start time of the call
   */
  startTime: Date;

  /**
   * Answer time of the call (undefined if not answered yet)
   */
  answerTime?: Date;

  /**
   * End time of the call (undefined if not ended yet)
   */
  endTime?: Date;

  /**
   * Whether the call is muted
   */
  isMuted: boolean;

  /**
   * Whether the call is on hold
   */
  isOnHold: boolean;

  /**
   * Whether the speakerphone is enabled
   */
  isSpeakerOn: boolean;

  /**
   * Whether the call is an emergency call
   */
  isEmergency: boolean;

  /**
   * Whether the call is connected
   */
  connected: boolean;

  /**
   * Whether the call is being recorded
   */
  recording: boolean;

  /**
   * Whether the call is in a conference
   */
  conferencing: boolean;

  /**
   * Conference ID if in a conference
   */
  conferenceId?: string;

  /**
   * Whether this is an attended transfer call
   */
  attendedTransfer: boolean;

  /**
   * Parent session ID for attended transfers
   */
  parentSessionId?: string;

  /**
   * Child session ID for attended transfers (set on parent call)
   */
  childSessionId?: string;

  /**
   * Total call duration in seconds
   */
  totalCallDuration: number;

  /**
   * Current hold duration in seconds (resets when unheld)
   */
  currentHoldDuration: number;

  /**
   * Total hold duration in seconds (cumulative)
   */
  totalHoldDuration: number;

  /**
   * Muted conference participants (channel IDs)
   */
  mutedConferenceParticipants: string[];

  /**
   * Local media stream
   */
  localStream?: MediaStream;

  /**
   * Remote media stream
   */
  remoteStream?: MediaStream;

  /**
   * Original VoIP push payload (for VoIP calls)
   */
  voipPayload?: any;

  /**
   * Native / FCM push call UUID when it differs from SIP sessionId (wake-up inbound).
   */
  callUuid?: string;

  /**
   * Pre-resolved contact display name (e.g. from Keypad when user selects contact).
   * Used by InCallScreen when useContactLookup fails to find a match.
   */
  contactDisplayName?: string;

  /**
   * Pre-resolved contact avatar path (e.g. from Keypad when user selects contact).
   * Used by InCallScreen when useContactLookup fails to find a match.
   */
  contactAvatarPath?: string | null;
}

/**
 * Events emitted by SippyCup
 */
export interface SippyCupEvents {
  /**
   * Emitted when SippyCup is initialized
   */
  initialized: () => void;

  /**
   * Emitted when SippyCup is registered with the SIP server
   */
  registered: () => void;

  /**
   * Emitted when SippyCup is unregistered from the SIP server
   */
  unregistered: () => void;

  /**
   * Emitted when an error occurs
   */
  error: (error: { type: string; error: any }) => void;

  /**
   * Emitted when a call state changes
   */
  callStateChanged: (callId: string, state: CallState) => void;

  /**
   * Emitted when a new call is received
   */
  incomingCall: (callId: string, callInfo: CallInfo) => void;

  /**
   * Emitted when an outgoing call is created
   */
  outgoingCall: (callId: string, callInfo: CallInfo) => void;

  /**
   * Emitted when a call is connected
   */
  callConnected: (callId: string) => void;

  /**
   * Emitted when a call is ended
   */
  callEnded: (callId: string, reason: string) => void;

  /**
   * Emitted when a call is held
   */
  callHeld: (callId: string) => void;

  /**
   * Emitted when a call is unheld
   */
  callUnheld: (callId: string) => void;

  /**
   * Emitted when a call is muted
   */
  callMuted: (callId: string) => void;

  /**
   * Emitted when a call is unmuted
   */
  callUnmuted: (callId: string) => void;

  /**
   * Emitted when speakerphone is enabled
   */
  callSpeakerOn: (callId: string) => void;

  /**
   * Emitted when speakerphone is disabled
   */
  callSpeakerOff: (callId: string) => void;

  /**
   * Emitted when DTMF tones are sent
   */
  dtmfSent: (callId: string, tones: string) => void;

  /**
   * Emitted when an attended transfer is started
   */
  attendedTransferStarted: (data: {
    originalCallId: string;
    transferCallId: string;
    targetNumber: string;
  }) => void;

  /**
   * Emitted when an attended transfer is completed
   */
  attendedTransferCompleted: (data: {
    originalCallId: string;
    transferCallId: string;
  }) => void;

  /**
   * Emitted when an attended transfer is cancelled
   */
  attendedTransferCancelled: (data: {
    originalCallId: string;
    transferCallId: string;
  }) => void;

  /**
   * Emitted when attended transfer calls are swapped
   */
  attendedTransferSwapped: (data: {
    originalCallId: string;
    transferCallId: string;
  }) => void;

  /**
   * Emitted when a conference is started
   */
  conferenceStarted: (data: { conferenceId: string; callId: string }) => void;

  /**
   * Emitted when a participant is added to conference
   */
  conferenceParticipantAdded: (data: {
    conferenceId: string;
    callId: string;
  }) => void;

  /**
   * Emitted when call recording state changes
   */
  recordingStateChanged: (callId: string, recording: boolean) => void;

  /**
   * Emitted when the active session changes
   */
  activeSessionChanged: (
    activeSessionId: string | null,
    previousSessionId: string | null
  ) => void;

  /**
   * Emitted when a session's active state changes
   */
  sessionActiveStateChanged: (sessionId: string, isActive: boolean) => void;

  /**
   * Emitted when a session's audio state changes
   */
  audioStateChanged: (
    sessionId: string,
    audioState: "active" | "muted" | "held" | "disabled"
  ) => void;

  /**
   * Emitted when a session's relationship changes
   */
  sessionRelationshipChanged: (
    sessionId: string,
    relationshipType: "parent" | "child",
    relatedSessionId: string
  ) => void;

  /**
   * Emitted when a session's relationships are cleared
   */
  sessionRelationshipCleared: (
    sessionId: string,
    wasType: "parent" | "child" | "standalone",
    relatedSessionId?: string
  ) => void;

  /**
   * Emitted when transfer state changes
   */
  transferStateChanged: (transferState: {
    isActive: boolean;
    originalSessionId: string | null;
    transferSessionId: string | null;
    canSwap: boolean;
    canComplete: boolean;
    transferContact?: { name: string; number: string; avatarPath?: string };
  }) => void;
}
