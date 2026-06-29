import { Alert, Linking, Platform } from "react-native";
import { checkPermission, requestPermission } from "core/permissions/utils.ts";

/**
 * Android must request READ_CONTACTS from an active screen (Activity context).
 * Redux-saga requests often fail to show the system sheet on OEM devices.
 */
export async function ensureContactsPermissionForAndroid(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }

  const current = await checkPermission("contacts");
  if (current.granted) {
    return true;
  }

  if (current.status === "blocked") {
    Alert.alert(
      "Contacts Permission Required",
      "Allow access to your contacts in Settings to sync phone contacts.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => void Linking.openSettings() }
      ]
    );
    return false;
  }

  const result = await requestPermission("contacts");
  return result.granted;
}
