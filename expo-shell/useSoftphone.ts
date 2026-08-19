import { useContext } from "react";
import {
  SoftphoneContext,
  type SoftphoneContextValue
} from "./voxoSoftphoneContext.ts";

export const useSoftphone = (): SoftphoneContextValue => {
  const context = useContext(SoftphoneContext);
  if (!context) {
    throw new Error("useSoftphone must be used within a SoftphoneProvider");
  }
  return context;
};

export const useSoftphoneState = () => {
  const {
    isInitialized,
    isInitializing,
    isRegistered,
    isRegistering,
    config,
    calls,
    activeCallId,
    error
  } = useSoftphone();

  return {
    isInitialized,
    isInitializing,
    isRegistered,
    isRegistering,
    config,
    calls,
    activeCallId,
    error
  };
};

export const useSoftphoneActions = () => {
  const {
    setConfig,
    makeCall,
    answerCall,
    declineCall,
    hangupCall,
    holdCall,
    unholdCall,
    muteCall,
    unmuteCall,
    sendDTMF,
    transferCall,
    startAttendedTransfer,
    completeAttendedTransfer,
    cancelAttendedTransfer,
    swapAttendedTransferCalls,
    clearError,
    cleanup
  } = useSoftphone();

  return {
    setConfig,
    makeCall,
    answerCall,
    declineCall,
    hangupCall,
    holdCall,
    unholdCall,
    muteCall,
    unmuteCall,
    sendDTMF,
    transferCall,
    startAttendedTransfer,
    completeAttendedTransfer,
    cancelAttendedTransfer,
    swapAttendedTransferCalls,
    clearError,
    cleanup
  };
};
