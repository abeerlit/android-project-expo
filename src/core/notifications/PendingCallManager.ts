import { NativeModules, Platform } from "react-native";

interface PendingCallData {
  callUuid: string;
  callerName: string;
  callerNumber: string;
  callerIp: string;
  timestamp: number;
}

interface PendingCallsMap {
  [callUuid: string]: PendingCallData;
}

const { PendingCallManager } = NativeModules;

/**
 * Native iOS module to manage pending VoIP calls stored in UserDefaults
 * This allows us to retrieve call data when app launches after user answers from CallKit
 */
class PendingCallManagerService {
  /**
   * Get all pending VoIP calls stored by native iOS
   * Returns empty object if no pending calls or on Android
   */
  async getPendingCalls(): Promise<PendingCallsMap> {
    if (Platform.OS !== "ios" || !PendingCallManager) {
      return {};
    }

    try {
      const pendingCalls = await PendingCallManager.getPendingCalls();
      return pendingCalls || {};
    } catch (error) {
      console.error("[PendingCallManager] Error getting pending calls:", error);
      return {};
    }
  }

  /**
   * Clear a specific pending call after it's been processed
   */
  async clearPendingCall(callUuid: string): Promise<boolean> {
    if (Platform.OS !== "ios" || !PendingCallManager) {
      return false;
    }

    try {
      const result = await PendingCallManager.clearPendingCall(callUuid);
      return result === true;
    } catch (error) {
      console.error(
        `[PendingCallManager] Error clearing pending call ${callUuid}:`,
        error
      );
      return false;
    }
  }

  /**
   * Clear all pending calls
   */
  async clearAllPendingCalls(): Promise<boolean> {
    if (Platform.OS !== "ios" || !PendingCallManager) {
      return false;
    }

    try {
      await PendingCallManager.clearAllPendingCalls();
      return true;
    } catch (error) {
      console.error(
        "[PendingCallManager] Error clearing all pending calls:",
        error
      );
      return false;
    }
  }
}

export default new PendingCallManagerService();
export type { PendingCallData, PendingCallsMap };
