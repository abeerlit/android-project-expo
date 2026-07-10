// Hook for recipient selection and management
import { useState, useCallback, useMemo } from "react";
import { useSelector } from "react-redux";
import { toast } from "@backpackapp-io/react-native-toast";
import { State } from "store/types.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { NewMessageItem, MessagingType } from "./types.ts";
import { Logger } from "shared/utils/Logger.ts";
import {
  stripPhoneNumber,
  formatPhoneNumber,
  isValidPhoneNumber
} from "shared/utils/formatters.ts";

const logger = new Logger("useRecipientManagement");

interface UseRecipientManagementProps {
  onClearSearch: () => void;
  onNavigateToChannel?: (channelUrl: string) => void;
  onNavigateToConversation?: (conversationId: number) => void;
  createUserItem: (contact: any) => NewMessageItem;
}

export const useRecipientManagement = ({
  onClearSearch,
  onNavigateToChannel,
  onNavigateToConversation,
  createUserItem
}: UseRecipientManagementProps) => {
  const [selectedRecipients, setSelectedRecipients] = useState<
    NewMessageItem[]
  >([]);

  const { user } = useSelector((state: State) => state.userReducer);
  const { companyContacts } = useSelector(
    (state: State) => state.directoryReducer
  );
  const { filteredDMChannels, sendbirdInstance } = useSendbirdContext();

  // Business contacts with userId
  const businessContacts = useMemo(
    () => companyContacts.filter((contact) => contact.userId),
    [companyContacts]
  );

  // Selected user IDs
  const selectedUserIds = useMemo(
    () => new Set(selectedRecipients.map((r) => r.userId).filter(Boolean)),
    [selectedRecipients]
  );

  // Determine messaging type
  const selectedMessagingType = useMemo((): MessagingType => {
    if (selectedRecipients.length === 0) return null;

    const hasTextRecipient = selectedRecipients.some(
      (r) =>
        r.type === "phone" ||
        r.type === "personal" ||
        r.type === "phone-contact" ||
        r.type === "conversation"
    );

    const hasSendbirdRecipient = selectedRecipients.some(
      (r) => r.type === "user" || r.type === "dm" || r.type === "channel"
    );

    if (hasTextRecipient) return "text";
    if (hasSendbirdRecipient) return "sendbird";
    return null;
  }, [selectedRecipients]);

  // Recipient names for display: "Name1 and Name2" or "Name1, Name2 and Name3"
  const recipientNames = useMemo(() => {
    const names = selectedRecipients
      .map((r) => r.name?.trim() ?? "")
      .filter(Boolean);
    if (names.length === 0) return "";
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    const rest = names.slice(0, -1);
    const last = names[names.length - 1];
    return `${rest.join(", ")} and ${last}`;
  }, [selectedRecipients]);

  // Handle recipient selection
  const handleRecipientSelect = useCallback(
    async (item: NewMessageItem) => {
      const currentUserId = user?.id?.toString();
      const isSelf = item.userId === currentUserId;
      logger.debug("Selecting recipient:", { isSelf });

      // Handle channel selection - navigate directly
      if (item.type === "channel" && item.channelUrl) {
        onNavigateToChannel?.(item.channelUrl);
        return;
      }

      // Handle conversation selection
      if (item.type === "conversation") {
        // If conversation name is a phone number, convert it to a phone recipient
        // This handles cases where conversations are found by phone number search
        const nameDigits = item.name?.replace(/\D/g, "") || "";
        if (isValidPhoneNumber(nameDigits)) {
          const normalizedPhone = stripPhoneNumber(nameDigits);
          if (normalizedPhone.length === 10) {
            logger.warn(
              "📱 [useRecipientManagement] Converting conversation to phone recipient:",
              {
                conversationName: item.name,
                normalizedPhone
              }
            );
            // Create a phone recipient from the conversation
            const phoneItem: NewMessageItem = {
              name: formatPhoneNumber(normalizedPhone),
              phoneNumber: normalizedPhone,
              type: "phone"
            };

            // ✅ FIX: Add to array instead of replacing (for group SMS)
            setSelectedRecipients((prev) => {
              // Check if this phone number is already selected
              const alreadySelected = prev.some(
                (r) => r.phoneNumber === normalizedPhone
              );
              if (alreadySelected) return prev;
              return [...prev, phoneItem];
            });
            onClearSearch();
            return;
          }
        }

        // Otherwise, navigate to the conversation
        if (item.conversationId) {
          onNavigateToConversation?.(item.conversationId);
          return;
        }
      }

      // Check for incompatible selection types
      const isTextType =
        item.type === "phone" ||
        item.type === "personal" ||
        item.type === "phone-contact";
      const isSendbirdType = item.type === "user" || item.type === "dm";

      // Prevent mixing text and sendbird recipients
      // BUT: Allow phone numbers to be added even if Sendbird recipients exist
      // (user can send SMS to external numbers)
      if (selectedMessagingType === "text" && isSendbirdType) {
        logger.warn("Cannot mix text and Sendbird recipients");
        toast.error("Cannot mix SMS and chat recipients");
        return;
      }

      // Allow phone numbers to be added even when Sendbird recipients exist
      // This enables sending SMS to external numbers
      if (selectedMessagingType === "sendbird" && isTextType) {
        // Clear Sendbird recipients and switch to text mode for phone numbers
        logger.warn(
          "🚫 [useRecipientManagement] Switching from Sendbird to text mode - CLEARING recipients"
        );
        setSelectedRecipients([item]);
        onClearSearch();
        return;
      }

      // Handle DM selection - expand to individual users
      if (item.type === "dm") {
        const dmChannel = filteredDMChannels.find(
          (dm) => dm.url === item.channelUrl
        );

        if (dmChannel?.personal) {
          if (item.channelUrl) {
            onNavigateToChannel?.(item.channelUrl);
          }
          return;
        }

        let memberUserIds = dmChannel?.memberUserIds || [];

        if (memberUserIds.length === 0 && item.channelUrl && sendbirdInstance) {
          try {
            const channel = await sendbirdInstance.groupChannel.getChannel(
              item.channelUrl
            );
            memberUserIds = channel.members.map((member) => member.userId);
          } catch (error) {
            logger.error("Error fetching channel from Sendbird:", error);
            if (item.channelUrl) {
              onNavigateToChannel?.(item.channelUrl);
            }
            return;
          }
        }

        if (memberUserIds.length > 0) {
          const dmUsers = memberUserIds.map((userId) => {
            const contact = businessContacts.find(
              (c) => c.userId?.toString() === userId
            );
            return createUserItem(
              contact || { name: `User ${userId}`, userId }
            );
          });

          if (dmUsers.length === 0) {
            if (item.channelUrl) {
              onNavigateToChannel?.(item.channelUrl);
            }
            return;
          }

          setSelectedRecipients((prev) => {
            const existingUserIds = new Set(prev.map((r) => r.userId));
            const newUsers = dmUsers.filter(
              (user) => !existingUserIds.has(user.userId)
            );
            return [...prev, ...newUsers];
          });
        } else {
          if (item.channelUrl) {
            onNavigateToChannel?.(item.channelUrl);
          }
        }
      } else if (item.type === "user") {
        // Company contact (Sendbird user)
        setSelectedRecipients((prev) => {
          const itemUserId = item.userId || "";
          if (selectedUserIds.has(itemUserId)) {
            return prev;
          }
          const newRecipients = [...prev, item];
          return newRecipients;
        });
      } else if (
        item.type === "phone" ||
        item.type === "personal" ||
        item.type === "phone-contact"
      ) {
        // Normalize the phone number to ensure it's 10 digits (no leading 1)
        // This handles both "5551234567" and "15551234567" - both become "5551234567"
        let phoneToNormalize = item.phoneNumber || "";

        // If no phoneNumber but name contains digits, try to extract from name
        if (!phoneToNormalize && item.name) {
          const nameDigits = item.name.replace(/\D/g, "");
          if (nameDigits.length >= 10) {
            phoneToNormalize = nameDigits;
          }
        }

        const normalizedPhone = phoneToNormalize
          ? stripPhoneNumber(phoneToNormalize)
          : "";

        // Only add if we have a valid normalized phone number (exactly 10 digits)
        if (normalizedPhone.length === 10) {
          // Create a normalized phone item - always use "phone" type for consistency
          const normalizedItem: NewMessageItem = {
            ...item,
            phoneNumber: normalizedPhone,
            name: formatPhoneNumber(normalizedPhone), // Ensure name is also normalized
            type: "phone" // Always use "phone" type for consistency
          };

          // ✅ FIX: Add to array instead of replacing (enables group SMS)
          setSelectedRecipients((prev) => {
            // Check if this phone number is already selected
            const alreadySelected = prev.some(
              (r) => r.phoneNumber === normalizedPhone
            );
            if (alreadySelected) return prev;
            return [...prev, normalizedItem];
          });
          // For phone numbers, don't navigate to conversation (it doesn't exist yet)
          // Just clear search and let the chat screen show the text input
          // The conversation will be created when the first message is sent
        } else {
          logger.warn("Invalid phone number, not adding:", {
            originalPhone: item.phoneNumber,
            normalizedPhone,
            length: normalizedPhone.length
          });
        }
      }

      onClearSearch();
    },
    [
      selectedMessagingType,
      filteredDMChannels,
      user?.id,
      businessContacts,
      selectedUserIds,
      createUserItem,
      onClearSearch,
      onNavigateToChannel,
      onNavigateToConversation,
      sendbirdInstance,
      logger
    ]
  );

  // Handle removing a recipient
  const handleRemoveRecipient = useCallback((index: number) => {
    setSelectedRecipients((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Handle backspace key
  const handleBackspace = useCallback(
    (recipientInput: string) => {
      if (!recipientInput && selectedRecipients.length > 0) {
        setSelectedRecipients((prev) => prev.slice(0, -1));
      }
    },
    [selectedRecipients.length]
  );

  // Clear all recipients
  const clearRecipients = useCallback(() => {
    setSelectedRecipients([]);
  }, []);

  return {
    selectedRecipients,
    selectedMessagingType,
    selectedUserIds,
    recipientNames,
    handleRecipientSelect,
    handleRemoveRecipient,
    handleBackspace,
    clearRecipients
  };
};
