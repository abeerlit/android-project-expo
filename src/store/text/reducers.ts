/* Text/SMS Reducer
 * Handles SMS/MMS text messaging state in the app
 */
import * as textActions from "./actions.ts";
import createReducer from "store/utils/create-reducer.ts";
import {
  TextConversation,
  TextMessage,
  ProvisionedNumber
} from "shared/api/messaging/types.ts";
import { Logger } from "shared/utils/Logger.ts";

const logger = new Logger("TextReducer");

export interface ConversationMessages {
  [conversationId: number]: TextMessage[];
}

export interface ConversationMessageCounts {
  [conversationId: number]: number;
}

export interface TextDrafts {
  [conversationId: number]: string;
}

export interface TextState {
  currentConversation: TextConversation | null;
  conversations: TextConversation[];
  hiddenConversations: TextConversation[];
  provisionedNumbers: ProvisionedNumber[];
  selectedDidNumber: ProvisionedNumber | null;
  conversationMessages: ConversationMessages;
  conversationMessageCounts: ConversationMessageCounts;
  textDrafts: TextDrafts;
  isNewText: boolean;
  isLoading: boolean;
  lastCreatedGroupConversationId: number | null;
}

const initialState: TextState = {
  currentConversation: null,
  conversations: [],
  hiddenConversations: [],
  provisionedNumbers: [],
  selectedDidNumber: null,
  conversationMessages: {},
  conversationMessageCounts: {},
  textDrafts: {},
  isNewText: false,
  isLoading: false,
  lastCreatedGroupConversationId: null
};

// @ts-expect-error Ignoring the type error because making it typesafe involves a lot of work when we already know it will be safe
export const textReducer = createReducer<TextState, unknown>(initialState, {
  [textActions.SET_CONVERSATIONS](
    state: TextState,
    action: { type: string; payload: TextConversation[] }
  ) {
    logger.debug("SET_CONVERSATIONS", {
      incomingCount: action.payload.length,
      currentCount: state.conversations.length
    });

    // Create a map of current conversations to preserve unread counts
    const currentConversationMap = new Map(
      state.conversations.map((c) => [c.id, c])
    );

    // Merge incoming conversations with current state, preserving higher unread counts
    const mergedConversations = action.payload.map((incomingConv) => {
      const currentConv = currentConversationMap.get(incomingConv.id);
      if (currentConv) {
        // Preserve the higher unread count (local might be incremented but not yet synced to API)
        const preservedUnreadCount = Math.max(
          currentConv.unreadCount || 0,
          incomingConv.unreadCount || 0
        );

        if (preservedUnreadCount !== (currentConv.unreadCount || 0)) {
          logger.debug(
            "📥 [SET_CONVERSATIONS] Merging conversation with unread count change:",
            {
              conversationId: incomingConv.id,
              currentUnread: currentConv.unreadCount || 0,
              apiUnread: incomingConv.unreadCount || 0,
              preservedUnread: preservedUnreadCount
            }
          );
        }

        return {
          ...incomingConv,
          unreadCount: preservedUnreadCount
        };
      }
      // New conversation, use API's unread count
      if ((incomingConv.unreadCount || 0) > 0) {
        logger.debug(
          "📥 [SET_CONVERSATIONS] New conversation with unread messages:",
          {
            conversationId: incomingConv.id,
            unreadCount: incomingConv.unreadCount || 0
          }
        );
      }
      return {
        ...incomingConv,
        unreadCount: incomingConv.unreadCount || 0
      };
    });

    // Calculate total unread after merge
    const totalUnread = mergedConversations.reduce(
      (sum, c) => sum + (c.unreadCount || 0),
      0
    );

    logger.debug("📥 [SET_CONVERSATIONS] Total unread count after merge:", {
      totalUnread,
      conversationCount: mergedConversations.length
    });

    return {
      ...state,
      conversations: mergedConversations.filter((c) => c.hidden !== 1),
      hiddenConversations: mergedConversations.filter((c) => c.hidden === 1)
    };
  },

  [textActions.SET_CONVERSATION_MESSAGES](
    state: TextState,
    action: {
      type: string;
      payload: {
        conversationId: number;
        messages: TextMessage[];
        totalRecords: number;
      };
    }
  ) {
    logger.debug("SET_CONVERSATION_MESSAGES", action.payload.conversationId);
    return {
      ...state,
      conversationMessages: {
        ...state.conversationMessages,
        [action.payload.conversationId]: action.payload.messages
      },
      conversationMessageCounts: {
        ...state.conversationMessageCounts,
        [action.payload.conversationId]: action.payload.totalRecords
      }
    };
  },

  [textActions.SET_CURRENT_CONVERSATION](
    state: TextState,
    action: { type: string; payload: TextConversation | null }
  ) {
    logger.debug("SET_CURRENT_CONVERSATION", action.payload?.id);
    return {
      ...state,
      currentConversation: action.payload
    };
  },

  [textActions.GROUP_SMS_CREATED](
    state: TextState,
    action: { type: string; payload: { conversationId: number } }
  ) {
    return {
      ...state,
      lastCreatedGroupConversationId: action.payload.conversationId
    };
  },

  [textActions.CLEAR_LAST_CREATED_GROUP](state: TextState) {
    return {
      ...state,
      lastCreatedGroupConversationId: null
    };
  },

  [textActions.SET_PROVISIONED_NUMBERS](
    state: TextState,
    action: { type: string; payload: ProvisionedNumber[] }
  ) {
    logger.debug("SET_PROVISIONED_NUMBERS", action.payload.length);
    return {
      ...state,
      provisionedNumbers: action.payload,
      selectedDidNumber:
        state.selectedDidNumber ||
        (action.payload.length > 0 ? action.payload[0] : null)
    };
  },

  [textActions.SET_SELECTED_DID_NUMBER](
    state: TextState,
    action: { type: string; payload: ProvisionedNumber | null }
  ) {
    logger.debug("SET_SELECTED_DID_NUMBER", action.payload?.number);
    return {
      ...state,
      selectedDidNumber: action.payload
    };
  },

  [textActions.ADD_CONVERSATION](
    state: TextState,
    action: { type: string; payload: TextConversation }
  ) {
    const conversation = action.payload;
    logger.debug("ADD_CONVERSATION", {
      conversationId: conversation.id,
      unreadCount: conversation.unreadCount || 0
    });

    // Check if conversation already exists - if so, update it instead of adding duplicate
    const existingIndex = state.conversations.findIndex(
      (c) => c.id === conversation.id
    );
    if (existingIndex >= 0) {
      // Update existing conversation
      const updatedConversations = [...state.conversations];
      updatedConversations[existingIndex] = {
        ...updatedConversations[existingIndex],
        ...conversation,
        // Preserve unreadCount if it's already set and higher, otherwise use the new one
        unreadCount: Math.max(
          updatedConversations[existingIndex].unreadCount || 0,
          conversation.unreadCount || 0
        )
      };
      return {
        ...state,
        conversations: updatedConversations
      };
    }

    // Ensure unreadCount is always set (default to 0 if not provided)
    const conversationWithUnread = {
      ...conversation,
      unreadCount: conversation.unreadCount || 0
    };

    return {
      ...state,
      conversations: [conversationWithUnread, ...state.conversations]
    };
  },

  [textActions.UPDATE_CONVERSATION](
    state: TextState,
    action: {
      type: string;
      payload: { conversationId: number; updates: Partial<TextConversation> };
    }
  ) {
    logger.debug("UPDATE_CONVERSATION", action.payload.conversationId);
    return {
      ...state,
      conversations: state.conversations.map((c) =>
        c.id === action.payload.conversationId
          ? { ...c, ...action.payload.updates }
          : c
      ),
      currentConversation:
        state.currentConversation?.id === action.payload.conversationId
          ? { ...state.currentConversation, ...action.payload.updates }
          : state.currentConversation
    };
  },

  [textActions.HIDE_CONVERSATION](
    state: TextState,
    action: { type: string; payload: number }
  ) {
    const id = action.payload;
    logger.debug("HIDE_CONVERSATION", id);

    const conversation = state.conversations.find((c) => c.id === id);

    const { [id]: _msgs, ...conversationMessages } = state.conversationMessages;
    const { [id]: _counts, ...conversationMessageCounts } =
      state.conversationMessageCounts;
    const { [id]: _drafts, ...textDrafts } = state.textDrafts;

    const clearCaches = {
      conversationMessages,
      conversationMessageCounts,
      textDrafts
    };

    const clearCurrentIfMatch =
      state.currentConversation?.id === id ? null : state.currentConversation;

    if (!conversation) {
      return {
        ...state,
        ...clearCaches,
        currentConversation: clearCurrentIfMatch
      };
    }

    return {
      ...state,
      conversations: state.conversations.filter((c) => c.id !== id),
      hiddenConversations: [
        { ...conversation, hidden: 1 },
        ...state.hiddenConversations.filter((c) => c.id !== id)
      ],
      ...clearCaches,
      currentConversation: clearCurrentIfMatch
    };
  },

  [textActions.UNHIDE_CONVERSATION](
    state: TextState,
    action: { type: string; payload: number }
  ) {
    logger.debug("UNHIDE_CONVERSATION", action.payload);
    const conversation = state.hiddenConversations.find(
      (c) => c.id === action.payload
    );
    if (!conversation) return state;

    return {
      ...state,
      hiddenConversations: state.hiddenConversations.filter(
        (c) => c.id !== action.payload
      ),
      conversations: [{ ...conversation, hidden: 0 }, ...state.conversations]
    };
  },

  [textActions.MARK_CONVERSATION_READ](
    state: TextState,
    action: { type: string; payload: number }
  ) {
    logger.debug("MARK_CONVERSATION_READ", action.payload);
    return {
      ...state,
      conversations: state.conversations.map((c) =>
        c.id === action.payload ? { ...c, unreadCount: 0 } : c
      ),
      currentConversation:
        state.currentConversation?.id === action.payload
          ? { ...state.currentConversation, unreadCount: 0 }
          : state.currentConversation
    };
  },

  [textActions.INCREMENT_UNREAD_COUNT](
    state: TextState,
    action: { type: string; payload: number }
  ) {
    const conversationId = action.payload;
    logger.debug("INCREMENT_UNREAD_COUNT", {
      conversationId,
      beforeUpdate:
        state.conversations.find((c) => c.id === conversationId)?.unreadCount ||
        0
    });

    const updatedConversations = state.conversations.map((c) =>
      c.id === conversationId
        ? { ...c, unreadCount: (c.unreadCount || 0) + 1 }
        : c
    );

    const totalUnread = updatedConversations.reduce(
      (sum, conv) => sum + (conv?.unreadCount || 0),
      0
    );

    logger.debug("INCREMENT_UNREAD_COUNT - After update:", {
      conversationId,
      newUnreadCount:
        updatedConversations.find((c) => c.id === conversationId)
          ?.unreadCount || 0,
      totalUnread,
      conversationCount: updatedConversations.length
    });

    return {
      ...state,
      conversations: updatedConversations
    };
  },

  [textActions.UPDATE_LAST_MESSAGE](
    state: TextState,
    action: {
      type: string;
      payload: {
        conversationId: number;
        message: string;
        updatedAt?: string;
      };
    }
  ) {
    logger.debug("UPDATE_LAST_MESSAGE", action.payload.conversationId);
    const updatedAt =
      action.payload.updatedAt ?? new Date().toISOString();
    return {
      ...state,
      conversations: state.conversations.map((c) =>
        c.id === action.payload.conversationId
          ? { ...c, lastMessage: action.payload.message, updatedAt }
          : c
      ),
      currentConversation:
        state.currentConversation?.id === action.payload.conversationId
          ? {
              ...state.currentConversation,
              lastMessage: action.payload.message,
              updatedAt
            }
          : state.currentConversation
    };
  },

  [textActions.SET_NEW_TEXT_MODE](
    state: TextState,
    action: { type: string; payload: boolean }
  ) {
    logger.debug("SET_NEW_TEXT_MODE", action.payload);
    return {
      ...state,
      isNewText: action.payload
    };
  },

  [textActions.SET_TEXT_DRAFT](
    state: TextState,
    action: {
      type: string;
      payload: { conversationId: number; draft: string };
    }
  ) {
    return {
      ...state,
      textDrafts: {
        ...state.textDrafts,
        [action.payload.conversationId]: action.payload.draft
      }
    };
  },

  [textActions.CLEAR_TEXT_DRAFT](
    state: TextState,
    action: { type: string; payload: number }
  ) {
    const { [action.payload]: removed, ...remainingDrafts } = state.textDrafts;
    return {
      ...state,
      textDrafts: remainingDrafts
    };
  },

  [textActions.ADD_MESSAGE_TO_CONVERSATION](
    state: TextState,
    action: {
      type: string;
      payload: { conversationId: number; message: TextMessage };
    }
  ) {
    logger.debug("ADD_MESSAGE_TO_CONVERSATION", action.payload.conversationId);
    const currentMessages =
      state.conversationMessages[action.payload.conversationId] || [];
    return {
      ...state,
      conversationMessages: {
        ...state.conversationMessages,
        [action.payload.conversationId]: [
          ...currentMessages,
          action.payload.message
        ]
      }
    };
  },

  [textActions.UPDATE_CONVERSATION_NAME](
    state: TextState,
    action: {
      type: string;
      payload: { conversationId: number; name: string };
    }
  ) {
    logger.debug("UPDATE_CONVERSATION_NAME", action.payload.conversationId);
    return {
      ...state,
      conversations: state.conversations.map((c) =>
        c.id === action.payload.conversationId
          ? { ...c, conversationName: action.payload.name }
          : c
      ),
      currentConversation:
        state.currentConversation?.id === action.payload.conversationId
          ? {
              ...state.currentConversation,
              conversationName: action.payload.name
            }
          : state.currentConversation
    };
  },

  [textActions.RESET_TEXT_STATE]() {
    logger.debug("RESET_TEXT_STATE");
    return initialState;
  },

  [textActions.UPDATE_UNREAD_COUNT](
    state: TextState,
    action: {
      type: string;
      payload: { conversationId: number; unreadCount: number };
    }
  ) {
    const { conversationId, unreadCount } = action.payload;

    // Calculate total unread before update
    const totalUnreadBefore = state.conversations.reduce(
      (sum, conv) => sum + (conv?.unreadCount || 0),
      0
    );

    logger.debug("🔍 [UPDATE_UNREAD_COUNT] Before update:", {
      conversationId,
      newUnreadCount: unreadCount,
      totalUnreadBefore,
      conversationCount: state.conversations.length
    });

    const newState = {
      ...state,
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: unreadCount } : c
      ),
      currentConversation:
        state.currentConversation?.id === conversationId
          ? { ...state.currentConversation, unreadCount: unreadCount }
          : state.currentConversation
    };

    // Log the total unread count after update for debugging
    const totalUnreadAfter = newState.conversations.reduce(
      (sum, conv) => sum + (conv?.unreadCount || 0),
      0
    );

    logger.debug("🔍 [UPDATE_UNREAD_COUNT] After update:", {
      conversationId,
      newUnreadCount: unreadCount,
      totalUnreadAfter,
      changed: totalUnreadBefore !== totalUnreadAfter,
      conversationDetails: newState.conversations
        .filter((c) => c.id === conversationId)
        .map((c) => ({ id: c.id, unreadCount: c.unreadCount }))
    });

    return newState;
  }
});
