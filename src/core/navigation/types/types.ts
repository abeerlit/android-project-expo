import { MFAMode } from "shared/api/authentication/types.ts";
import { ChatMessage } from "features/chat/types.ts";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

export enum Routes {
  Home = "Home",
  Login = "Login",
  TwoFactorVerify = "TwoFactorVerify",
  ForceTwoFactor = "ForceTwoFactor",
  TwoFactorSetup = "TwoFactorSetup",
  Contacts = "Contacts",
  Inbox = "Inbox",
  Keypad = "Keypad",
  ForgotPassword = "ForgotPassword",
  ForgotPasswordConfirmation = "ForgotPasswordConfirmation",
  BottomTabNavigator = "BottomTabNavigator",
  Calls = "Calls",
  Missed = "Missed",
  Recordings = "Recordings",
  Faxes = "Faxes",
  Voicemails = "Voicemails",
  Meetings = "Meetings",
  Directory = "Directory",
  Groups = "Groups",
  Personal = "Personal",
  Preferences = "Preferences",
  Chat = "Chat",
  Threads = "Threads",
  InCallScreen = "InCallScreen",
  NewMessage = "NewMessage",
  TextConversations = "TextConversations",
  TextThread = "TextThread",
  NewTextMessage = "NewTextMessage"
}

export type ChatParams = {
  channelUrl?: string;
  conversationId?: number;
  recipientName?: string;
  recipientAvatarPath?: string;
  recipientNumber?: string;
  parentMessageId?: string | number;
  scrollToMessageId?: string;
};

export type ThreadsChatParams = {
  channelUrl?: string;
  parentMessage: ChatMessage;
  offset: number;
  scrollToMessageId?: string;
};

export type TwoFactorVerifyParams = {
  message?: string;
  token: string;
  mode: MFAMode;
  phoneNumber?: string;
  email?: string;
  secret?: string;
  qrcode?: string;
  setup?: boolean;
};

export type ForceTwoFactorParams = {
  token: string;
  email: string;
};

export type TwoFactorSetupParams = {
  message?: string;
  token: string;
  mode: MFAMode;
  phoneNumber?: string;
  email?: string;
  secret?: string;
  qrcode?: string;
  setup?: boolean;
};

export type TextThreadParams = {
  conversationId: number;
};

export type BottomTabNavigationParam = NativeStackNavigationProp<
  any,
  Routes.BottomTabNavigator
>;
