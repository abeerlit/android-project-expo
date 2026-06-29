import { createContext } from "react";
import { CallOptions, SipConfig, SoftphoneCall, RemoteParty } from "./types";

/**
 * Serializable call state for the context
 * (SoftphoneCall with serialized dates for React Context)
 */
export interface ContextCallInfo
  extends Omit<
    SoftphoneCall,
    "startTime" | "answerTime" | "endTime" | "localStream" | "remoteStream"
  > {
  startTime: string;
  answerTime?: string;
  endTime?: string;
}

/**
 * Softphone context state
 */
export interface SoftphoneContextState {
  /**
   * Whether the softphone is initialized
   */
  isInitialized: boolean;

  /**
   * Whether the softphone is initializing
   */
  isInitializing: boolean;

  /**
   * Whether the softphone is registered
   */
  isRegistered: boolean;

  /**
   * Whether the softphone is registering
   */
  isRegistering: boolean;

  /**
   * Softphone configuration
   */
  config: SipConfig | null;

  // Transfer state is now managed via parent/child session ID pointers in individual calls

  /**
   * All calls (computed from above arrays)
   */
  calls: Record<string, ContextCallInfo>;

  /**
   * Current active call ID (derived from currentCall)
   */
  activeCallId?: string;

  /**
   * True when any call is in progress (including the "dialing" placeholder).
   * Use this to disable call buttons throughout the app until the call ends.
   */
  hasOngoingCall: boolean;

  /**
   * Error message
   */
  error?: any;
}

/**
 * Softphone context methods
 */
export interface SoftphoneContextMethods {
  /**
   * Set the softphone configuration
   */
  setConfig: (config: SipConfig) => void;

  /**
   * Make a call
   */
  makeCall: (destination: string, options?: CallOptions) => Promise<string>;

  /**
   * Answer an incoming call
   */
  answerCall: (callId: string) => Promise<void>;

  /**
   * Answer an incoming call via CallKeep (recommended for foreground calls)
   * This triggers CallKeep's native answer flow, ensuring proper audio routing
   * and notification dismissal, especially on iOS.
   */
  answerCallViaCallKeep: (callId: string) => Promise<void>;

  /**
   * Answer VoIP call from in-app UI (alias for answerCall when call is VoIP).
   */
  answerVoipCallFromInApp: (callId: string) => void | Promise<void>;

  /**
   * Decline an incoming call
   */
  declineCall: (callId: string) => Promise<void>;

  /**
   * Hang up a call
   */
  hangupCall: (callId: string) => Promise<void>;

  /**
   * Hold a call
   */
  holdCall: (callId: string) => Promise<void>;

  /**
   * Unhold a call
   */
  unholdCall: (callId: string) => Promise<void>;

  /**
   * Mute a call
   */
  muteCall: (callId: string) => Promise<void>;

  /**
   * Unmute a call
   */
  unmuteCall: (callId: string) => Promise<void>;

  /**
   * Set speakerphone on/off for a call
   */
  setSpeaker: (callId: string, enabled: boolean) => Promise<void>;

  /**
   * Send DTMF tones
   */
  sendDTMF: (callId: string, tones: string) => Promise<void>;

  /**
   * Transfer a call (blind transfer)
   */
  transferCall: (callId: string, targetNumber: string) => Promise<void>;

  /**
   * Start attended transfer
   * @param options.displayName — contact name from picker (shown in merge UI / CallKit)
   */
  startAttendedTransfer: (
    callId: string,
    targetNumber: string,
    options?: { displayName?: string }
  ) => Promise<string>;

  /**
   * Complete attended transfer
   */
  completeAttendedTransfer: () => Promise<void>;

  /**
   * Swap attended transfer calls
   */
  swapAttendedTransferCalls: (
    originalCallId: string,
    transferCallId: string
  ) => Promise<void>;

  /**
   * Clear any error state
   */
  clearError: () => void;

  /**
   * Clean up the softphone (for logout)
   */
  cleanup: () => Promise<void>;

  // Enhanced call management methods

  /**
   * Set the current active call
   */
  setCurrentCall: (call: ContextCallInfo) => Promise<void>;

  /**
   * Set current call as connected
   */
  setCurrentCallConnected: (call: ContextCallInfo) => void;

  /**
   * Update current call data
   */
  updateCurrentCallData: (data: RemoteParty) => void;

  /**
   * Clear the current call
   */
  clearCurrentCall: () => void;

  /**
   * Add an incoming call
   */
  addIncomingCall: (call: ContextCallInfo) => void;

  /**
   * Remove an incoming call
   */
  removeIncomingCall: (sessionId: string) => void;

  /**
   * Add a call to hold
   */
  addCallOnHold: (call: ContextCallInfo) => void;

  /**
   * Remove a call from hold
   */
  removeCallOnHold: (sessionId: string) => void;

  /**
   * Hold the current call
   */
  holdCurrentCall: () => Promise<void>;

  /**
   * Get call by session ID
   */
  getCallById: (sessionId: string) => ContextCallInfo | undefined;

  /**
   * Get child call by session ID (for transfers)
   */
  getChildCallBySessionId: (
    sessionId: string
  ) => ContextCallInfo | null | undefined;

  /**
   * Get parent call by session ID (for transfers)
   */
  getParentCallBySessionId: (
    sessionId: string
  ) => ContextCallInfo | null | undefined;

  /**
   * Update call durations (called by timer)
   */
  updateCallDurations: (seconds: number) => void;

  /**
   * Set conferencing state
   */
  setConferencing: (conferenceId: string) => void;

  /**
   * Start conference between two calls
   */
  startConference: (
    childCall: ContextCallInfo,
    parentCall: ContextCallInfo
  ) => Promise<void>;

  /**
   * Add participant to existing conference
   */
  addParticipantToConferenceCall: (
    childCall: ContextCallInfo,
    parentCall: ContextCallInfo
  ) => Promise<void>;

  /**
   * Merge attended transfer into conference
   * @param mode - "conferenceMerge" for Add People, "attendedTransfer" for transfer handoff
   */
  mergeAttendedTransfer: (
    mode?: "conferenceMerge" | "attendedTransfer"
  ) => Promise<void>;

  /**
   * Cancel attended transfer
   */
  cancelAttendedTransfer: (parentCallId: string) => Promise<void>;

  /**
   * Add participant to conference by ID
   */
  addParticipantToConference: (conferenceId: string) => Promise<void>;

  /**
   * Set muted conference participant
   */
  setMutedConferenceParticipant: (sessionId: string, channel: string) => void;

  /**
   * Remove muted conference participant
   */
  removeMutedConferenceParticipant: (
    sessionId: string,
    channel: string
  ) => void;

  /**
   * Unmute all conference participants
   */
  unMuteAllConferenceParticipants: (sessionId: string) => Promise<void>;

  // Computed getters

  /**
   * Get all calls combined
   */
  getAllCalls: () => ContextCallInfo[];

  /**
   * Whether to show active call bar
   */
  getShowActiveCallBar: () => boolean;

  /**
   * Get conference call if any
   */
  getConferenceCall: () => ContextCallInfo | null;

  /**
   * Whether original call is on hold
   */
  getOriginalCallOnHold: () => boolean;
}

/**
 * Combined context value
 */
export interface SoftphoneContextValue
  extends SoftphoneContextState,
    SoftphoneContextMethods {}

/**
 * Default context value
 */
const defaultContextValue: SoftphoneContextValue = {
  // State
  isInitialized: false,
  isInitializing: false,
  isRegistered: false,
  isRegistering: false,
  config: null,
  calls: {},
  activeCallId: undefined,
  hasOngoingCall: false,
  error: undefined,

  // Methods - throw errors if not properly initialized
  setConfig: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  makeCall: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  answerCall: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  answerCallViaCallKeep: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  answerVoipCallFromInApp: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  declineCall: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  hangupCall: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  holdCall: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  unholdCall: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  muteCall: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  unmuteCall: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  setSpeaker: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  sendDTMF: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  transferCall: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  startAttendedTransfer: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  completeAttendedTransfer: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  swapAttendedTransferCalls: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  clearError: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  cleanup: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },

  // Enhanced call management methods
  setCurrentCall: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  setCurrentCallConnected: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  updateCurrentCallData: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  clearCurrentCall: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  addIncomingCall: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  removeIncomingCall: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  addCallOnHold: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  removeCallOnHold: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  holdCurrentCall: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  getCallById: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  getChildCallBySessionId: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  getParentCallBySessionId: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  updateCallDurations: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  setConferencing: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  startConference: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  addParticipantToConferenceCall: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  mergeAttendedTransfer: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  cancelAttendedTransfer: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  addParticipantToConference: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  setMutedConferenceParticipant: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  removeMutedConferenceParticipant: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  unMuteAllConferenceParticipants: async () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  getAllCalls: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  getShowActiveCallBar: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  getConferenceCall: () => {
    throw new Error("SoftphoneProvider not initialized");
  },
  getOriginalCallOnHold: () => {
    throw new Error("SoftphoneProvider not initialized");
  }
};

/**
 * Softphone Context
 */
export const SoftphoneContext =
  createContext<SoftphoneContextValue>(defaultContextValue);
