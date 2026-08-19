// React Imports
import React, { useState, useMemo } from "react";
import { View, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { useSelector } from "react-redux";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { UserAvatar } from "features/contacts/components/UserAvatar.tsx";

// Utils & Constants
import { fontSize, padding, borderRadius } from "core/theme/theme.ts";
import { ChatMessage } from "features/chat/types.ts";
import { State } from "store/types.ts";

// Types
interface ReactionOptionsDrawerProps {
  message: ChatMessage;
}

interface ReactionData {
  key: string;
  _count: number;
  _hasCurrentUserReacted: boolean;
  _sampledUserIds: string[];
  _sampledUserInfoList: any[];
}

interface UserInfo {
  userId: string;
  name: string;
  avatarPath: string | null;
}

export const ReactionsDrawer: React.FC<ReactionOptionsDrawerProps> = ({
  message
}) => {
  const theme = useTheme();

  // Get directory for user info
  const { directory } = useSelector(
    ({ directoryReducer }: State) => directoryReducer
  );

  // Process reactions data
  const reactions = useMemo(() => {
    if (!message.reactions || message.reactions.length === 0) return [];
    return message.reactions as unknown as ReactionData[];
  }, [message.reactions]);
  const [selectedReaction, setSelectedReaction] = useState<string | null>(
    reactions[0].key
  );

  // Get all unique users who reacted
  const allReactedUsers = useMemo(() => {
    const userMap = new Map<string, UserInfo>();

    reactions.forEach((reaction) => {
      reaction._sampledUserIds.forEach((userId) => {
        if (!userMap.has(userId)) {
          // Find user in directory
          const directorUser = directory.find(
            (contact) =>
              contact.userId?.toString() === userId &&
              contact.type === "company"
          );

          userMap.set(userId, {
            userId,
            name: directorUser?.name || `User ${userId}`,
            avatarPath: directorUser?.avatarThumbnailPath || null
          });
        }
      });
    });

    return Array.from(userMap.values());
  }, [reactions, directory]);

  // Get users for selected reaction
  const selectedReactionUsers = useMemo(() => {
    if (!selectedReaction) return allReactedUsers;

    const reaction = reactions.find((r) => r.key === selectedReaction);
    if (!reaction) return [];

    return reaction._sampledUserIds.map((userId) => {
      const directorUser = directory.find(
        (contact) =>
          contact.userId?.toString() === userId && contact.type === "company"
      );

      return {
        userId,
        name: directorUser?.name || `User ${userId}`,
        avatarPath: directorUser?.avatarThumbnailPath || null
      };
    });
  }, [selectedReaction, reactions, directory]);

  const renderReactionTab = (reaction: ReactionData) => {
    const isSelected = selectedReaction === reaction.key;

    return (
      <TouchableOpacity
        key={reaction.key}
        style={[
          styles.reactionTab,
          {
            backgroundColor: isSelected
              ? theme.colors["color-colors-background-bg-brand-primary-alt"]
              : theme.colors["color-colors-background-bg-secondary"],
            borderColor: isSelected
              ? theme.colors[
                  "color-component-colors-utility-brand-utility-brand-200"
                ]
              : theme.colors["colors-border-border-primary"]
          }
        ]}
        onPress={() => setSelectedReaction(reaction.key)}
      >
        <Text size={fontSize.md} weight="medium">
          {reaction.key}
        </Text>
        <Text
          size={fontSize.sm}
          weight="medium"
          color={
            isSelected
              ? "color-colors-text-text-brand-secondary"
              : "color-colors-text-text-secondary"
          }
        >
          {reaction._count}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderUserRow = (user: UserInfo) => {
    return (
      <View key={user.userId} style={styles.userRow}>
        <UserAvatar src={user.avatarPath} name={user.name} size={32} />
        <Text
          size={fontSize.sm}
          weight="medium"
          color="color-colors-text-text-primary"
          align={"left"}
        >
          {user.name}
        </Text>
      </View>
    );
  };

  if (!reactions || reactions.length === 0) {
    return (
      <View style={styles.container}>
        <Text
          size={fontSize.md}
          color="color-colors-text-text-secondary"
          style={styles.emptyText}
        >
          No reactions yet
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text
          size={fontSize.lg}
          weight="semiBold"
          color="color-colors-text-text-primary"
        >
          Reactions
        </Text>
      </View>

      {/* Divider */}
      <View
        style={[
          styles.divider,
          {
            borderColor: theme.colors["color-colors-border-border-secondary"]
          }
        ]}
      />

      {/* Reaction Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsContainer}
        contentContainerStyle={styles.tabsContent}
      >
        {reactions.map(renderReactionTab)}
      </ScrollView>

      {/* User List */}
      <ScrollView style={styles.usersList}>
        {selectedReactionUsers.map(renderUserRow)}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: padding["2xl"]
  },
  header: {
    paddingTop: padding.sm,
    paddingBottom: padding.lg
  },
  divider: {
    borderTopWidth: 0.5,
    marginBottom: padding.lg
  },
  tabsContainer: {
    maxHeight: 40,
    marginBottom: padding.lg
  },
  tabsContent: {
    paddingRight: padding.md
  },
  reactionTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: padding.md,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    marginRight: padding.sm,
    gap: padding.xs,
    minWidth: 60,
    justifyContent: "center"
  },
  usersList: {
    flex: 1
  },
  userRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingVertical: padding.md,
    gap: padding.md
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: padding["3xl"]
  }
});
