import React from "react";
import {
  SoftphoneContext,
  type SoftphoneContextValue
} from "../voxoSoftphoneContext.ts";

const noopAsync = async () => undefined;

/** Phase-0 / telephony-off: no SIP; still mount context so hooks do not hit default throw stubs. */
const stubValue: SoftphoneContextValue = {
  isInitialized: false,
  isInitializing: false,
  isRegistered: false,
  isRegistering: false,
  config: null,
  calls: {},
  activeCallId: undefined,
  hasOngoingCall: false,
  error: undefined,
  setConfig: noopAsync,
  makeCall: noopAsync,
  answerCall: noopAsync,
  answerCallViaCallKeep: noopAsync,
  answerVoipCallFromInApp: () => {},
  declineCall: noopAsync,
  hangupCall: async (callId: string) => {
    if (callId === "dialing") return;
  },
  holdCall: noopAsync,
  unholdCall: noopAsync,
  muteCall: noopAsync,
  unmuteCall: noopAsync,
  setSpeaker: noopAsync,
  sendDTMF: noopAsync,
  transferCall: noopAsync,
  startAttendedTransfer: noopAsync,
  completeAttendedTransfer: noopAsync,
  cancelAttendedTransfer: noopAsync,
  swapAttendedTransferCalls: noopAsync,
  clearError: () => {},
  cleanup: noopAsync,
  setCurrentCall: noopAsync,
  setCurrentCallConnected: () => {},
  updateCurrentCallData: () => {},
  clearCurrentCall: noopAsync,
  addIncomingCall: () => {},
  removeIncomingCall: () => {},
  addCallOnHold: () => {},
  removeCallOnHold: () => {},
  holdCurrentCall: noopAsync,
  getCallById: () => undefined,
  getChildCallBySessionId: () => undefined,
  getParentCallBySessionId: () => undefined,
  updateCallDurations: () => {},
  setConferencing: () => {},
  startConference: noopAsync,
  addParticipantToConferenceCall: noopAsync,
  mergeAttendedTransfer: noopAsync,
  addParticipantToConference: noopAsync,
  setMutedConferenceParticipant: () => {},
  removeMutedConferenceParticipant: () => {},
  unMuteAllConferenceParticipants: () => {},
  getAllCalls: () => [],
  getShowActiveCallBar: () => false,
  getConferenceCall: () => undefined,
  getOriginalCallOnHold: () => undefined
};

export function SoftphoneProvider({ children }: { children: React.ReactNode }) {
  return (
    <SoftphoneContext.Provider value={stubValue}>
      {children}
    </SoftphoneContext.Provider>
  );
}

export default SoftphoneProvider;
