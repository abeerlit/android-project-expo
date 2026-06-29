// Text/SMS Messaging Actions
import {
  TextConversation,
  TextMessage,
  ProvisionedNumber
} from "shared/api/messaging/types.ts";

// Action Types
export const FETCH_CONVERSATIONS = "FETCH_CONVERSATIONS";
export const SET_CONVERSATIONS = "SET_CONVERSATIONS";
export const FETCH_CONVERSATION_MESSAGES = "FETCH_CONVERSATION_MESSAGES";
export const SET_CONVERSATION_MESSAGES = "SET_CONVERSATION_MESSAGES";
export const SET_CURRENT_CONVERSATION = "SET_CURRENT_CONVERSATION";
export const SEND_TEXT_MESSAGE = "SEND_TEXT_MESSAGE";
export const FETCH_PROVISIONED_NUMBERS = "FETCH_PROVISIONED_NUMBERS";
export const SET_PROVISIONED_NUMBERS = "SET_PROVISIONED_NUMBERS";
export const SET_SELECTED_DID_NUMBER = "SET_SELECTED_DID_NUMBER";
export const ADD_CONVERSATION = "ADD_CONVERSATION";
export const UPDATE_CONVERSATION = "UPDATE_CONVERSATION";
export const HIDE_CONVERSATION = "HIDE_CONVERSATION";
export const UNHIDE_CONVERSATION = "UNHIDE_CONVERSATION";
export const MARK_CONVERSATION_READ = "MARK_CONVERSATION_READ";
export const INCREMENT_UNREAD_COUNT = "INCREMENT_UNREAD_COUNT";
export const UPDATE_LAST_MESSAGE = "UPDATE_LAST_MESSAGE";
export const HANDLE_SMS_PUSH_NOTIFICATION = "HANDLE_SMS_PUSH_NOTIFICATION";
export const HANDLE_ERROR_MESSAGE = "HANDLE_ERROR_MESSAGE";
export const SET_NEW_TEXT_MODE = "SET_NEW_TEXT_MODE";
export const SET_TEXT_DRAFT = "SET_TEXT_DRAFT";
export const CLEAR_TEXT_DRAFT = "CLEAR_TEXT_DRAFT";
export const RESET_TEXT_STATE = "RESET_TEXT_STATE";
export const ADD_MESSAGE_TO_CONVERSATION = "ADD_MESSAGE_TO_CONVERSATION";
export const UPDATE_CONVERSATION_NAME = "UPDATE_CONVERSATION_NAME";
export const START_MESSAGE_POLLING = "START_MESSAGE_POLLING";
export const STOP_MESSAGE_POLLING = "STOP_MESSAGE_POLLING";
export const UPDATE_UNREAD_COUNT = "UPDATE_UNREAD_COUNT";
export const GROUP_SMS_CREATED = "GROUP_SMS_CREATED";
export const CLEAR_LAST_CREATED_GROUP = "CLEAR_LAST_CREATED_GROUP";

// Action Creators
export const fetchConversations = () => ({
  type: FETCH_CONVERSATIONS
});

export const setConversations = (conversations: TextConversation[]) => ({
  type: SET_CONVERSATIONS,
  payload: conversations
});

export const fetchConversationMessages = (
  conversationId: number,
  page?: number,
  forceRefresh: boolean = false
) => ({
  type: FETCH_CONVERSATION_MESSAGES,
  payload: { conversationId, page, forceRefresh }
});

export const setConversationMessages = (
  conversationId: number,
  messages: TextMessage[],
  totalRecords: number
) => ({
  type: SET_CONVERSATION_MESSAGES,
  payload: { conversationId, messages, totalRecords }
});

export const setCurrentConversation = (
  conversation: TextConversation | null
) => ({
  type: SET_CURRENT_CONVERSATION,
  payload: conversation
});

export const sendTextMessage = (
  recipients: string[],
  sender: string,
  message: string,
  mediaUrls: string[]
) => ({
  type: SEND_TEXT_MESSAGE,
  payload: { recipients, sender, message, mediaUrls }
});

export const fetchProvisionedNumbers = () => ({
  type: FETCH_PROVISIONED_NUMBERS
});

export const setProvisionedNumbers = (numbers: ProvisionedNumber[]) => ({
  type: SET_PROVISIONED_NUMBERS,
  payload: numbers
});

export const setSelectedDidNumber = (number: ProvisionedNumber | null) => ({
  type: SET_SELECTED_DID_NUMBER,
  payload: number
});

export const addConversation = (conversation: TextConversation) => ({
  type: ADD_CONVERSATION,
  payload: conversation
});

export const updateConversation = (
  conversationId: number,
  updates: Partial<TextConversation>
) => ({
  type: UPDATE_CONVERSATION,
  payload: { conversationId, updates }
});

export const hideConversation = (conversationId: number) => ({
  type: HIDE_CONVERSATION,
  payload: conversationId
});

export const unhideConversation = (conversationId: number) => ({
  type: UNHIDE_CONVERSATION,
  payload: conversationId
});

export const markConversationRead = (conversationId: number) => ({
  type: MARK_CONVERSATION_READ,
  payload: conversationId
});

export const incrementUnreadCount = (conversationId: number) => ({
  type: INCREMENT_UNREAD_COUNT,
  payload: conversationId
});

export const updateLastMessage = (
  conversationId: number,
  message: string,
  updatedAt?: string
) => ({
  type: UPDATE_LAST_MESSAGE,
  payload: { conversationId, message, updatedAt }
});

export const handleSMSPushNotification = (event: any) => ({
  type: HANDLE_SMS_PUSH_NOTIFICATION,
  payload: event
});

export const handleErrorMessage = (event: any) => ({
  type: HANDLE_ERROR_MESSAGE,
  payload: event
});

export const setNewTextMode = (isNew: boolean) => ({
  type: SET_NEW_TEXT_MODE,
  payload: isNew
});

export const setTextDraft = (conversationId: number, draft: string) => ({
  type: SET_TEXT_DRAFT,
  payload: { conversationId, draft }
});

export const clearTextDraft = (conversationId: number) => ({
  type: CLEAR_TEXT_DRAFT,
  payload: conversationId
});

export const resetTextState = () => ({
  type: RESET_TEXT_STATE
});

export const addMessageToConversation = (
  conversationId: number,
  message: TextMessage
) => ({
  type: ADD_MESSAGE_TO_CONVERSATION,
  payload: { conversationId, message }
});

export const updateConversationName = (
  conversationId: number,
  name: string
) => ({
  type: UPDATE_CONVERSATION_NAME,
  payload: { conversationId, name }
});

export const startMessagePolling = (conversationId: number) => ({
  type: START_MESSAGE_POLLING,
  payload: { conversationId }
});

export const stopMessagePolling = () => ({
  type: STOP_MESSAGE_POLLING
});

export const updateUnreadCount = (
  conversationId: number,
  unreadCount: number
) => ({
  type: UPDATE_UNREAD_COUNT,
  payload: { conversationId, unreadCount }
});

export const groupSmsCreated = (conversationId: number) => ({
  type: GROUP_SMS_CREATED,
  payload: { conversationId }
});

export const clearLastCreatedGroup = () => ({
  type: CLEAR_LAST_CREATED_GROUP
});
