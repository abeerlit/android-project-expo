import { DeviceEventEmitter } from "react-native";

export const VOICEMAIL_NAV_EVENT = "navigate_to_voicemail_tab";

export function emitNavigateToVoicemailTab() {
  DeviceEventEmitter.emit(VOICEMAIL_NAV_EVENT);
}
