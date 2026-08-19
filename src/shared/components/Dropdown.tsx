import React, { useState, useRef } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  StyleProp,
  ViewStyle,
  TextStyle,
  Pressable
} from "react-native";

// Hooks
import { useTheme } from "hooks/use-theme.ts";

// Components
import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";

export interface DropdownOption<T extends string = string> {
  label: string;
  value: T;
}

interface DropdownProps<T extends string = string> {
  options: DropdownOption<T>[];
  value?: T;
  onChange: (value: T) => void;
  placeholder?: string;
  containerStyle?: StyleProp<ViewStyle>;
  dropdownStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  disabled?: boolean;
  maxHeight?: number;
}

export const Dropdown = <T extends string = string>({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  containerStyle,
  dropdownStyle,
  textStyle,
  disabled = false,
  maxHeight = 300
}: DropdownProps<T>) => {
  // Hooks
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<View>(null);
  const [position, setPosition] = useState({ x: 0, y: 0, width: 0, height: 0 });

  // Get the selected option label
  const selectedOption = options.find((option) => option.value === value);
  const displayText = selectedOption ? selectedOption.label : placeholder;

  // Toggle dropdown visibility
  const toggleDropdown = () => {
    if (disabled) return;

    if (!isOpen) {
      // Measure the position of the dropdown container
      dropdownRef.current?.measure((x, y, width, height, pageX, pageY) => {
        setPosition({
          x: pageX,
          y: pageY,
          width,
          height
        });
        setIsOpen(true);
      });
    } else {
      setIsOpen(false);
    }
  };

  // Handle selection of an option
  const handleSelect = (option: DropdownOption<T>) => {
    onChange(option.value);
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  const handleOverlayPress = () => {
    setIsOpen(false);
  };

  return (
    <View style={[styles.container, containerStyle]} ref={dropdownRef}>
      <TouchableOpacity
        style={[
          styles.trigger,
          {
            borderColor: theme.colors["colors-border-border-primary"]
          },
          disabled && {
            opacity: 0.6,
            backgroundColor: theme.colors["color-colors-background-bg-disabled"]
          },
          dropdownStyle
        ]}
        onPress={toggleDropdown}
        activeOpacity={0.7}
        disabled={disabled}
      >
        <Text
          weight="medium"
          size={fontSize.md}
          color={
            selectedOption
              ? "color-colors-text-text-primary"
              : "colors-text-text-placeholder"
          }
          align="left"
          style={textStyle}
        >
          {displayText}
        </Text>
        <View style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }}>
          <Icon
            name="chevron-down"
            size={20}
            style={{
              color: theme.colors["color-colors-text-text-secondary"]
            }}
          />
        </View>
      </TouchableOpacity>

      <Modal
        visible={isOpen}
        transparent
        animationType="none"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={handleOverlayPress}>
          <View
            style={[
              styles.dropdown,
              {
                top: position.y + position.height,
                left: position.x,
                width: position.width,
                maxHeight,
                backgroundColor:
                  theme.colors["color-colors-background-bg-primary"],
                borderColor: theme.colors["colors-border-border-primary"]
              }
            ]}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {options.map((option, index) => (
                <TouchableOpacity
                  key={`${option.value}-${index}`}
                  style={[styles.option]}
                  onPress={() => handleSelect(option)}
                >
                  <Text
                    weight={"medium"}
                    size={fontSize.md}
                    color={"color-colors-text-text-primary"}
                    align="left"
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "relative",
    zIndex: 1
  },
  trigger: {
    padding: padding.lg,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  overlay: {
    flex: 1,
    backgroundColor: "transparent"
  },
  dropdown: {
    position: "absolute",
    borderWidth: 1,
    borderRadius: borderRadius.md,
    overflow: "hidden",
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    zIndex: 1000
  },
  option: {
    paddingVertical: padding.lg,
    paddingHorizontal: padding.xl
  }
});

export default Dropdown;
