// Hook for finding and routing to conversations
import { useState, useEffect, useCallback, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { State } from "store/types.ts";
import * as textActions from "store/text/actions.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { getConversationsByParticipants } from "shared/api/messaging/methods.ts";
import {
  stripPhoneNumber,
  formatPhoneNumber
} from "shared/utils/formatters.ts";
import { findContactByPhoneNumber } from "features/calling/utils/contact-lookup.ts";
import { GroupChannel } from "@sendbird/chat/groupChannel";
import { NewMessageItem, ChatType } from "./types.ts";
import { Logger } from "shared/utils/Logger.ts";

const logger = new Logger("useConversationRouter");

export type SmsLookupStatus = "idle" | "searching" | "done";

interface UseConversationRouterProps {
  selectedRecipients: NewMessageItem[];
  isSearchMode: boolean;
  initialChannelUrl?: string;
  initialConversationId?: number;
  initialRecipientName?: string;
}

export const useConversationRouter = ({
  selectedRecipients,
  isSearchMode,
  initialChannelUrl,
  initialConversationId,
  initialRecipientName
}: UseConversationRouterProps) => {
  const [activeChannelUrl, setActiveChannelUrl] = useState(initialChannelUrl);
  const [activeConversationId, setActiveConversationId] = useState(
    initialConversationId
  );
  const [recipientName, _setRecipientName] = useState(initialRecipientName);
  const [smsLookupStatus, setSmsLookupStatus] =
    useState<SmsLookupStatus>("idle");

  useEffect(() => {
    if (initialChannelUrl && initialChannelUrl !== activeChannelUrl) {
      logger.debug(
        "🔄 [useConversationRouter] Route param changed, updating activeChannelUrl:",
        { from: activeChannelUrl, to: initialChannelUrl }
      );
      setActiveChannelUrl(initialChannelUrl);
    }
  }, [initialChannelUrl]);

  const dispatch = useDispatch();
  const { selectedDidNumber, currentConversation, conversations } =
    useSelector((state: State) => state.textReducer);
  const { accessToken } = useSelector((state: State) => state.authReducer);
  const { directory, personalContacts, companyContacts, phoneContacts } =
    useSelector((state: State) => state.directoryReducer);
  const { channels, findExistingDMChannel } = useSendbirdContext();

  // Track previous recipients to detect changes
  const prevRecipientsRef = useRef<NewMessageItem[]>(selectedRecipients);

  // Clear channelUrl when recipient list changes
  useEffect(() => {
    // Generate a stable key for recipients list
    const getRecipientsKey = (recipients: NewMessageItem[]): string => {
      return recipients
        .map(
          (r) => `${r.type}-${r.userId || r.phoneNumber || r.channelUrl || ""}`
        )
        .sort()
        .join("|");
    };

    const prevKey = getRecipientsKey(prevRecipientsRef.current);
    const currentKey = getRecipientsKey(selectedRecipients);
    const recipientsChanged = prevKey !== currentKey;

    if (
      recipientsChanged &&
      activeChannelUrl &&
      activeChannelUrl !== initialChannelUrl
    ) {
      logger.debug("Recipients changed, clearing channelUrl", {
        prevKey,
        currentKey,
        prevCount: prevRecipientsRef.current.length,
        currentCount: selectedRecipients.length
      });
      setActiveChannelUrl(undefined);
    }

    // Update ref for next comparison
    prevRecipientsRef.current = selectedRecipients;
  }, [selectedRecipients, activeChannelUrl, initialChannelUrl]);

  // Clear state when entering New Message (no route params, no recipients)
  useEffect(() => {
    if (
      initialConversationId == null &&
      initialChannelUrl == null &&
      selectedRecipients.length === 0
    ) {
      setActiveConversationId(undefined);
      setActiveChannelUrl(undefined);
      dispatch(textActions.setCurrentConversation(null));
    }
  }, [initialConversationId, initialChannelUrl, selectedRecipients.length, dispatch]);

  // Sync activeConversationId with currentConversation when it's set by Redux.
  // Do NOT sync when on New Message (no params, no recipients) - otherwise stale thread shows.
  // Do NOT sync when 2+ phone recipients (group SMS) - router's group lookup and saga are source of truth.
  // Syncing would overwrite correct group ID with wrong 1:1 ID and cause flip-flop loop.
  const hasMultiplePhoneRecipients =
    selectedRecipients.filter(
      (r) =>
        r.type === "phone" ||
        r.type === "personal" ||
        r.type === "phone-contact"
    ).length > 1;

  useEffect(() => {
    if (initialConversationId == null && selectedRecipients.length === 0) {
      return;
    }
    if (hasMultiplePhoneRecipients) {
      return;
    }
    if (
      currentConversation &&
      currentConversation.id !== activeConversationId
    ) {
      logger.debug(
        "✅ [useConversationRouter] Syncing activeConversationId with currentConversation:",
        {
          from: activeConversationId,
          to: currentConversation.id
        }
      );
      setActiveConversationId(currentConversation.id);
    }
  }, [
    currentConversation,
    activeConversationId,
    initialConversationId,
    selectedRecipients,
    hasMultiplePhoneRecipients
  ]);

  // Determine chat type
  const chatType: ChatType = (() => {
    if (activeConversationId) return "text";
    if (activeChannelUrl) return "sendbird";

    if (selectedRecipients.length > 0) {
      const firstRecipient = selectedRecipients[0];
      console.warn("🔍 [useConversationRouter] Determining chatType:", {
        firstRecipientType: firstRecipient.type,
        firstRecipientPhoneNumber: firstRecipient.phoneNumber,
        firstRecipientName: firstRecipient.name,
        totalRecipients: selectedRecipients.length
      });

      if (
        firstRecipient.type === "phone" ||
        firstRecipient.type === "personal" ||
        firstRecipient.type === "phone-contact"
      ) {
        console.warn("✅ [useConversationRouter] ChatType set to 'text'");
        return "text";
      }
      return "sendbird";
    }

    console.warn("⚠️ [useConversationRouter] No recipients, chatType is null");
    return null;
  })();

  // Search for existing Sendbird conversation
  useEffect(() => {
    const searchForExistingThread = async () => {
      if (
        selectedRecipients.length === 0 ||
        !isSearchMode ||
        chatType !== "sendbird"
      )
        return;

      const userIds = selectedRecipients
        .map((r) => r.userId)
        .filter(Boolean) as string[];

      if (userIds.length === 0) return;

      logger.debug("🔍 [useConversationRouter] Sendbird user recipients:", {
        count: userIds.length,
        userIds: userIds
      });

      // ✅ CONSISTENCY: For Sendbird, if multiple users selected, still search for existing group
      // because Sendbird groups are persistent channels (unlike SMS broadcast)
      logger.debug(
        "Searching for existing Sendbird thread with users:",
        userIds
      );

      try {
        const foundChannel = findExistingDMChannel(userIds);
        if (foundChannel) {
          logger.debug("Found existing channel:", foundChannel.url);
          setActiveChannelUrl(foundChannel.url);
        } else {
          logger.debug("No existing channel found");
          setActiveChannelUrl(undefined);
        }
      } catch (error) {
        logger.error("Error searching for existing thread:", error);
        setActiveChannelUrl(undefined);
      }
    };

    searchForExistingThread();
  }, [selectedRecipients, findExistingDMChannel, isSearchMode, chatType]);

  // Search for existing text/SMS conversation
  useEffect(() => {
    const searchForExistingConversation = async () => {
      if (
        selectedRecipients.length === 0 ||
        !selectedDidNumber ||
        !isSearchMode ||
        chatType !== "text"
      ) {
        setSmsLookupStatus("idle");
        return;
      }

      // Count phone recipients first so we can branch on single vs multiple
      const phoneRecipients = selectedRecipients.filter(
        (r) =>
          r.type === "phone" ||
          r.type === "personal" ||
          r.type === "phone-contact"
      );

      if (phoneRecipients.length === 0) {
        setSmsLookupStatus("idle");
        return;
      }

      // Multiple phone recipients: always run group lookup; don't skip for currentConversation.
      // When no group exists, clear currentConversation so UI shows empty group compose.
      if (phoneRecipients.length > 1) {
        logger.debug("🔍 [useConversationRouter] Phone recipients (multi):", {
          count: phoneRecipients.length,
          recipients: phoneRecipients.map((r) => r.phoneNumber || r.name)
        });
        const from = stripPhoneNumber(selectedDidNumber.number);
        const normalizedRecipients = phoneRecipients
          .map((r) => stripPhoneNumber(r.phoneNumber || r.name || ""))
          .filter((p) => p.length >= 10);
        if (normalizedRecipients.length === 0) {
          dispatch(textActions.setCurrentConversation(null));
          setActiveConversationId(undefined);
          return;
        }
        const groupConversation = (conversations || []).find((conv: any) => {
          if (!conv.participants) return false;
          const convParticipants = conv.participants
            .split(",")
            .map((p: string) => p.replace(/^1+/, "").trim())
            .filter((p: string) => p !== from);
          const hasAll =
            normalizedRecipients.length === convParticipants.length &&
            normalizedRecipients.every((r: string) =>
              convParticipants.includes(r.replace(/^1+/, ""))
            );
          return hasAll;
        });
        if (groupConversation) {
          logger.debug(
            "🔍 [useConversationRouter] Found existing group conversation:",
            { conversationId: groupConversation.id }
          );
          setActiveConversationId(groupConversation.id);
        } else {
          logger.debug(
            "🔍 [useConversationRouter] No existing group conversation for these recipients"
          );
          dispatch(textActions.setCurrentConversation(null));
          setActiveConversationId(undefined);
        }
        setSmsLookupStatus("idle");
        return;
      }

      // Single phone recipient: skip search if conversation already active (e.g. just created)
      if (currentConversation) {
        logger.debug(
          "🚫 [useConversationRouter] Conversation already active, skipping search:",
          {
            conversationId: currentConversation.id
          }
        );
        setSmsLookupStatus("done");
        return;
      }
      if (activeConversationId) {
        logger.debug(
          "🚫 [useConversationRouter] Active conversation ID exists, skipping search:",
          {
            activeConversationId
          }
        );
        setSmsLookupStatus("done");
        return;
      }

      const phoneRecipient = phoneRecipients[0];
      if (!phoneRecipient || !phoneRecipient.phoneNumber) {
        setSmsLookupStatus("idle");
        return;
      }

      setSmsLookupStatus("searching");

      logger.debug("🔍 [useConversationRouter] Phone recipients:", {
        count: phoneRecipients.length,
        recipients: phoneRecipients.map((r) => r.phoneNumber || r.name)
      });

      logger.debug(
        "Searching for existing SMS conversation with:",
        phoneRecipient.phoneNumber
      );

      try {
        const from = stripPhoneNumber(selectedDidNumber.number);
        const to = phoneRecipient.phoneNumber;

        const conversation = await getConversationsByParticipants(
          accessToken,
          from,
          to
        );

        if (conversation && conversation.id) {
          logger.debug("Found existing conversation:", conversation.id);
          setActiveConversationId(conversation.id);
        } else {
          logger.debug("No existing conversation found");
          setActiveConversationId(undefined);
        }
      } catch (error: any) {
        // 404 is expected for new conversations - don't log as error
        if (error?.code === 404 || error?.message?.includes("not found")) {
          logger.debug(
            "No existing conversation found (404 - this is normal for new numbers)"
          );
        } else {
          logger.error("Error searching for existing conversation:", error);
        }
        setActiveConversationId(undefined);
      } finally {
        setSmsLookupStatus("done");
      }
    };

    searchForExistingConversation();
  }, [
    dispatch,
    selectedRecipients,
    selectedDidNumber,
    accessToken,
    isSearchMode,
    chatType,
    currentConversation,
    activeConversationId,
    conversations
  ]);

  // Get display name for chat
  const getDisplayName = useCallback(
    (
      recipientNames: string,
      user: any,
      directory: any[],
      conversations: any[],
      currentConversation: any,
      /** Same resolution as Chat header (channels + currentChannel + direct fetch) */
      resolvedChannel?: GroupChannel | null
    ) => {
      if (chatType === "sendbird") {
        const sendbirdTitleFallback = [
          recipientNames?.trim(),
          typeof recipientName === "string" ? recipientName.trim() : ""
        ].find(Boolean);

        // Compose / loading: recipients selected (or route title) but channel URL not wired yet
        if (!activeChannelUrl) {
          return sendbirdTitleFallback || "";
        }

        const channel =
          resolvedChannel ||
          channels.find((ch) => ch.url === activeChannelUrl);
        if (channel) {
          const isDm = channel.customType?.includes("DM") || false;
          if (!isDm) {
            return (
              channel.name?.trim() ||
              sendbirdTitleFallback ||
              "Unknown"
            );
          }

          const otherMembers = (channel.members || []).filter(
            (member) => String(member.userId) !== String(user?.id)
          );

          if (otherMembers.length > 1) {
            const names = otherMembers
              .map((member) => {
                const contact = directory.find(
                  (c) => c.userId?.toString() === String(member.userId)
                );
                return (contact?.name?.trim() || member.nickname || "").trim();
              })
              .filter(Boolean);
            if (names.length === 0) {
              return sendbirdTitleFallback || "group";
            }
            if (names.length === 1) return names[0];
            if (names.length === 2) return `${names[0]} and ${names[1]}`;
            const rest = names.slice(0, -1);
            const last = names[names.length - 1];
            return `${rest.join(", ")} and ${last}`;
          }

          if (otherMembers.length === 1) {
            const otherMember = otherMembers[0];
            const contact = directory.find(
              (contact) => contact.userId?.toString() === String(otherMember.userId)
            );
            return (
              contact?.name?.trim() ||
              otherMember.nickname?.trim() ||
              sendbirdTitleFallback ||
              "Unknown"
            );
          }

          // Personal channel - messaging yourself
          if (otherMembers.length === 0) {
            const displayName = user?.extName || user?.email;
            if (displayName) {
              return displayName.trim();
            }

            const selfContact = directory.find(
              (contact) => contact.userId?.toString() === user?.id?.toString()
            );
            if (selfContact?.name) {
              return selfContact.name.trim();
            }

            return sendbirdTitleFallback || "yourself";
          }
        }
        return sendbirdTitleFallback || "Unknown";
      }

      if (chatType === "text") {
        // First check if we have recipient name passed from navigation.
        if (recipientName) {
          return recipientName;
        }

        // Prioritize currentConversation name if available
        if (
          currentConversation &&
          currentConversation.id === activeConversationId
        ) {
          const name = currentConversation.conversationName?.trim();
          if (name && name !== "undefined") {
            return name;
          }
        }

        // If we have a conversationId but no recipientNames, look up the conversation
        if (!recipientNames && activeConversationId) {
          const conversation = conversations.find(
            (c) => c.id === activeConversationId
          );
          if (conversation) {
            // Use conversationName if available and not the string "undefined"
            const name = conversation.conversationName?.trim();
            if (name && name !== "undefined") {
              return name;
            }
            // Otherwise, get all participants (excluding the sourceDID) and join them
            if (conversation.participants) {
              const participants = conversation.participants
                .split(",")
                .filter(
                  (p: string) =>
                    p !== conversation.sourceDID &&
                    p !== "undefined" &&
                    p.trim()
                );

              if (participants.length > 0) {
                // Look up contact names for all participants
                const participantNames = participants
                  .map((phoneNumber: string) => {
                    const contactInfo = findContactByPhoneNumber(
                      phoneNumber,
                      personalContacts || [],
                      companyContacts || [],
                      directory || [],
                      phoneContacts || []
                    );
                    // Return contact name if found, otherwise return formatted phone number
                    return contactInfo
                      ? contactInfo.name
                      : formatPhoneNumber(phoneNumber);
                  })
                  .filter((name) => name !== null && name !== "undefined");

                // Join all participant names/numbers
                if (participantNames.length > 0) {
                  return participantNames.join(", ");
                }
              }
            }
          }
        }
        return recipientNames || "Unknown";
      }

      return "";
    },
    [
      chatType,
      activeChannelUrl,
      activeConversationId,
      channels,
      recipientName,
      directory,
      personalContacts,
      companyContacts,
      phoneContacts
    ]
  );

  // Reset routing state
  const resetRouting = useCallback(() => {
    setActiveChannelUrl(undefined);
    setActiveConversationId(undefined);
  }, []);

  return {
    activeChannelUrl,
    activeConversationId,
    chatType,
    smsLookupStatus,
    setActiveChannelUrl,
    setActiveConversationId,
    getDisplayName,
    resetRouting
  };
};
