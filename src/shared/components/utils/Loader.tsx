import React from "react";
import { ActivityIndicator, StyleProp, ViewStyle } from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { Theme } from "core/theme/theme.ts";

interface Props {
  size?: "small" | "large" | /* Android */ number;
  style?: StyleProp<ViewStyle>;
  color?: keyof Theme["colors"];
}

export function Loader({ size, style, color = "primary" }: Props) {
  const theme = useTheme();
  return (
    <ActivityIndicator style={style} size={size} color={theme.colors[color]} />
  );
}
