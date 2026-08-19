import React, { useState, useRef } from "react";
import {
  StyleProp,
  StyleSheet,
  TextInput,
  View,
  ViewStyle,
  TextInputProps,
  TouchableOpacity,
  Pressable,
  Keyboard
} from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import Icon from "shared/components/Icon.tsx";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";
import { Text } from "shared/components/Text.tsx";

interface SearchBarProps extends Omit<TextInputProps, "placeholderTextColor"> {
  containerStyle?: StyleProp<ViewStyle>;
  iconSize?: number;
  iconColor?: string;
  borderColor?: string;
  backgroundColor?: string;
  cancelTextColor?: string;
  onFocusChange?: (isFocused: boolean) => void;
  onCancel?: () => void; // <-- added
}

export function SearchBar({
  containerStyle,
  style,
  placeholder = "Search",
  iconSize = 20,
  iconColor,
  borderColor,
  backgroundColor,
  cancelTextColor,
  onFocusChange,
  onCancel,
  onChangeText,
  ...props
}: SearchBarProps) {
  const theme = useTheme();

  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleFocus = () => {
    setIsFocused(true);
    onFocusChange?.(true);
  };

  const handleCancel = () => {
    onCancel?.();
    setIsFocused(false);
    onFocusChange?.(false);
    Keyboard.dismiss();
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <Pressable
        style={[
          styles.searchBarContainer,
          {
            borderColor: borderColor ?? theme.colors["colors-border-border-primary"],
            backgroundColor: backgroundColor ?? "transparent"
          }
        ]}
        onPress={() => inputRef.current?.focus()}
      >
        <Icon
          name="search-lg"
          size={iconSize}
          color={iconColor || theme.colors["colors-text-text-placeholder"]}
        />
        <TextInput
          ref={inputRef}
          style={[
            {
              color: theme.colors["color-colors-text-text-primary"],
              flex: 1
            },
            style
          ]}
          placeholder={placeholder}
          onChangeText={onChangeText}
          hitSlop={5}
          placeholderTextColor={theme.colors["colors-text-text-placeholder"]}
          onFocus={handleFocus}
          {...props}
        />
      </Pressable>
      {isFocused && (
        <TouchableOpacity onPress={handleCancel} hitSlop={10}>
          <Text
            size={fontSize.sm}
            weight="semiBold"
            style={cancelTextColor ? { color: cancelTextColor } : undefined}
          >
            Cancel
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: padding.lg
  },
  searchBarContainer: {
    flex: 1,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: padding.lg,
    gap: padding.xl
  }
});

export default SearchBar;
