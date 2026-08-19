import { View, ViewStyle } from "react-native";
import React from "react";
import CheckBox from "@react-native-community/checkbox";
import { useTheme } from "hooks/use-theme.ts";

interface Params {
  value: boolean;
  onValueChange?: (value: boolean) => void;
  style?: ViewStyle;
  height?: number;
  lineWidth?: number;
  disabled?: boolean;
}

export default function Checkbox({
  value = false,
  onValueChange = () => {},
  style,
  height = 20,
  lineWidth = 0.75,
  disabled
}: Params) {
  const theme = useTheme();

  return (
    <View>
      <CheckBox
        hitSlop={height * 2}
        boxType={"square"}
        tintColor={theme.colors.switchOffColor}
        onFillColor={"#fff"}
        onTintColor={theme.colors.switchOnColor}
        tintColors={{
          true: theme.colors.switchOnColor,
          false: theme.colors.switchOffColor
        }}
        onCheckColor={theme.colors.switchOnColor}
        lineWidth={lineWidth}
        style={[{ height: height, width: height }, style]}
        value={value || false}
        onValueChange={onValueChange}
        disabled={disabled}
      />
    </View>
  );
}
