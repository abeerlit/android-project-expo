// React Imports
import React from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback
} from "react-native";
import { useSelector } from "react-redux";
import { useTheme } from "hooks/use-theme.ts";
import { useDrawer } from "core/drawer/DrawerContext.tsx";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";
import { ReactionsDrawer } from "./drawers/ReactionsDrawer.tsx";
import { AddReactionDrawer } from "./drawers/AddReactionDrawer.tsx";

// Utils & Constants
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";
import { State } from "store/types.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { ChatMessage } from "features/chat/types.ts";

// Types
interface MessageReactionsProps {
  message: ChatMessage;
  reactions: any[];
  editor: any;
}

export const MessageReactions: React.FC<MessageReactionsProps> = ({
  message,
  reactions,
  editor
}) => {
  const theme = useTheme();
  const { user } = useSelector(({ userReducer }: State) => userReducer);
  const { reactionEvent } = useSendbirdContext();
  const { openDrawer } = useDrawer();

  // Don't render if no reactions
  if (!reactions || reactions.length === 0) {
    return null;
  }

  const handleReactionLongPress = () => {
    openDrawer(<ReactionsDrawer message={message} />, 0.7);
  };

  const handleAddReactionPress = () => {
    editor?.blur();
    const handleEmojiReaction = async (emoji: string) => {
      if (user?.id) {
        await reactionEvent(message, emoji, user.id.toString());
      }
    };

    openDrawer(<AddReactionDrawer onEmojiSelect={handleEmojiReaction} />, 0.9);
  };

  const renderReaction = (reaction: any) => {
    const hasCurrentUserReacted = reaction._hasCurrentUserReacted;
    const count = reaction._count;
    const emoji = reaction.key;

    // Determine styling based on user reaction
    const containerStyle = [
      styles.reactionContainer,
      {
        backgroundColor: hasCurrentUserReacted
          ? theme.colors["component-colors-utility-brand-utility-brand-400"]
          : theme.colors["color-colors-background-bg-secondary"],
        borderColor: hasCurrentUserReacted
          ? theme.colors[
              "color-component-colors-utility-brand-utility-brand-200"
            ]
          : theme.colors["colors-border-border-primary"]
      }
    ];

    const textColor = hasCurrentUserReacted
      ? "colors-text-text-primary-on-brand"
      : "color-colors-text-text-secondary";

    return (
      <TouchableWithoutFeedback
        key={emoji}
        onPress={() => {
          if (user?.id) {
            reactionEvent(message, emoji, user.id.toString());
          }
        }}
        onLongPress={handleReactionLongPress}
      >
        <View style={containerStyle}>
          <Text size={fontSize.sm} weight="medium">
            {emoji}
          </Text>
          {count > 1 && (
            <Text
              size={fontSize.sm}
              weight="medium"
              color={textColor}
              style={styles.countText}
            >
              {count}
            </Text>
          )}
        </View>
      </TouchableWithoutFeedback>
    );
  };

  const renderAddReactionButton = () => (
    <TouchableOpacity
      style={[
        styles.reactionContainer,
        {
          backgroundColor: theme.colors["color-colors-background-bg-secondary"],
          borderColor: theme.colors["colors-border-border-primary"]
        }
      ]}
      onPress={handleAddReactionPress}
      activeOpacity={0.7}
    >
      <Icon
        name="face-smile"
        size={16}
        color={theme.colors["color-colors-text-text-secondary"]}
      />
    </TouchableOpacity>
  );

  return (
    <View style={styles.reactionsRow}>
      {reactions.map(renderReaction)}
      {renderAddReactionButton()}
    </View>
  );
};

const styles = StyleSheet.create({
  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: padding.xs,
    marginTop: padding.xs
  },
  reactionContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: padding.md,
    paddingVertical: padding.xs,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    gap: padding.xs
  },
  countText: {
    marginLeft: 0
  }
});
