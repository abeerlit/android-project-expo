// React Imports
import React, { useCallback } from "react";
import { useTheme } from "hooks/use-theme.ts";
import { fontSize, padding } from "core/theme/theme.ts";
import { CallGroup } from "shared/api/call-groups/types.ts";

// Component Imports
import { StyleSheet, View } from "react-native";
import { Pressable } from "react-native";
import { Logger } from "shared/utils/Logger.ts";
import { Text } from "shared/components/Text.tsx";
import { inboxStyles } from "features/inbox/styles/inbox-styles.ts";
import { UserAvatar } from "features/contacts/components/UserAvatar.tsx";

type GroupRowProps = {
  item: CallGroup;
  handlePress?: (item: CallGroup) => void;
};

function GroupRowComponent({ item }: GroupRowProps) {
  // Constants
  const logger = new Logger("GroupRow");

  // Hooks
  const theme = useTheme();

  const handlePress = useCallback(() => {
    logger.debug("Pressed: ", item);
  }, [item, logger]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        inboxStyles.pressableStyle,
        {
          borderColor: theme.colors["color-colors-border-border-secondary"],
          backgroundColor: pressed
            ? theme.colors["color-colors-background-bg-primary-hover"]
            : "transparent"
        }
      ]}
    >
      <View style={styles.container}>
        {/* Avatar / Name */}
        <View style={styles.avatarContainer}>
          <UserAvatar src={null} name={item.name} />
          <Text
            size={fontSize.sm}
            style={{
              color: theme.colors["color-colors-text-text-primary"]
            }}
            weight={"medium"}
          >
            {item.name}
          </Text>
        </View>

        {/* Number */}
        <View style={styles.nameContainer}>
          <Text color={"colors-text-text-placeholder"} size={fontSize.sm}>
            {item.number}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "space-between"
  },
  avatarContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: padding.lg
  },
  nameContainer: { flexDirection: "row", gap: padding.xs }
});

export const GroupRow = React.memo(GroupRowComponent);
