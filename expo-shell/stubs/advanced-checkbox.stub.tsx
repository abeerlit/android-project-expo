import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

type Props = {
  value?: boolean;
  checked?: boolean;
  onValueChange?: (v: boolean | string) => void;
  size?: number;
  containerStyle?: object;
  checkedColor?: string;
  uncheckedColor?: string;
  animationType?: string;
  disabled?: boolean;
};

/** Fallback if Metro still resolves the stub — matches named `AdvancedCheckbox` import. */
export function AdvancedCheckbox({
  value,
  checked,
  onValueChange,
  size = 24,
  containerStyle,
  checkedColor = "#007AFF",
  uncheckedColor = "#ccc",
  disabled = false
}: Props) {
  const isOn = checked ?? value ?? false;
  return (
    <Pressable
      disabled={disabled}
      onPress={() => onValueChange?.(!isOn)}
      style={[styles.box, { width: size, height: size, borderColor: uncheckedColor }, containerStyle]}
    >
      {isOn ? (
        <View
          style={[
            styles.fill,
            { backgroundColor: checkedColor, width: size * 0.55, height: size * 0.55 }
          ]}
        />
      ) : null}
    </Pressable>
  );
}

export default AdvancedCheckbox;

const styles = StyleSheet.create({
  box: {
    borderWidth: 2,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center"
  },
  fill: {
    borderRadius: 2
  }
});
