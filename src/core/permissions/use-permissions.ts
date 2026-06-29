import { useState, useEffect, useCallback } from "react";
import { Alert, Linking, Platform } from "react-native";
import { Logger } from "shared/utils/Logger.ts";
import {
  PermissionType,
  PermissionResult,
  PermissionsState
} from "core/permissions/types.ts";
import { checkPermission, requestPermission } from "core/permissions/utils.ts";
import { setAndroidPermissionPromptsComplete } from "core/permissions/android-permission-prompt-gate.ts";
import {
  getOnboardingPermissionTypes,
  hasBeenPrompted,
  hasCompletedOnboardingPrompts,
  markPrompted,
  markPromptedIfGranted
} from "core/permissions/permission-prompt-store.ts";
import { setPermissionPromptInProgress } from "core/permissions/permission-prompt-session.ts";

/**
 * Permissions Hook
 * Custom hook for managing app permissions
 */

const logger = new Logger("PermissionsHook: ");

const defaultPermissionResult: PermissionResult = {
  status: "not-determined",
  granted: false
};

const initialPermissionsState: PermissionsState = {
  microphone: defaultPermissionResult,
  location: defaultPermissionResult,
  notifications: defaultPermissionResult,
  phone: defaultPermissionResult,
  phoneNumbers: defaultPermissionResult
};

function assignResult(
  results: Partial<PermissionsState>,
  permissionType: PermissionType,
  result: PermissionResult
): void {
  if (
    permissionType === "microphone" ||
    permissionType === "location" ||
    permissionType === "notifications" ||
    permissionType === "phone" ||
    permissionType === "phoneNumbers"
  ) {
    results[permissionType] = result;
  }
}

export const usePermissions = () => {
  const [permissionsState, setPermissionsState] = useState<PermissionsState>(
    initialPermissionsState
  );
  const [isLoading, setIsLoading] = useState(false);

  const checkPermissions = useCallback(async () => {
    setIsLoading(true);

    try {
      const microphoneStatus = await checkPermission("microphone");
      const locationStatus = await checkPermission("location");
      const notificationsStatus = await checkPermission("notifications");
      const phoneStatus = await checkPermission("phone");
      const phoneNumbersStatus =
        Platform.OS === "android"
          ? await checkPermission("phoneNumbers")
          : { status: "granted" as const, granted: true };

      setPermissionsState({
        microphone: microphoneStatus,
        location: locationStatus,
        notifications: notificationsStatus,
        phone: phoneStatus,
        phoneNumbers: phoneNumbersStatus as PermissionResult
      });
    } catch (error) {
      logger.error("Error checking permissions:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const requestSinglePermission = useCallback(async (type: PermissionType) => {
    setIsLoading(true);

    try {
      const permissionResult = await requestPermission(type);
      markPrompted(type);

      setPermissionsState((prev) => ({
        ...prev,
        [type]: permissionResult
      }));

      return permissionResult;
    } catch (error) {
      logger.error(`Error requesting ${type} permission:`, error);
      return { status: "unavailable", granted: false } as PermissionResult;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Prompt each onboarding permission at most once per install (MMKV).
   * Always check() on launch; only show system dialogs for types not yet prompted.
   */
  const ensureOnboardingPermissions = useCallback(async () => {
    setIsLoading(true);
    setPermissionPromptInProgress(true);

    logger.debug("Ensuring onboarding permissions (prompt once per install)");

    try {
      const results: Partial<PermissionsState> = {};
      const delay = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      /** Android needs time for the activity to resume after each system sheet. */
      const delayBeforeRequest = Platform.OS === "android" ? 1200 : 500;
      const delayBetweenPermissions = Platform.OS === "ios" ? 1500 : 1000;
      const permissionOrder = getOnboardingPermissionTypes();
      let showedDialog = false;

      for (const permissionType of permissionOrder) {
        const currentStatus = await checkPermission(permissionType);
        assignResult(results, permissionType, currentStatus);

        if (currentStatus.granted) {
          await markPromptedIfGranted(permissionType);
          logger.debug(`${permissionType} already granted`);
          continue;
        }

        if (hasBeenPrompted(permissionType)) {
          logger.debug(
            `${permissionType} already prompted — not asking again`,
            currentStatus.status
          );
          continue;
        }

        await delay(delayBeforeRequest);
        logger.debug(`Requesting ${permissionType} permission (first time)...`);
        const result = await requestPermission(permissionType);
        markPrompted(permissionType);
        assignResult(results, permissionType, result);
        showedDialog = true;
        logger.debug(`${permissionType} permission result:`, result.status);

        if (permissionType !== permissionOrder[permissionOrder.length - 1]) {
          await delay(delayBetweenPermissions);
        }
      }

      let merged: PermissionsState = initialPermissionsState;
      setPermissionsState((prev) => {
        merged = {
          ...initialPermissionsState,
          ...prev,
          ...results
        } as PermissionsState;
        return merged;
      });

      logger.debug("Onboarding permissions flow completed:", {
        microphone: merged.microphone?.status,
        location: merged.location?.status,
        notifications: merged.notifications?.status,
        phone: merged.phone?.status,
        phoneNumbers: merged.phoneNumbers?.status,
        showedDialog
      });

      const phoneNumbersOk =
        Platform.OS !== "android" || (merged.phoneNumbers?.granted ?? false);

      const sequenceComplete = await hasCompletedOnboardingPrompts();

      return {
        allGranted:
          merged.microphone.granted &&
          merged.location.granted &&
          merged.notifications.granted &&
          (merged.phone?.granted ?? false) &&
          phoneNumbersOk,
        sequenceComplete,
        results: {
          microphone: merged.microphone,
          location: merged.location,
          notifications: merged.notifications,
          phone: merged.phone || defaultPermissionResult,
          phoneNumbers: merged.phoneNumbers || defaultPermissionResult
        }
      };
    } catch (error) {
      logger.error("Error ensuring onboarding permissions:", error);
      const sequenceComplete = await hasCompletedOnboardingPrompts();
      return {
        allGranted: false,
        sequenceComplete,
        results: permissionsState
      };
    } finally {
      setIsLoading(false);
      setPermissionPromptInProgress(false);
      if (Platform.OS === "android") {
        const done = await hasCompletedOnboardingPrompts();
        setAndroidPermissionPromptsComplete(done);
        logger.debug("Android permission gate:", { done });
      }
    }
  }, []);

  /** @deprecated Use ensureOnboardingPermissions from Home */
  const requestAllPermissions = ensureOnboardingPermissions;

  const openSettings = useCallback(() => {
    logger.debug("Opening app settings");
    Linking.openSettings();
  }, []);

  const showBlockedPermissionAlert = useCallback(
    (permissionName: string) => {
      logger.debug(`Showing alert for blocked ${permissionName} permission`);
      Alert.alert(
        "Permission Required",
        `${permissionName} permission is required for this feature. Please enable it in your device settings.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: openSettings }
        ]
      );
    },
    [openSettings]
  );

  const areAllPermissionsGranted = useCallback(() => {
    const phoneNumbersOk =
      Platform.OS !== "android" ||
      (permissionsState.phoneNumbers?.granted ?? false);
    return (
      permissionsState.microphone.granted &&
      permissionsState.location.granted &&
      permissionsState.notifications.granted &&
      (permissionsState.phone?.granted ?? false) &&
      phoneNumbersOk
    );
  }, [permissionsState]);

  useEffect(() => {
    logger.debug("Initializing permissions check");
    checkPermissions();
  }, [checkPermissions]);

  return {
    permissions: permissionsState,
    isLoading,
    checkPermissions,
    requestPermission: requestSinglePermission,
    requestAllPermissions,
    ensureOnboardingPermissions,
    openSettings,
    showBlockedPermissionAlert,
    areAllPermissionsGranted
  };
};
