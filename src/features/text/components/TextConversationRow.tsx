import React from "react";
import { TouchableOpacity, View, StyleSheet } from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { Text } from "shared/components/Text.tsx";
import { TextConversation } from "shared/api/messaging/types.ts";
import {
  borderRadius,
  componentSize,
  fontSize,
  padding
} from "core/theme/theme.ts";
import { Avatar } from "shared/components/Avatar.tsx";
import { channelListRowStyles } from "features/chat/styles/component-styles.ts";
import { findContactByPhoneNumber } from "features/calling/utils/contact-lookup.ts";
import { useSelector } from "react-redux";
import { State } from "store/types.ts";

interface TextConversationRowProps {
  conversation: TextConversation;
  onPress: () => void;
  /** When true, show participants (phone numbers) only, ignore conversationName from backend */
  useParticipantsOnly?: boolean;
}

const formatPhoneNumber = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(
      6
    )}`;
  }
  if (cleaned.length === 11) {
    return `+${cleaned.slice(0, 1)} (${cleaned.slice(1, 4)}) ${cleaned.slice(
      4,
      7
    )}-${cleaned.slice(7)}`;
  }
  return phone;
};

export const TextConversationRow: React.FC<TextConversationRowProps> = ({
  conversation,
  onPress,
  useParticipantsOnly = false
}) => {
  const theme = useTheme();
  const { personalContacts, companyContacts, directory, phoneContacts } =
    useSelector((state: State) => state.directoryReducer);

  const displayName = useParticipantsOnly
    ? (
        conversation.participants
          ?.split(",")
          .map((p) => p.trim())
          .filter((p) => p && p !== conversation.sourceDID) ?? []
      )
        .map((phoneNumber) => {
          const contactInfo = findContactByPhoneNumber(
            phoneNumber,
            personalContacts || [],
            companyContacts || [],
            directory || [],
            phoneContacts || []
          );
          return contactInfo ? contactInfo.name : formatPhoneNumber(phoneNumber);
        })
        .join(", ") || "Unknown"
    : conversation.conversationName ||
      conversation.participants
        ?.split(",")
        .filter((p) => p !== conversation.sourceDID)
        .map(formatPhoneNumber)
        .join(", ") ||
      "Unknown";

  const unreadCount = conversation.unreadCount && conversation.unreadCount > 0;

  return (
    <TouchableOpacity
      style={[channelListRowStyles.containerStyle]}
      onPress={onPress}
    >
      {/* Avatar - Fixed width container for consistent alignment */}
      <View style={styles.avatarContainer}>
        <Avatar
          customIcon="#"
          size={componentSize.xs}
          borderRadius={borderRadius.sm}
        />
      </View>

      {/* Name */}
      <View style={styles.namesContainer}>
        <Text
          size={fontSize.md}
          weight={unreadCount ? "bold" : "medium"}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {displayName.length > 30
            ? `${displayName.slice(0, 30)}...`
            : displayName}
        </Text>
      </View>
      {unreadCount ? (
        <View
          style={[
            channelListRowStyles.badgeContainer,
            {
              backgroundColor: theme.colors["colors-border-border-error"],
              borderColor:
                theme.colors["color-colors-foreground-fg-error-primary"]
            }
          ]}
        >
          <Text
            size={fontSize.sm}
            weight="medium"
            color="colors-text-text-primary-on-brand"
          >
            {conversation.unreadCount && conversation.unreadCount > 9
              ? "9+"
              : conversation.unreadCount}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  avatarContainer: {
    width: componentSize.xs,
    height: componentSize.xs,
    alignItems: "center",
    justifyContent: "center"
  },
  namesContainer: {
    flex: 1,
    minWidth: 0,
    marginLeft: padding.lg,
    alignItems: "flex-start",
    justifyContent: "center"
  }
});
