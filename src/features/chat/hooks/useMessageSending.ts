// Hook for handling message sending
import { useCallback } from "react";
import { useSelector } from "react-redux";
import { toast } from "@backpackapp-io/react-native-toast";
import { State } from "store/types.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { getConversationsByParticipants } from "shared/api/messaging/methods.ts";
import { stripPhoneNumber } from "shared/utils/formatters.ts";
import { NewMessageItem } from "./types.ts";
import { Logger } from "shared/utils/Logger.ts";

const logger = new Logger("useMessageSending");

interface UseMessageSendingProps {
  isSearchMode: boolean;
  selectedRecipients: NewMessageItem[];
  activeChannelUrl?: string;
  onChannelCreated: (channelUrl: string) => void;
  onConversationCreated: (conversationId: number) => void;
}

export const useMessageSending = ({
  isSearchMode,
  selectedRecipients,
  activeChannelUrl,
  onChannelCreated,
  onConversationCreated
}: UseMessageSendingProps) => {
  const { selectedDidNumber } = useSelector(
    (state: State) => state.textReducer
  );
  const { accessToken } = useSelector((state: State) => state.authReducer);
  const { createOrJoinDMChannel } = useSendbirdContext();

  // Handle Sendbird message sent
  const handleSendbirdMessageSent = useCallback(async () => {
    // Only create channel if we're in search mode OR if there's no active channel
    // This allows channel creation when channelUrl was cleared due to recipient changes
    if (!isSearchMode && activeChannelUrl) return;

    try {
      let channelUrlToActivate: string | undefined;

      if (activeChannelUrl) {
        channelUrlToActivate = activeChannelUrl;
      } else {
        // Create new channel
        const userIds = selectedRecipients
          .map((r) => r.userId)
          .filter(Boolean) as string[];

        if (userIds.length === 0) {
          logger.warn("No user IDs available to create channel");
          toast.error("No recipients selected");
          return;
        }

        logger.debug("Creating new channel for recipients:", userIds);
        const result = await createOrJoinDMChannel(userIds);

        if (result.success && result.channelUrl) {
          channelUrlToActivate = result.channelUrl;
          logger.debug("Channel created successfully:", channelUrlToActivate);
        } else {
          toast.error("Failed to create chat");
          logger.error("Failed to create DM channel:", result.error);
          return;
        }
      }

      if (channelUrlToActivate) {
        onChannelCreated(channelUrlToActivate);
      }
    } catch (error) {
      logger.error("Error in handleSendbirdMessageSent:", error);
      toast.error("Error sending message");
    }
  }, [
    isSearchMode,
    activeChannelUrl,
    selectedRecipients,
    createOrJoinDMChannel,
    onChannelCreated
  ]);

  // Handle text/SMS message sent
  const handleTextMessageSent = useCallback(async () => {
    if (!isSearchMode) return;

    try {
      if (!selectedDidNumber || selectedRecipients.length === 0) {
        toast.error("Please select a recipient and phone number");
        return;
      }

      const phoneRecipients = selectedRecipients.filter(
        (r) =>
          r.type === "phone" ||
          r.type === "personal" ||
          r.type === "phone-contact"
      );
      if (phoneRecipients.length === 0) {
        toast.error("Please select a valid phone number");
        return;
      }

      // For group SMS (2+ recipients): saga handles createdConversations and sets
      // currentConversation. Sync effect will set activeConversationId. Do NOT call
      // getConversationsByParticipants with single recipient - it returns 1:1 and causes
      // wrong conversation + sync loop.
      if (phoneRecipients.length > 1) {
        return;
      }

      const phoneRecipient = phoneRecipients[0];
      if (!phoneRecipient?.phoneNumber) return;

      const sender = stripPhoneNumber(selectedDidNumber.number);
      const to = phoneRecipient.phoneNumber;

      // Wait for message to send, then find conversation (single recipient only)
      setTimeout(async () => {
        try {
          const conversation = await getConversationsByParticipants(
            accessToken,
            sender,
            to
          );

          if (conversation && conversation.id) {
            onConversationCreated(conversation.id);
          }
        } catch (error: any) {
          // 404 is expected if conversation hasn't been created yet - don't log as error
          if (error?.code === 404 || error?.message?.includes("not found")) {
            logger.debug(
              "Conversation not found yet after send (404 - will retry or create on next message)"
            );
          } else {
            logger.error("Error finding conversation after send:", error);
          }
        }
      }, 1000);
    } catch (error) {
      logger.error("Error in handleTextMessageSent:", error);
      toast.error("Error sending message");
    }
  }, [
    isSearchMode,
    selectedDidNumber,
    selectedRecipients,
    accessToken,
    onConversationCreated
  ]);

  return {
    handleSendbirdMessageSent,
    handleTextMessageSent
  };
};
