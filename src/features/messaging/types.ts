// Unified Messaging Types
import { FilteredDMChannel } from "features/chat/types.ts";
import { TextConversation } from "shared/api/messaging/types.ts";

// Combined conversation type - can be either Sendbird chat or SMS
export type CombinedConversation = FilteredDMChannel | TextConversation;

// Type guard to check if conversation is a Sendbird channel
export const isChatChannel = (
  conversation: CombinedConversation
): conversation is FilteredDMChannel => {
  return "url" in conversation;
};

// Type guard to check if conversation is an SMS conversation
export const isTextConversation = (
  conversation: CombinedConversation
): conversation is TextConversation => {
  return "participants" in conversation && !("url" in conversation);
};

export const getConversationTimestamp = (
  conversation: CombinedConversation
): number => {
  if (isChatChannel(conversation)) {
    // Use lastMessageAt timestamp from the channel, fallback to 0 if not available
    return conversation.lastMessageAt || 0;
  } else {
    return new Date(conversation.updatedAt).getTime();
  }
};

// Sort conversations by timestamp (most recent first)
export const sortConversations = (
  conversations: CombinedConversation[]
): CombinedConversation[] => {
  return conversations.sort((a, b) => {
    const aTime = getConversationTimestamp(a);
    const bTime = getConversationTimestamp(b);
    return bTime - aTime; // Most recent first
  });
};
