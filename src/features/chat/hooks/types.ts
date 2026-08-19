// Shared types for chat hooks
export interface NewMessageItem {
  name: string;
  avatarPath?: string;
  userId?: string;
  channelUrl?: string;
  phoneNumber?: string;
  conversationId?: number;
  recordID?: string;
  type:
    | "user"
    | "channel"
    | "dm"
    | "phone"
    | "personal"
    | "phone-contact"
    | "conversation";
  public?: boolean;
}

export type MessagingType = "text" | "sendbird" | null;
export type ChatType = "text" | "sendbird" | null;

export interface SearchFilters {
  canSearchChannels: boolean;
  canSearchSendbirdContacts: boolean;
  canSearchTextContacts: boolean;
  canSearchContacts: boolean;
}

export interface ItemCreators {
  createUserItem: (contact: any) => NewMessageItem;
  createChannelItem: (channel: any) => NewMessageItem;
  createDMItem: (dm: any) => NewMessageItem;
  createPhoneItem: (phoneNumber: string) => NewMessageItem;
  createPersonalContactItem: (contact: any) => NewMessageItem;
  createPhoneContactItem: (contact: any, phoneNumber: string) => NewMessageItem;
  createConversationItem: (conversation: any) => NewMessageItem;
}
