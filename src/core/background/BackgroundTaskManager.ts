import { NativeModules, Platform } from "react-native";
import { Logger } from "shared/utils/Logger.ts";

const logger = new Logger("BackgroundTaskManager: ");

// console.log(
//   "native modules here --------",
//   NativeModules.VoxoNotificationsModule
// );
// Get the native module
const VoxoNotificationsModule = NativeModules.VoxoNotificationsModule;

/**
 * BackgroundTaskManager handles background processing for VoIP calls on iOS
 * and maintains call state when the app is backgrounded
 */
export class BackgroundTaskManager {
  private static instance: BackgroundTaskManager | null = null;
  private isInitialized: boolean = false;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): BackgroundTaskManager {
    if (!BackgroundTaskManager.instance) {
      BackgroundTaskManager.instance = new BackgroundTaskManager();
    }
    return BackgroundTaskManager.instance;
  }

  /**
   * Initialize background task management
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (Platform.OS === "ios") {
      try {
        logger.debug("Initializing background task manager for iOS");

        // Debug: Check native module availability
        this.debugNativeModuleAvailability();

        this.isInitialized = true;
      } catch (error) {
        logger.error("Failed to initialize background task manager:", error);
        throw error;
      }
    } else {
      // Android background handling would be implemented here
      logger.debug("Background task manager not needed for Android");
      this.isInitialized = true;
    }
  }

  /**
   * Debug method to check native module availability
   */
  private debugNativeModuleAvailability(): void {
    const _availableModules = Object.keys(NativeModules);

    if (VoxoNotificationsModule) {
      logger.debug("VoxoNotificationsModule is available");
      const _methods = Object.keys(VoxoNotificationsModule).filter(
        (key) => typeof VoxoNotificationsModule[key] === "function"
      );
    } else {
      logger.error("VoxoNotificationsModule is NOT available");
    }
  }

  /**
   * Handle incoming VoIP call from push notification
   * This method bridges to native iOS CallKit integration
   */
  public async handleIncomingVoipCall(payload: any): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (Platform.OS === "ios") {
      if (VoxoNotificationsModule) {
        try {
          await VoxoNotificationsModule.handleIncomingVoipCall(payload);
        } catch (error) {
          logger.error("Failed to handle incoming VoIP call:", error);
          throw error;
        }
      } else {
        // VoxoNotificationsModule not available
        logger.warn(
          "VoxoNotificationsModule is not available for VoIP call handling"
        );
      }
    } else {
      logger.warn(
        "VoIP call handling not available on this platform (Android not implemented)"
      );
    }
  }

  /**
   * Start background task for call processing
   * Used when app needs to maintain call state in background
   */
  public startBackgroundTask(): void {
    if (Platform.OS === "ios") {
      logger.debug("Background task started for call processing");
      // Native background task is handled automatically by BackgroundTaskManager.m
    }
  }

  /**
   * End background task when call processing is complete
   */
  public endBackgroundTask(): void {
    if (Platform.OS === "ios") {
      logger.debug("Background task ended");
      // Native background task cleanup is handled automatically
    }
  }

  /**
   * Check if background processing is available
   */
  public isBackgroundProcessingAvailable(): boolean {
    return Platform.OS === "ios" && this.isInitialized;
  }

  /**
   * Cleanup resources
   */
  public dispose(): void {
    this.isInitialized = false;
    BackgroundTaskManager.instance = null;
  }
}

// Export singleton instance
export default BackgroundTaskManager.getInstance();
