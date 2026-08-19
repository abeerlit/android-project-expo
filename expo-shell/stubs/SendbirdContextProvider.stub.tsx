import React, { ReactNode } from "react";
import { SendbirdContext } from "features/chat/utils/SendbirdContext.ts";

const stubValue = {
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
  isChannelsLoading: false,
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
    error: "Expo stub",
    created: false
  }),
  createOrJoinDMChannel: async () => ({
    success: false,
    error: "Expo stub"
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
  hideDmChannel: async () => {}
};

export function SendbirdContextProvider({ children }: { children: ReactNode }) {
  return (
    <SendbirdContext.Provider value={stubValue}>{children}</SendbirdContext.Provider>
  );
}
