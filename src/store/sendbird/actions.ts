// Sendbird Redux Actions

export const STORE_CHANNELS = "STORE_CHANNELS";
export const STORE_DM_CHANNELS = "STORE_DM_CHANNELS";
export const UPDATE_CHANNEL = "UPDATE_CHANNEL";
export const REMOVE_CHANNEL = "REMOVE_CHANNEL";
export const SET_LAST_SYNC = "SET_LAST_SYNC";
export const CLEAR_SENDBIRD_DATA = "CLEAR_SENDBIRD_DATA";
export const INCREMENT_CHANNEL_UNREAD = "INCREMENT_CHANNEL_UNREAD";
export const RESET_CHANNEL_UNREAD = "RESET_CHANNEL_UNREAD";

export interface StoreChannelsAction {
  type: typeof STORE_CHANNELS;
  channels: any[];
}

export interface StoreDMChannelsAction {
  type: typeof STORE_DM_CHANNELS;
  dmChannels: any[];
}

export interface UpdateChannelAction {
  type: typeof UPDATE_CHANNEL;
  channel: any;
}

export interface RemoveChannelAction {
  type: typeof REMOVE_CHANNEL;
  channelUrl: string;
}

export interface SetLastSyncAction {
  type: typeof SET_LAST_SYNC;
  timestamp: number;
}

export interface ClearSendbirdDataAction {
  type: typeof CLEAR_SENDBIRD_DATA;
}

export interface IncrementChannelUnreadAction {
  type: typeof INCREMENT_CHANNEL_UNREAD;
  channelUrl: string;
}

export interface ResetChannelUnreadAction {
  type: typeof RESET_CHANNEL_UNREAD;
  channelUrl: string;
}

export type SendbirdActionTypes =
  | StoreChannelsAction
  | StoreDMChannelsAction
  | UpdateChannelAction
  | RemoveChannelAction
  | SetLastSyncAction
  | ClearSendbirdDataAction
  | IncrementChannelUnreadAction
  | ResetChannelUnreadAction;

// Action creators
export const storeChannels = (channels: any[]): StoreChannelsAction => ({
  type: STORE_CHANNELS,
  channels
});

export const storeDMChannels = (dmChannels: any[]): StoreDMChannelsAction => ({
  type: STORE_DM_CHANNELS,
  dmChannels
});

export const updateChannel = (channel: any): UpdateChannelAction => ({
  type: UPDATE_CHANNEL,
  channel
});

export const removeChannel = (channelUrl: string): RemoveChannelAction => ({
  type: REMOVE_CHANNEL,
  channelUrl
});

export const setLastSync = (timestamp: number): SetLastSyncAction => ({
  type: SET_LAST_SYNC,
  timestamp
});

export const clearSendbirdData = (): ClearSendbirdDataAction => ({
  type: CLEAR_SENDBIRD_DATA
});

export const incrementChannelUnread = (
  channelUrl: string
): IncrementChannelUnreadAction => ({
  type: INCREMENT_CHANNEL_UNREAD,
  channelUrl
});

export const resetChannelUnread = (
  channelUrl: string
): ResetChannelUnreadAction => ({
  type: RESET_CHANNEL_UNREAD,
  channelUrl
});
