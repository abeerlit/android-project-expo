// SMS/MMS Messaging Types

export interface TextConversation {
  id: number;
  sourceDID: string;
  participants: string;
  conversationName?: string;
  lastMessage?: string;
  unreadCount?: number;
  hidden: number;
  updatedAt: string;
  createdAt: string;
  incomingMessage?: TextMessageReceivedEvent;
}

export interface TextMessage {
  id: number;
  userId: number;
  conversationId: number;
  text?: string;
  mediaUrls?: string[];
  to: string;
  from: string;
  direction: "inbound" | "outbound";
  timestamp: string;
  read: number;
  errorState: number;
  errorDescription: string;
}

export interface ConversationResponse {
  records: TextConversation[];
  totalRecords: number;
  page: number;
  recordsPerPage: number;
}

export interface TextMessages {
  records: TextMessage[];
  totalRecords: number;
  page: number;
  recordsPerPage: number;
}

export interface ProvisionedNumber {
  number: string;
  name?: string;
  tenantId: number;
}

export interface ProvisionedNumbers {
  provisionedNumbers: ProvisionedNumber[];
}

export type MediaUploadResponse = string[];

export interface SendSMSBody {
  tenantId?: number;
  to: string[];
  from: string;
  text?: string;
}

export interface SendMMSBody extends SendSMSBody {
  mediaUrls?: string[];
}

export interface SendMessageResponse {
  id?: number;
  messageIds?: number[];
  createdConversations: TextConversation[];
  postBody: {
    tenantId?: number;
    to?: string[];
    from?: string;
    text?: string;
    mediaUrls?: string[];
  };
  updatedAt?: string;
}

export interface TextMessageReceivedEvent {
  conversationId: number;
  createdConversations: TextConversation[];
  from: string;
  id: number;
  mediaUrls: string[];
  peerName: string;
  text: string;
  timestamp: number;
}

export interface ErrorReceivedEvent {
  conversationId: number;
  messageId: number;
  errorMsg: string;
}

export interface EditorMessage {
  text: string;
  html?: string;
  files?: File[];
}

export interface TextMessageSearch {
  id: number;
  conversationId: number;
  text: string;
  from: string;
  to: string;
  timestamp: string;
  direction: string;
}
