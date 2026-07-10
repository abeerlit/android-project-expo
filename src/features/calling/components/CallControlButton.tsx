import React from "react";
import { StyleSheet } from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { padding, borderRadius } from "core/theme/theme.ts";
import { Button } from "shared/components/Button.tsx";
import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { Platform } from "react-native";

interface CallControlButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
  isActive?: boolean;
  disabled?: boolean;
}

export function CallControlButton({
  icon,
  label,
  onPress,
  isActive = false,
  disabled = false
}: CallControlButtonProps) {
  const theme = useTheme();

  const onPressWrapped = () => {
    if (
      Platform.OS === "android" &&
      (label === "Mute" || label === "Hold" || label === "Speaker")
    ) {
      console.warn(
        `[CallControlButton] ${label} pressed disabled=${disabled} ts=${new Date().toISOString()}`
      );
    }
    onPress();
  };

  return (
    <Button
      onPress={onPressWrapped}
      disabled={disabled}
      containerStyle={[
        styles.button,
        {
          backgroundColor: isActive
            ? theme.colors["colors-background-bg-error-secondary"]
            : theme.colors["colors-background-bg-secondary"],
          borderRadius: borderRadius.full
        }
      ]}
    >
      <Icon
        name={icon}
        color={
          isActive
            ? theme.colors["color-colors-foreground-fg-error-primary"]
            : theme.colors["color-colors-text-text-tertiary"]
        }
        size={24}
        type="outline"
      />
      <WhiteSpace height={padding.xs} />
      <Text
        color={
          isActive
            ? "color-colors-foreground-fg-error-primary"
            : "color-colors-text-text-tertiary"
        }
        size={10}
        weight="semiBold"
        align="center"
      >
        {label}
      </Text>
    </Button>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 70,
    height: 70,
    paddingHorizontal: 0
  }
});
