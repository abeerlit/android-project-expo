import { User } from "../users/types.ts";

export type MFAMode = "sms" | "email" | "app";

// ----- RESPONSES ------ //
export interface LoginResponse {
  user: User;
  accessToken: string;
}

export type AuthResponse = {
  accessToken?: string;
  user?: User;
  mode?: MFAMode;
  mfaVerifyToken?: string;
  mfaSetupToken?: string;
  message?: string;
  phoneNumber?: string;
  secret?: string;
};

export type MFASetupResponse = {
  mode: MFAMode;
  mfaVerifyToken?: string;
  phoneNumber?: string;
  secret?: string;
  qrcode?: string;
};

export type MFAToggleResponse = {
  status: string;
  message: string;
};

export type MFAResendOTPResponse = {
  status?: string;
  mode: MFAMode;
  mfaVerifyToken: string;
  message: string;
};

// ----- REQUESTS ------ //

export type BasicAuthRequestBody = {
  email: string;
  password: string;
};

export type MFASetupBody = {
  mode: MFAMode;
  token?: string;
  phoneNumber?: string;
};

export type MFAValidateBody = {
  token: string;
  otp: string;
};

export type MFAVerifyBody = {
  mode: MFAMode;
  otp: string;
  secret?: string;
  phoneNumber?: string;
  token?: string;
};

export type MFAToggleBody = {
  mode: MFAMode;
};

export type MFAResendOTPBody = {
  token?: string;
  mode: MFAMode;
  phoneNumber?: string;
};
