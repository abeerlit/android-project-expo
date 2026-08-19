import React from "react";
import {
  Text as NativeText,
  TextStyle,
  StyleProp,
  TextProps as NativeProps
} from "react-native";
import { Theme } from "core/theme/theme.ts";
import { useTheme } from "hooks/use-theme.ts";

export interface TextProps<T extends keyof Theme["fonts"]> extends NativeProps {
  style?: StyleProp<TextStyle>;
  fontFamily?: T;
  weight?: keyof Theme["fonts"];
  color?: keyof Theme["colors"];
  size?: number;
  align?: TextStyle["textAlign"];
  lineHeight?: number;
  children: React.ReactNode;
}

export function Text<T extends keyof Theme["fonts"]>({
  style,
  color = "primary",
  size = 14,
  children,
  weight = "regular",
  align = "center",
  lineHeight,
  ...rest
}: TextProps<T>) {
  const theme = useTheme();
  const textColor = theme.colors[color];
  const fontWeight: TextStyle["fontWeight"] = theme.fonts[
    weight
  ] as TextStyle["fontWeight"];
  return (
    <NativeText
      {...rest}
      style={[
        {
          fontSize: size,
          lineHeight,
          color: textColor,
          fontWeight: fontWeight,
          textAlign: align
        },
        style
      ]}
    >
      {children}
    </NativeText>
  );
}
