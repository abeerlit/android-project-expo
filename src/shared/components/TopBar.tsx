// React Imports
import React from "react";
import {
  StyleSheet,
  View,
  TouchableOpacity,
  StyleProp,
  ViewStyle
} from "react-native";

// Hooks
import { useTheme } from "hooks/use-theme.ts";

// Navigation
import { Routes } from "core/navigation/types/types.ts";
import { navigate } from "core/navigation/utils/Ref.ts";

// Components
import { Text } from "shared/components/Text.tsx";
import { Avatar } from "shared/components/Avatar.tsx";
import Icon from "shared/components/Icon.tsx";
import { borderRadius, padding } from "core/theme/theme.ts";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { MainDrawer } from "../../features/new/MainDrawer";

interface TopBarProps {
  title: string;
  avatarSource?: string;
  avatarName?: string;
  avatarStatus?: "online" | "offline" | "away" | "busy" | "none";
  style?: StyleProp<ViewStyle>;
}

export const TopBar = ({
  title,
  avatarSource,
  avatarName,
  avatarStatus,
  style
}: TopBarProps) => {
  // Hooks
  const theme = useTheme();
  const { openDrawer } = useDrawer();

  // Methods
  const handleAvatarPress = () => {
    navigate(Routes.Preferences);
  };

  const handlePlusPress = () => {
    openDrawer(<MainDrawer />);
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors["color-colors-background-bg-primary"]
        },
        style
      ]}
    >
      <TouchableOpacity
        style={[
          styles.iconButton,
          {
            borderColor: theme.colors["colors-border-border-primary"],
            borderRadius: borderRadius.md
          }
        ]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        onPress={handlePlusPress}
      >
        <Icon
          name="plus"
          size={20}
          type="outline"
          color={theme.colors["color-colors-text-text-primary"]}
        />
      </TouchableOpacity>

      <Text
        weight="semiBold"
        size={20}
        align="center"
        style={styles.title}
        color="primary"
      >
        {title}
      </Text>

      <TouchableOpacity
        onPress={handleAvatarPress}
        style={styles.avatarContainer}
      >
        <Avatar
          source={avatarSource}
          name={avatarName}
          size={40}
          status={avatarStatus}
          borderRadius={borderRadius.md}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: padding.xl,
    paddingVertical: 12,
    width: "100%"
  },
  iconButton: {
    width: 40,
    height: 40,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  title: {
    flex: 1,
    textAlign: "center",
    paddingHorizontal: 16
  },
  avatarContainer: {
    width: 40,
    height: 40
  }
});
