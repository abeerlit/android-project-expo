// Text/SMS Messaging Sagas
import {
  call,
  put,
  select,
  takeEvery,
  takeLatest,
  delay
} from "redux-saga/effects";
import * as textActions from "./actions.ts";
import * as globalActions from "../global-actions.ts";
import { Logger } from "shared/utils/Logger.ts";
import { State } from "store/types.ts";
import {
  listConversations,
  getMessagesForConversation,
  getProvisionedNumbers,
  sendNewTextMessage,
  hideConversation as hideConversationAPI,
  markConversationAsRead as markConversationAsReadAPI,
  getConversationById,
  patchConversationName
} from "shared/api/messaging/methods.ts";
import {
  TextConversation,
  TextMessage,
  SendMessageResponse,
  TextMessageReceivedEvent
} from "shared/api/messaging/types.ts";
import { hasActiveCall } from "core/callState.ts";
import { SMS_POLLING_ENABLED } from "./smsPollingConfig.ts";
import { syncSmsContactNameCacheFromStore } from "core/notifications/androidSmsContactNameCache.ts";

const logger = new Logger("Text Sagas: ");

// Fetch all conversations
function* fetchConversations(): Generator<any, void, any> {
  // logger.debug("fetchConversations() saga - Starting");
  try {
    const authReducer = yield select((state: State) => state.authReducer);
    if (!authReducer.isLoggedIn) {
      // logger.debug("fetchConversations() saga - User not logged in, skipping");
      return;
    }

    // OPTIMIZE: Update last fetch time to prevent duplicate fetches from APP_FOREGROUND
    lastConversationsFetchTime = Date.now();

    // logger.debug("fetchConversations() saga - Calling listConversations API");
    const response = yield call(listConversations, authReducer.accessToken);

    if (response && response.records) {
      logger.debug(
        "fetchConversations() saga - Setting conversations in store:",
        {
          conversationCount: response.records.length
        }
      );

      // Get current state before updating
      const textReducerBefore = yield select(
        (state: State) => state.textReducer
      );
      const currentConversations = textReducerBefore.conversations || [];
      const currentConversationMap = new Map(
        currentConversations.map((c: TextConversation) => [c.id, c])
      );

      // Check for conversations with new messages by comparing lastMessage
      // If API's lastMessage is different and newer, there might be new messages
      for (const apiConv of response.records) {
        const currentConv = currentConversationMap.get(apiConv.id);
        if (currentConv && apiConv.lastMessage && currentConv.lastMessage) {
          // If last message changed, it might indicate new messages
          // But we can't increment here without checking actual messages
          // This is just for logging
          if (apiConv.lastMessage !== currentConv.lastMessage) {
            logger.debug(
              "📥 [fetchConversations] Last message changed for conversation:",
              {
                conversationId: apiConv.id,
                oldLastMessage: currentConv.lastMessage?.substring(0, 50),
                newLastMessage: apiConv.lastMessage?.substring(0, 50),
                currentUnread: currentConv.unreadCount || 0,
                apiUnread: apiConv.unreadCount || 0
              }
            );
          }
        }
      }

      // The reducer will merge conversations and preserve unread counts
      // So we just need to set the conversations from API
      yield put(textActions.setConversations(response.records));
      syncSmsContactNameCacheFromStore();

      // logger.debug("📥 [fetchConversations] Conversations updated from API:", {
      //   count: response.records.length,
      //   unreadCounts: response.records.map((c: TextConversation) => ({
      //     id: c.id,
      //     unread: c.unreadCount || 0
      //   }))
      // });
    }

    // logger.debug("fetchConversations() saga - Completed successfully");
  } catch (_e) {
    // logger.error("fetchConversations() saga - Error:", e);
  }
}

// Fetch messages for a specific conversation
function* fetchConversationMessages(
  action: ReturnType<typeof textActions.fetchConversationMessages>
): Generator<any, void, any> {
  logger.debug(
    "fetchConversationMessages() saga - Starting with conversationId:",
    action.payload.conversationId,
    "page:",
    action.payload.page || 1
  );
  try {
    const authReducer = yield select((state: State) => state.authReducer);
    const userReducer = yield select((state: State) => state.userReducer);

    if (!authReducer.isLoggedIn || !userReducer.user?.id) {
      logger.debug(
        "fetchConversationMessages() saga - User not logged in or userId missing, skipping"
      );
      return;
    }

    const response = yield call(
      getMessagesForConversation,
      authReducer.accessToken,
      userReducer.user.id,
      action.payload.conversationId,
      action.payload.page || 1,
      100,
      action.payload.forceRefresh || false
    );

    if (!response || !response.records) {
      logger.error(
        "fetchConversationMessages() saga - Invalid response structure for conversationId:",
        action.payload.conversationId
      );
      return;
    }

    // Get current messages from state to compare with new messages
    const textReducer = yield select((state: State) => state.textReducer);
    const currentConversation = textReducer.conversations.find(
      (c) => c.id === action.payload.conversationId
    );
    const currentMessages =
      textReducer.conversationMessages[action.payload.conversationId] || [];
    const currentMessageIds = new Set(
      currentMessages.map((m: TextMessage) => m.id)
    );

    // Get the latest message from the response
    const latestMessage = response.records[response.records.length - 1];

    // Reverse the array without mutating the original
    const reversedMessages = [...response.records].reverse();

    // Check if there are new messages (messages not in current state)
    const newMessages = response.records.filter(
      (msg: TextMessage) => !currentMessageIds.has(msg.id)
    );
    const newInboundMessages = newMessages.filter(
      (msg: TextMessage) => msg.direction === "inbound"
    );
    const hasNewInboundMessages = newInboundMessages.length > 0;

    logger.debug("📥 [fetchConversationMessages] Message check:", {
      conversationId: action.payload.conversationId,
      totalMessages: response.records.length,
      currentMessagesCount: currentMessages.length,
      newMessagesCount: newMessages.length,
      newInboundCount: newInboundMessages.length,
      hasNewInboundMessages,
      isCurrentlyViewing:
        currentConversation?.id === textReducer.currentConversation?.id,
      currentUnreadCount: currentConversation?.unreadCount || 0,
      newInboundMessageIds: newInboundMessages.map((m: TextMessage) => m.id)
    });

    yield put(
      textActions.setConversationMessages(
        action.payload.conversationId,
        reversedMessages,
        response.totalRecords
      )
    );

    // Update last message in conversation.
    if (latestMessage && latestMessage.text) {
      yield put(
        textActions.updateLastMessage(
          action.payload.conversationId,
          latestMessage.text,
          latestMessage.timestamp
        )
      );
    }

    // If this is a force refresh (polling), handle unread count based on context
    if (action.payload.forceRefresh) {
      const textReducerAfter = yield select(
        (state: State) => state.textReducer
      );
      const conversationAfter = textReducerAfter.conversations.find(
        (c) => c.id === action.payload.conversationId
      );
      const isCurrentlyViewing =
        conversationAfter?.id === textReducerAfter.currentConversation?.id;

      if (isCurrentlyViewing) {
        // If viewing, mark as read (user is actively viewing the thread)
        if (conversationAfter && conversationAfter.unreadCount > 0) {
          logger.debug(
            "📥 [fetchConversationMessages] User is viewing conversation, marking as read:",
            action.payload.conversationId
          );
          yield put(
            textActions.updateUnreadCount(action.payload.conversationId, 0)
          );
        }
      } else {
        // If NOT viewing and there are new inbound messages, increment unread count
        if (hasNewInboundMessages) {
          const newInboundCount = newInboundMessages.length;
          logger.debug(
            "📥 [fetchConversationMessages] New inbound messages detected, incrementing unread count:",
            {
              conversationId: action.payload.conversationId,
              newInboundCount,
              currentUnread: conversationAfter?.unreadCount || 0
            }
          );

          // Increment by the number of new inbound messages
          for (let i = 0; i < newInboundCount; i++) {
            yield put(
              textActions.incrementUnreadCount(action.payload.conversationId)
            );
          }

          // Verify the increment happened
          const textReducerAfterIncrement = yield select(
            (state: State) => state.textReducer
          );
          const conversationAfterIncrement =
            textReducerAfterIncrement.conversations.find(
              (c) => c.id === action.payload.conversationId
            );
          logger.debug("📥 [fetchConversationMessages] After increment:", {
            conversationId: action.payload.conversationId,
            newUnread: conversationAfterIncrement?.unreadCount || 0,
            totalUnread: textReducerAfterIncrement.conversations.reduce(
              (sum, c) => sum + (c?.unreadCount || 0),
              0
            )
          });
        }
      }
    }
  } catch (e) {
    logger.error(
      "fetchConversationMessages() saga - Error for conversationId:",
      action.payload.conversationId,
      "error:",
      e
    );
  }
}

// Fetch provisioned numbers
function* fetchProvisionedNumbers(): Generator<any, void, any> {
  logger.debug("fetchProvisionedNumbers() saga - Starting");
  try {
    const authReducer = yield select((state: State) => state.authReducer);
    if (!authReducer.isLoggedIn) {
      logger.debug(
        "fetchProvisionedNumbers() saga - User not logged in, skipping"
      );
      return;
    }

    logger.debug(
      "fetchProvisionedNumbers() saga - Calling getProvisionedNumbers API"
    );
    const response = yield call(getProvisionedNumbers, authReducer.accessToken);
    logger.debug(
      "fetchProvisionedNumbers() saga - Setting provisioned numbers in store:",
      {
        count: response.provisionedNumbers?.length || 0
      }
    );
    yield put(textActions.setProvisionedNumbers(response.provisionedNumbers));
    logger.debug("fetchProvisionedNumbers() saga - Completed successfully");
  } catch (e) {
    logger.error("fetchProvisionedNumbers() saga - Error:", e);
  }
}

// Send a text message
function* sendTextMessage(
  action: ReturnType<typeof textActions.sendTextMessage>
): Generator<any, void, any> {
  logger.debug("📱 [sendTextMessage] Saga called");
  try {
    const authReducer = yield select((state: State) => state.authReducer);
    const userReducer = yield select((state: State) => state.userReducer);
    const textReducer = yield select((state: State) => state.textReducer);

    if (!authReducer.isLoggedIn || !userReducer.user?.tenantId) {
      logger.error("📱 [sendTextMessage] Not logged in or no tenant ID");
      return;
    }

    const { recipients, sender, message, mediaUrls } = action.payload;

    logger.debug("📱 [sendTextMessage] Calling sendNewTextMessage:", {
      recipients: recipients,
      sender: sender,
      messageLength: message.length,
      hasMedia: mediaUrls?.length > 0,
      tenantId: userReducer.user.tenantId
    });

    const response: SendMessageResponse = yield call(
      sendNewTextMessage,
      authReducer.accessToken,
      userReducer.user.tenantId,
      recipients,
      sender,
      { text: message },
      mediaUrls
    );

    logger.debug("📱 [sendTextMessage] API response:", response);

    // If a new conversation was created, add it to state
    if (
      response.createdConversations &&
      response.createdConversations.length > 0
    ) {
      const newConversation = response.createdConversations[0];
      yield put(textActions.addConversation(newConversation));
      yield put(textActions.setCurrentConversation(newConversation));
      yield put(textActions.groupSmsCreated(newConversation.id));

      // Mark new conversation as read since user just sent a message
      yield put(textActions.markConversationRead(newConversation.id));

      // Refetch messages for the new conversation to ensure we have the latest
      yield put(
        textActions.fetchConversationMessages(newConversation.id, 1, true)
      );
    } else {
      // Multiple recipients but no createdConversations: fetch list and find group (avoids freeze from fixed delay)
      if (recipients.length > 1) {
        logger.debug(
          "📱 [sendTextMessage] Multiple recipients, fetching conversations to find group"
        );

        const normalizedSender = sender.replace(/^1+/, "");
        const normalizedRecipients = recipients.map((r) =>
          r.replace(/^1+/, "")
        );

        let conversations: TextConversation[] = [];
        try {
          const listResponse = yield call(
            listConversations,
            authReducer.accessToken
          );
          if (listResponse?.records?.length) {
            conversations = listResponse.records;
            yield put(textActions.setConversations(listResponse.records));
          }
        } catch (listErr) {
          logger.error(
            "📱 [sendTextMessage] Failed to fetch conversations for group:",
            listErr
          );
        }

        const groupConversation = conversations.find((conv: any) => {
          if (!conv.participants) return false;
          const convParticipants = conv.participants
            .split(",")
            .map((p: string) => p.replace(/^1+/, "").trim())
            .filter((p: string) => p !== normalizedSender);
          const hasAll =
            normalizedRecipients.length === convParticipants.length &&
            normalizedRecipients.every((r: string) =>
              convParticipants.includes(r)
            );
          return hasAll;
        });

        if (groupConversation) {
          logger.debug("✅ [sendTextMessage] Found group conversation:", {
            conversationId: groupConversation.id,
            participants: groupConversation.participants
          });
          yield put(textActions.setCurrentConversation(groupConversation));
          yield put(textActions.groupSmsCreated(groupConversation.id));
          yield put(textActions.markConversationRead(groupConversation.id));
          yield put(
            textActions.fetchConversationMessages(groupConversation.id, 1, true)
          );
        } else {
          logger.warn(
            "📱 [sendTextMessage] Group conversation not found in list (count:",
            conversations.length,
            ")"
          );
        }

        yield put(textActions.fetchConversations());
        logger.debug("📱 [sendTextMessage] Message sent successfully");
        return;
      }

      // Add message to existing conversation (single recipient only)
      const currentConversation = textReducer.currentConversation;
      if (currentConversation) {
        const newMessage: TextMessage = {
          id:
            response.id || (response.messageIds && response.messageIds[0]) || 0,
          userId: userReducer.user.id,
          conversationId: currentConversation.id,
          text: response.postBody.text || "",
          mediaUrls: response.postBody.mediaUrls || [],
          to: recipients.join(","),
          from: sender,
          direction: "outbound",
          timestamp: new Date().toISOString(),
          read: 1,
          errorState: 0,
          errorDescription: ""
        };
        yield put(
          textActions.addMessageToConversation(
            currentConversation.id,
            newMessage
          )
        );
        yield put(
          textActions.updateLastMessage(
            currentConversation.id,
            response.postBody.text ||
              (response.postBody.mediaUrls &&
              response.postBody.mediaUrls.length > 0
                ? "Media"
                : "")
          )
        );
        yield put(
          textActions.updateConversation(currentConversation.id, {
            updatedAt: response.updatedAt || new Date().toISOString()
          })
        );
        if (currentConversation.hidden === 1) {
          yield put(textActions.unhideConversation(currentConversation.id));
        }

        // Mark conversation as read when sending a message (since user is viewing it)
        // This ensures the badge count is updated correctly
        yield put(textActions.markConversationRead(currentConversation.id));

        // Refetch messages for the current conversation to ensure we have the latest from server
        yield put(
          textActions.fetchConversationMessages(currentConversation.id, 1, true)
        );
      }
    }

    // Refetch conversations list to update last message and timestamp in the list
    yield put(textActions.fetchConversations());

    logger.debug("📱 [sendTextMessage] Message sent successfully");
  } catch (e: any) {
    logger.error("📱 [sendTextMessage] Error sending text message:", {
      error: e,
      code: e?.code,
      message: e?.message,
      response: e?.response,
      recipients: action.payload.recipients,
      sender: action.payload.sender
    });
    throw e;
  }
}

// Hide a conversation
function* hideConversation(
  action: ReturnType<typeof textActions.hideConversation>
): Generator<any, void, any> {
  logger.debug("hideConversation() saga", action.payload);
  try {
    const authReducer = yield select((state: State) => state.authReducer);
    if (!authReducer.isLoggedIn) return;

    yield call(hideConversationAPI, authReducer.accessToken, action.payload);
    // Reducer will update state optimistically
  } catch (e) {
    logger.error("Error hiding conversation", e);
  }
}

// Mark conversation as read
function* markConversationRead(
  action: ReturnType<typeof textActions.markConversationRead>
): Generator<any, void, any> {
  const conversationId = action.payload;
  logger.debug(
    "markConversationRead() saga - Marking as read:",
    conversationId
  );

  try {
    const authReducer = yield select((state: State) => state.authReducer);

    if (!authReducer.isLoggedIn) {
      logger.debug(
        "markConversationRead() saga - User not logged in, skipping"
      );
      return;
    }

    // Get current state before update
    const textReducer = yield select((state: State) => state.textReducer);
    const currentConversation = textReducer.conversations.find(
      (c) => c.id === conversationId
    );
    const currentUnread = currentConversation?.unreadCount || 0;

    logger.debug("🔍 [markConversationRead] Before update:", {
      conversationId,
      currentUnread,
      totalConversations: textReducer.conversations.length
    });

    // Update unread count to 0
    yield put(textActions.updateUnreadCount(conversationId, 0));

    // Get state after update to verify
    const textReducerAfter = yield select((state: State) => state.textReducer);
    const updatedConversation = textReducerAfter.conversations.find(
      (c) => c.id === conversationId
    );
    const newUnread = updatedConversation?.unreadCount || 0;
    const totalUnread = textReducerAfter.conversations.reduce(
      (sum, c) => sum + (c?.unreadCount || 0),
      0
    );

    logger.debug("🔍 [markConversationRead] After update:", {
      conversationId,
      newUnread,
      totalUnread,
      updated: newUnread === 0
    });

    yield call(
      markConversationAsReadAPI,
      authReducer.accessToken,
      conversationId
    );
    // Reducer will update state optimistically
    logger.debug("markConversationRead() saga - Successfully marked as read");
  } catch (e) {
    logger.error("markConversationRead() saga - Error:", e);
  }
}

// Handle incoming SMS push notification
function* handleSMSPushNotification(
  action: ReturnType<typeof textActions.handleSMSPushNotification>
): Generator<any, void, any> {
  const event: TextMessageReceivedEvent = action.payload;
  console.log("📱 [handleSMSPushNotification] Saga starting with event:", {
    conversationId: event.conversationId,
    messageId: event.id,
    from: event.from,
    hasText: !!event.text,
    hasMedia: event.mediaUrls?.length > 0
  });

  try {
    const authReducer = yield select((state: State) => state.authReducer);
    if (!authReducer.isLoggedIn) {
      logger.debug(
        "handleSMSPushNotification() saga - User not logged in, skipping"
      );
      return;
    }

    const { conversationId, createdConversations, text } = event;

    // Add new conversation if created
    if (createdConversations && createdConversations.length > 0) {
      logger.debug(
        "handleSMSPushNotification() saga - New conversation created:",
        {
          conversationId: createdConversations[0].id
        }
      );
      yield put(textActions.addConversation(createdConversations[0]));
      yield put(textActions.incrementUnreadCount(createdConversations[0].id));
    } else {
      // Check if conversation exists in state
      const textReducer = yield select((state: State) => state.textReducer);
      let conversation = textReducer?.conversations?.find(
        (c: TextConversation) => c.id === conversationId
      );

      // If not found, check hidden conversations
      if (!conversation) {
        logger.debug(
          "handleSMSPushNotification() saga - Conversation not in active list, checking hidden conversations"
        );
        conversation = textReducer?.hiddenConversations?.find(
          (c: TextConversation) => c.id === conversationId
        );
      }

      // If still not found, fetch it from API
      if (!conversation) {
        logger.debug(
          "handleSMSPushNotification() saga - Conversation not found in state, fetching from API"
        );
        try {
          const fetchedConversation: TextConversation = yield call(
            getConversationById,
            authReducer.accessToken,
            conversationId
          );
          if (fetchedConversation) {
            logger.debug(
              "handleSMSPushNotification() saga - Successfully fetched conversation from API"
            );
            yield put(textActions.addConversation(fetchedConversation));

            // Check if user is currently viewing this conversation
            const textReducerAfterFetch = yield select(
              (state: State) => state.textReducer
            );
            const isCurrentlyViewing =
              textReducerAfterFetch.currentConversation?.id === conversationId;

            if (isCurrentlyViewing) {
              logger.debug(
                "handleSMSPushNotification() saga - User is viewing newly fetched conversation, fetching messages"
              );
              yield put(textActions.updateUnreadCount(conversationId, 0));
              yield put(
                textActions.fetchConversationMessages(conversationId, 1, true)
              );
            } else {
              // If not viewing, increment unread count for the new message
              logger.debug(
                "handleSMSPushNotification() saga - Incrementing unread count for newly fetched conversation:",
                {
                  conversationId,
                  fetchedUnread: fetchedConversation.unreadCount || 0
                }
              );
              yield put(textActions.incrementUnreadCount(conversationId));

              // Verify the increment happened
              const textReducerAfter = yield select(
                (state: State) => state.textReducer
              );
              const updatedConversation = textReducerAfter.conversations.find(
                (c) => c.id === conversationId
              );
              logger.debug(
                "handleSMSPushNotification() saga - After increment (newly fetched):",
                {
                  conversationId,
                  newUnread: updatedConversation?.unreadCount || 0,
                  totalUnread: textReducerAfter.conversations.reduce(
                    (sum, c) => sum + (c?.unreadCount || 0),
                    0
                  )
                }
              );
            }
          }
        } catch (err) {
          logger.error(
            "handleSMSPushNotification() saga - Error fetching conversation by ID:",
            conversationId,
            "error:",
            err
          );
        }
      } else {
        logger.debug(
          "handleSMSPushNotification() saga - Conversation found in state:",
          {
            conversationId: conversation.id,
            isHidden: conversation.hidden === 1
          }
        );
        // Unhide if hidden
        if (conversation.hidden === 1) {
          logger.debug(
            "handleSMSPushNotification() saga - Unhiding conversation"
          );
          yield put(textActions.unhideConversation(conversationId));
        }

        // Check if user is currently viewing this conversation
        const textReducer = yield select((state: State) => state.textReducer);
        const isCurrentlyViewing =
          textReducer.currentConversation?.id === conversationId;

        if (isCurrentlyViewing) {
          logger.debug(
            "handleSMSPushNotification() saga - User is viewing conversation, fetching new messages"
          );
          yield put(textActions.markConversationRead(conversationId));
          yield put(
            textActions.fetchConversationMessages(conversationId, 1, true)
          );
        } else {
          // If not viewing, increment unread count
          logger.debug(
            "handleSMSPushNotification() saga - Incrementing unread count for existing conversation:",
            {
              conversationId,
              currentUnread: conversation.unreadCount || 0
            }
          );
          yield put(textActions.incrementUnreadCount(conversationId));

          // Verify the increment happened
          const textReducerAfter = yield select(
            (state: State) => state.textReducer
          );
          const updatedConversation = textReducerAfter.conversations.find(
            (c) => c.id === conversationId
          );
          logger.debug("handleSMSPushNotification() saga - After increment:", {
            conversationId,
            newUnread: updatedConversation?.unreadCount || 0,
            totalUnread: textReducerAfter.conversations.reduce(
              (sum, c) => sum + (c?.unreadCount || 0),
              0
            )
          });
        }
      }
    }

    // Update last message
    let lastMessage = text;
    if (!lastMessage || !lastMessage.trim()) {
      // Check if there are media URLs (image/video/attachment).
      if (event.mediaUrls && event.mediaUrls.length > 0) {
        lastMessage = "Attachment 📎";
      } else {
        lastMessage = "Attachment";
      }
    }
    logger.debug("handleSMSPushNotification() saga - Updating last message:", {
      conversationId,
      lastMessage:
        lastMessage.substring(0, 50) + (lastMessage.length > 50 ? "..." : "")
    });
    yield put(
      textActions.updateLastMessage(
        conversationId,
        lastMessage,
        new Date(event.timestamp).toISOString()
      )
    );

    logger.debug("handleSMSPushNotification() saga - Completed successfully");
    // TODO: Trigger native notification if app is in background
  } catch (e) {
    logger.error("handleSMSPushNotification() saga - Error:", e);
  }
}

// Update conversation name
function* updateConversationName(
  action: ReturnType<typeof textActions.updateConversationName>
): Generator<any, void, any> {
  logger.debug("updateConversationName() saga", action.payload.conversationId);
  try {
    const authReducer = yield select((state: State) => state.authReducer);
    if (!authReducer.isLoggedIn) return;

    yield call(
      patchConversationName,
      authReducer.accessToken,
      action.payload.conversationId,
      action.payload.name
    );
    // Reducer will update state optimistically
  } catch (e) {
    logger.error("Error updating conversation name", e);
  }
}

// Track last fetch time to prevent rapid duplicate fetches
let lastConversationsFetchTime = 0;
const FETCH_DEBOUNCE_MS = 25000; // Foreground must not duplicate Home/API list fetch after quick backgrounding

// Export sagas
// Handle app coming to foreground - sync conversations to update badge
function* handleAppForeground(): Generator<any, void, any> {
  try {
    const authReducer = yield select((state: State) => state.authReducer);
    if (!authReducer.isLoggedIn) {
      return;
    }

    // OPTIMIZE: Skip when in call (avoids churn from rapid active↔background cycling)
    if (typeof hasActiveCall === "function" && hasActiveCall()) {
      logger.debug(
        "⏭️ [handleAppForeground] Skipping conversations fetch - active/connecting call"
      );
      return;
    }

    // OPTIMIZE: Debounce to prevent duplicate fetches
    const now = Date.now();
    const timeSinceLastFetch = now - lastConversationsFetchTime;

    if (timeSinceLastFetch < FETCH_DEBOUNCE_MS) {
      logger.debug(
        "⏭️ [handleAppForeground] Skipping conversations fetch - recent fetch within debounce window"
      );
      return;
    }

    lastConversationsFetchTime = now;
    // Fetch conversations to sync unread counts with API
    // This will trigger badge recalculation via SendbirdContextProvider
    yield put(textActions.fetchConversations());
  } catch (error) {
    console.error(
      "📱 [Text Sagas] Error syncing conversations on foreground:",
      error
    );
  }
}

export const textSagas = [
  takeLatest(textActions.FETCH_CONVERSATIONS, fetchConversations),
  takeEvery(textActions.FETCH_CONVERSATION_MESSAGES, fetchConversationMessages),
  takeLatest(textActions.FETCH_PROVISIONED_NUMBERS, fetchProvisionedNumbers),
  takeEvery(textActions.SEND_TEXT_MESSAGE, sendTextMessage),
  takeEvery(textActions.HIDE_CONVERSATION, hideConversation),
  takeEvery(textActions.MARK_CONVERSATION_READ, markConversationRead),
  takeLatest(
    textActions.HANDLE_SMS_PUSH_NOTIFICATION,
    handleSMSPushNotification
  ),
  takeLatest(textActions.UPDATE_CONVERSATION_NAME, updateConversationName),
  takeLatest(textActions.START_MESSAGE_POLLING, startMessagePolling),
  takeEvery(textActions.STOP_MESSAGE_POLLING, stopMessagePolling),
  takeEvery(globalActions.APP_FOREGROUND, handleAppForeground)
];

const POLLING_INTERVAL = 2000; // 2 seconds
let pollingTask: any = null;

// Start polling for new messages.
function* startMessagePolling(
  action: ReturnType<typeof textActions.startMessagePolling>
): Generator<any, void, any> {
  const { conversationId } = action.payload;

  // Stop any existing polling
  if (pollingTask) {
    yield put({ type: textActions.STOP_MESSAGE_POLLING });
  }

  // Start new polling
  logger.debug(`Starting message polling for conversation ${conversationId}`);
  pollingTask = yield call(pollMessages, conversationId);
}

// Stop polling for messages
function* stopMessagePolling(): Generator<any, void, any> {
  if (pollingTask && pollingTask.isRunning()) {
    pollingTask.cancel();
    pollingTask = null;
    logger.debug("Stopped message polling");
  }
  yield undefined;
}

// Polling task
function* pollMessages(conversationId: number): Generator<any, void, any> {
  while (true) {
    try {
      if (!SMS_POLLING_ENABLED) {
        logger.debug("SMS polling disabled via SMS_POLLING_ENABLED");
        return;
      }

      const authReducer = yield select((state: State) => state.authReducer);
      const userReducer = yield select((state: State) => state.userReducer);

      if (!authReducer.isLoggedIn || !userReducer.user?.id) {
        yield put({ type: textActions.STOP_MESSAGE_POLLING });
        return;
      }

      // Fetch messages with forceRefresh to bypass cache.
      const response = yield call(
        getMessagesForConversation,
        authReducer.accessToken,
        userReducer.user.id,
        conversationId,
        1,
        100,
        true
      );

      if (response && response.records) {
        // Update messages in store.
        yield put(
          textActions.setConversationMessages(
            conversationId,
            [...response.records].reverse(),
            response.totalRecords
          )
        );
      }

      yield delay(POLLING_INTERVAL);
    } catch (error) {
      logger.error("Error in message polling:", error);
      yield delay(POLLING_INTERVAL);
    }
  }
}
