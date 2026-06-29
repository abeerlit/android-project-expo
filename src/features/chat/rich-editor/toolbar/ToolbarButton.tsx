import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { padding, borderRadius } from "core/theme/theme.ts";
import Icon from "shared/components/Icon.tsx";
import { ToolbarButtonProps } from "../types.ts";

export const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  onPress,
  isActive = false,
  iconName,
  iconSize = 24,
  style
}) => {
  const theme = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.toolbarButton,
        {
          backgroundColor: isActive
            ? theme.colors["colors-background-bg-secondary"]
            : "transparent"
        },
        style
      ]}
    >
      <Icon
        name={iconName}
        size={iconSize}
        color={theme.colors["color-colors-text-text-primary"]}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  toolbarButton: {
    paddingHorizontal: padding.sm,
    paddingVertical: padding.xs,
    borderRadius: borderRadius.sm,
    marginRight: padding.xxs
  }
});
