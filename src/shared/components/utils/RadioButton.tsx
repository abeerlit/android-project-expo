import React from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StyleProp,
  ViewStyle
} from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { Text } from "shared/components/Text.tsx";
import { fontSize, padding } from "core/theme/theme.ts";

interface RadioButtonProps {
  label: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
  labelStyle?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  size?: number;
}

const RadioButton: React.FC<RadioButtonProps> = ({
  label,
  selected,
  onSelect,
  labelStyle,
  containerStyle,
  size = 20
}) => {
  const theme = useTheme();

  const innerSize = size / 2;

  return (
    <TouchableOpacity
      style={[styles.container, containerStyle]}
      onPress={onSelect}
    >
      <View
        style={[
          styles.radioOuter,
          {
            borderColor: theme.colors["colors-border-border-primary"],
            width: size,
            height: size,
            borderRadius: size / 2
          }
        ]}
      >
        {selected && (
          <View
            style={[
              styles.radioInner,
              {
                backgroundColor:
                  theme.colors["colors-background-bg-brand-solid"],
                width: innerSize,
                height: innerSize,
                borderRadius: innerSize / 2
              }
            ]}
          />
        )}
      </View>
      <View style={[styles.labelContainer, labelStyle]}>
        {typeof label === "string" ? (
          <Text
            weight="regular"
            size={fontSize.sm}
            color="primary"
            align="left"
          >
            {label}
          </Text>
        ) : (
          label
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center"
  },
  radioOuter: {
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center"
  },
  radioInner: {
    // Size is set dynamically based on props
  },
  labelContainer: {
    marginLeft: padding.lg
  }
});

export default RadioButton;
