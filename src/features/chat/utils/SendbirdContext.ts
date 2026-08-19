import { createContext, useContext } from "react";
import {
  BaseMessage,
  FileMessageCreateParams,
  MultipleFilesMessageCreateParams,
  UserMessageCreateParams
} from "@sendbird/chat/message";
import {
  GroupChannel,
  GroupChannelCollection,
  GroupChannelModule,
  MessageCollection
} from "@sendbird/chat/groupChannel";
import { SendbirdChatWith } from "@sendbird/chat";
import { ChatMessage, FilteredChannel, FilteredDMChannel } from "../types.ts";

interface SendbirdContextData {
  messages: ChatMessage[];
  channels: GroupChannel[];
  sendbirdInstance: SendbirdChatWith<GroupChannelModule[]> | null;
  channelsCollection: GroupChannelCollection | null;
  messageCollection: MessageCollection | null;
  currentChannel: GroupChannel | null;
  connecting: boolean;
  isConnected: boolean;
  reFetchThread: boolean;
  isFetchingMessages: boolean;
  typingUsers: Record<string, any[]>;
  activeThreadId: number | null;
  activeParentMessage: BaseMessage | null;
  threadMessages: ChatMessage[];
  isFetchingThread: boolean;
  totalUnreadCount: number;
  isChannelsLoading: boolean;
  connect: (userId: number) => Promise<void>;
  disconnect: () => Promise<void>;
  enterChannel: (channelUrl: string) => void;
  leaveChannel: () => void;
  setPushNotification: (
    enable: boolean,
    os: "ios" | "android" | "windows" | "web" | "macos",
    token: string
  ) => Promise<void>;
  sendUserMessage: (message: UserMessageCreateParams) => void;
  sendFileMessage: (message: FileMessageCreateParams) => void;
  sendMultipleFileMessage: (messages: MultipleFilesMessageCreateParams) => void;
  editUserMessage: (message: string, messageId: number) => Promise<void>;
  deleteUserMessage: (
    message: BaseMessage,
    channelUrl: string
  ) => Promise<void>;
  leaveChannelPermanently: (channel: GroupChannel) => Promise<void>;
  deleteChannel: (channel: GroupChannel) => Promise<void>;
  updateChannelDetails: ( channel: GroupChannel, params: { name: string; data: string }) => Promise<void>;
  reactionEvent: (
    message: BaseMessage,
    reaction: string,
    userId: string
  ) => Promise<void>;
  fetchMoreMessages: () => Promise<void>;
  fetchNewMessages: () => Promise<void>;
  fetchChannels: () => Promise<void>;
  findChannelByName: (channelName: string) => Promise<GroupChannel | null>;
  createOrJoinChannel: (
    channelName: string,
    channelDescription: string,
    isPrivate: boolean
  ) => Promise<{
    success: boolean;
    channelUrl?: string;
    error?: string;
    created: boolean;
  }>;
  createOrJoinDMChannel: (userIds: string[]) => Promise<{
    success: boolean;
    channelUrl?: string;
    error?: string;
    created?: boolean;
  }>;
  findExistingDMChannel: (userIds: string[]) => GroupChannel | null;
  getChannelPreviewMessages: (channelUrl: string) => Promise<ChatMessage[]>;
  filteredGroupChannels: FilteredChannel[];
  filteredDMChannels: FilteredDMChannel[];
  setActiveThread: (
    parentMessageId: number,
    parentMessage?: BaseMessage
  ) => void;
  clearActiveThread: () => void;
  loadThreadFromCache: (
    channelUrl: string,
    parentMessageId: number | string
  ) => void;
  markChannelAsRead: (channelUrl: string) => Promise<void>;
  fetchThreadMessages: (
    parentMessage: BaseMessage,
    channelUrl?: string
  ) => Promise<void>;
  refreshChannel: (
    channelUrl: string,
    unreadCountFromFCM?: number
  ) => Promise<void>;
  refreshCurrentChannelMessages: () => Promise<void>;
  loadCachedMessages: (channelUrl: string) => boolean;
  /** Sendbird SDK hide with allowAutoUnhide (same as web); hidden DMs omitted from Home list until new message. */
  hideDmChannel: (channelUrl: string) => Promise<void>;
}

export const SendbirdContext = createContext<SendbirdContextData>({
  messages: [],
  channels: [],
  sendbirdInstance: null,
  channelsCollection: null,
  messageCollection: null,
  currentChannel: null,
  connecting: false,
  isConnected: false,
  reFetchThread: false,
  isFetchingMessages: false,
  typingUsers: {},
  activeThreadId: null,
  activeParentMessage: null,
  threadMessages: [],
  isFetchingThread: false,
  totalUnreadCount: 0,
  connect: async () => {},
  disconnect: async () => {},
  enterChannel: async () => {},
  leaveChannel: () => {},
  setPushNotification: async () => {},
  sendUserMessage: () => {},
  sendFileMessage: () => {},
  sendMultipleFileMessage: () => {},
  editUserMessage: async () => {},
  deleteUserMessage: async () => {},
  leaveChannelPermanently: async () => {},
  deleteChannel: async () => {},
  updateChannelDetails: async () => {},
  reactionEvent: async () => {},
  fetchMoreMessages: async () => {},
  fetchNewMessages: async () => {},
  fetchChannels: async () => {},
  findChannelByName: async () => null,
  createOrJoinChannel: async () => ({
    success: false,
    error: "Not implemented",
    created: false
  }),
  createOrJoinDMChannel: async () => ({
    success: false,
    error: "Not implemented"
  }),
  findExistingDMChannel: () => null,
  getChannelPreviewMessages: async () => [],
  filteredGroupChannels: [],
  filteredDMChannels: [],
  setActiveThread: () => {},
  clearActiveThread: () => {},
  loadThreadFromCache: () => {},
  markChannelAsRead: async () => {},
  fetchThreadMessages: async () => {},
  refreshChannel: async () => {},
  refreshCurrentChannelMessages: async () => {},
  loadCachedMessages: () => false,
  isChannelsLoading: false,
  hideDmChannel: async () => {}
});

export function useSendbirdContext() {
  return useContext(SendbirdContext);
}
