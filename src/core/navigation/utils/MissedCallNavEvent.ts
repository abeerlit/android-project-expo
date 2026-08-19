import { DeviceEventEmitter } from "react-native";

export const MISSED_CALL_NAV_EVENT = "navigate_to_missed_tab";

export function emitNavigateToMissedTab() {
  DeviceEventEmitter.emit(MISSED_CALL_NAV_EVENT);
}
