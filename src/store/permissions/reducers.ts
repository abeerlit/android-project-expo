import { PermissionStatus } from "react-native-permissions";

export type Status = PermissionStatus | "undetermined";

export interface PermissionState {
  notification: Status;
  microphone: Status;
  location: Status;
  contacts: Status;
  phone: Status;
  phoneNumber: Status;
}
