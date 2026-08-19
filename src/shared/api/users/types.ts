import { MFAMode } from "../authentication/types.ts";

export enum UserRole {
  PLATFORM_ADMIN = 1,
  ACCOUNT_ADMIN = 3,
  BASIC_USER = 5,
  QUEUE_MANAGER = 7,
  REPORTS_ADMIN = 9,
  PARTNER_ADMIN = 11
}

export interface User {
  id: number;
  email: string;
  userRole: UserRole;
  avatarPath: string;
  tenantId: number;
  partnerId: number | null;
  timezone: string;
  coverPhoto: string;
  darkMode: 0 | 1;
  mobileDarkMode: 0 | 1;
  otp: string;
  mfaEnabled: 0 | 1;
  mfaMode: MFAMode;
  mfaPhoneNumber: string;
  mfaSmsVerified: 0 | 1;
  mfaAppSecret: string;
  mfaAppVerified: 0 | 1;
  mfaEmailVerified: 0 | 1;
  title: null | string;
  enableChatNotifications: 0 | 1;
  enableAllNewMessageNotifications: 0 | 1;
  enableDirectMessageNotifications: 0 | 1;
  enableMobileCallNotifications: 0 | 1;
  enableMobileTextNotifications: 0 | 1;
  extId: number;
  extName: string;
  extNum: string;
  dnd: string;
  outboundRecord: "yes" | "no";
  peerName: string;
  peerSecret: string;
  enableMeetings: 0 | 1;
  branchId: number | null;
  branchName: string | null;
  directDials: string[];
  ringtone: string;
  voicemailId: number;
  phoneNumber: string;
  faxNumber: string;
  voicemailSettings: VoicemailSettings;
  faxSettings: FaxSettings | boolean;
  provisionedNumbers: string[];
  forwarding: ForwardingDetail;
}

export type ForwardingDetail = {
  forwarding: boolean;
  number: string;
};

export interface VoicemailSettings {
  attach: string | null;
  email: string;
  greetings: string[];
  id: number;
  password: string;
}

export interface FaxSettings {
  email: string;
  faxNumber: string;
  id: number;
  name: string;
  tenantId: number;
}

export interface MfaType {
  mode: MFAMode;
  mfaVerifyToken: string;
  message: string;
}

export type ForgotPasswordBody = {
  email: string;
};

export type ResetResponse = {
  status: string;
  message: string;
};

// ====== Push Token Types ====== //

export type SetPushTokenBody = {
  tokenType: string;
  token: string;
  accessToken: string;
};

export type SetPushTokenResponse = {
  id: string;
  extId: number;
  deviceId: string;
  tokenType: string;
  token: string;
};

// ====== User Settings Params ====== //
export type ChatNotifications = {
  enableChatNotifications: 1 | 0;
  enableAllNewMessageNotifications: 1 | 0;
  enableDirectMessageNotifications: 1 | 0;
};
