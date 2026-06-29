import {
  BaseMessage,
  FileMessage,
  FileMessageCreateParams,
  MultipleFilesMessage,
  UserMessage,
  UserMessageCreateParams
} from "@sendbird/chat/message";
import { GroupChannel, Member } from "@sendbird/chat/groupChannel";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Routes } from "core/navigation/types/types.ts";
import { AuthParams } from "core/navigation/navigators/AuthenticatedStack.tsx";

export type ConnectionState = "connected" | "connecting" | "disconnected";

export type MessageStatus =
  | "sending"
  | "sent"
  | "failed"
  | "deleted"
  | "edited";

export interface MessageState extends BaseMessage {
  tempId?: string;
  status: MessageStatus;
  error?: Error;
}

export interface ChatError {
  code: string;
  message: string;
  timestamp: number;
  context?: unknown;
}

export interface MessageCollection {
  hasNext: boolean;
  hasPrevious: boolean;
  loading: boolean;
  messages: MessageState[];
  error: ChatError | null;
}

export interface ChannelCollection {
  hasNext: boolean;
  loading: boolean;
  channels: GroupChannel[];
  error: ChatError | null;
}

export interface SendbirdContextState {
  messages: MessageState[];
  messageCollection: MessageCollection | null;
  channels: GroupChannel[];
  channelCollection: ChannelCollection | null;
  currentChannel: GroupChannel | null;
  connectionState: ConnectionState;
  error: ChatError | null;
  isInitialized: boolean;
}

export interface SendbirdContextActions {
  connect: (userId: number) => Promise<void>;
  disconnect: () => Promise<void>;
  enterChannel: (channelUrl: string) => Promise<void>;
  leaveChannel: () => void;
  sendUserMessage: (params: UserMessageCreateParams) => Promise<void>;
  sendFileMessage: (params: FileMessageCreateParams) => Promise<void>;
  editUserMessage: (messageId: number, message: string) => Promise<void>;
  deleteUserMessage: (message: BaseMessage) => Promise<void>;
  retryMessage: (messageId: string) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  loadMoreChannels: () => Promise<void>;
  markChannelAsRead: (channelUrl: string) => Promise<void>;
  clearError: () => void;
}

interface ChannelType {
  dm: string;
  group: string;
  dmChannel: (id: number) => string;
  personalChannel: (id: number) => string;
  groupChannel: (id: number) => string;
}

export const CustomChannelType: ChannelType = {
  dm: "DM",
  group: "group",
  dmChannel: (id) => `DM_${id}`,
  personalChannel: (id) => `DM_${id}_PERSONAL`,
  groupChannel: (id) => `Open_${id}`
};

export interface FilteredChannel {
  name: string;
  url: string;
  unreadCount: number;
  isPublic?: boolean;
  joined?: boolean;
  memberUserIds: string[];
  muted?: boolean;
  lastMessageAt?: number;
}

export interface FilteredDMChannel extends FilteredChannel {
  avatar: string;
  connectionStatus: string;
  personal?: boolean;
}

export type NormalizedPublicChannel = Pick<
  GroupChannel,
  "url" | "name" | "joinedAt" | "customType" | "isPublic" | "unreadMessageCount"
>;

export type ChatNavigationProp = NativeStackNavigationProp<
  AuthParams,
  Routes.Chat
>;

export type ThreadsNavigationProp = NativeStackNavigationProp<
  AuthParams,
  Routes.Threads
>;

export interface Recipient {
  avatarPath: string | null;
  avatarThumbnailPath: string | null;
  name: string;
  initials: string;
  sendbirdStatus: string;
  userId: number;
}

export type ChatMessage = UserMessage | FileMessage | MultipleFilesMessage;

export interface Channel extends GroupChannel {
  recipients?: Recipient[];
  messages: ChatMessage[];
  messageReplies: ChatMessage[];
  scrollIndex: number;
  totalMessages: number;
  loaded: boolean;
  members: any;
}

export interface CreateChannelBody {
  channelName: string;
  channelDescription: string;
  channelVisibility: string;
}

export interface ExtendedMember extends Member {
  avatarPath: string | null;
  avatarThumbnailPath: string | null;
  directoryName: string;
  initials: string;
  status?: string; // Will add this later
  extId?: number;
}

export type SendbirdFile = {
  fileUrl: string;
  size: number;
  name: string;
  type: string;
};

// Threads
export interface ThreadUser {
  userId: string;
  nickname: string;
  plainProfileUrl?: string;
  connectionStatus?: string;
  isActive?: boolean;
  lastSeenAt?: number | null;
  friendName?: string | null;
  friendDiscoveryKey?: string | null;
  preferredLanguages?: string[] | null;
  requireAuth?: boolean;
  metaData?: Record<string, any>;
  _iid?: string;
  _hashValue?: number;
  _updatedAt?: number;
}

export interface ThreadInfoData {
  message: ChatMessage;
  replyCount: number;
  unreadReplyCount?: number;
  mostRepliedUsers: ThreadUser[];
  lastRepliedAt?: number;
  memberCount?: number;
  updatedAt?: number;
  isPushNotificationEnabled?: boolean;
  _iid?: string;
}

export interface ThreadInfoProps {
  threadInfo: ThreadInfoData;
}
