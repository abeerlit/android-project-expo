import { useContext } from "react";
import { SoftphoneContext, SoftphoneContextValue } from "./SoftphoneContext.ts";

/**
 * Custom hook to access softphone functionality
 *
 * @returns SoftphoneContextValue with all states and methods
 * @throws Error if used outside SoftphoneProvider
 *
 * @example
 * ```tsx
 * const { makeCall, calls, isRegistered, error } = useSoftphone();
 *
 * // Make a call
 * const handleCall = async () => {
 *   try {
 *     const callId = await makeCall('+1234567890');
 *     console.log('Call started:', callId);
 *   } catch (error) {
 *     console.error('Failed to make call:', error);
 *   }
 * };
 *
 * // Check if we have active calls
 * const hasActiveCalls = Object.keys(calls).length > 0;
 * ```
 */
export const useSoftphone = (): SoftphoneContextValue => {
  const context = useContext(SoftphoneContext);

  if (!context) {
    throw new Error("useSoftphone must be used within a SoftphoneProvider");
  }

  return context;
};

/**
 * Hook to get softphone state only (no methods)
 * Useful for components that only need to read state
 */
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

/**
 * Hook to get softphone actions only (no state)
 * Useful for components that only need to perform actions
 */
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
