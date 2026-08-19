import React, { ReactNode } from "react";
import {
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewStyle,
  TextStyle,
  View
} from "react-native";
import { Theme } from "core/theme/theme.ts";
import { useTheme } from "hooks/use-theme.ts";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { Loader } from "shared/components/utils/Loader.tsx";
import { Text } from "shared/components/Text.tsx";

interface Props extends TouchableOpacityProps {
  type?: "primary" | "secondary" | "outline" | "text" | "danger";
  loading?: boolean;
  disabled?: boolean;
  children: string | ReactNode;
  textStyle?: StyleProp<TextStyle>;
  textAlign?: TextStyle["textAlign"];
  weight?: keyof Theme["fonts"];
  size?: number;
  containerStyle?: StyleProp<ViewStyle>;
  paddingVertical?: number;
  icon?: ReactNode;
  iconSpacing?: number;
}

export function Button({
  type = "primary",
  loading,
  children,
  disabled = false,
  textStyle,
  containerStyle,
  textAlign = "center",
  weight = "regular",
  size = 16,
  paddingVertical = 0,
  icon,
  iconSpacing = 10,
  style,
  ...forwardedProps
}: Props) {
  const theme = useTheme();
  const dynamicStyles = getStyles(theme.colors, type, disabled);
  return (
    <TouchableOpacity
      disabled={disabled || loading}
      style={[
        { paddingVertical },
        styles.container,
        dynamicStyles.container,
        containerStyle,
        { opacity: disabled ? 0.5 : loading ? 0.8 : 1 },
        style
      ]}
      {...forwardedProps}
    >
      {loading ? (
        <>
          <Loader
            size={size}
            style={styles.loader}
            color={dynamicStyles.loader as keyof Theme["colors"]}
          />
        </>
      ) : typeof children === "string" ? (
        <View style={styles.row}>
          {icon}
          {icon && <WhiteSpace width={iconSpacing} />}
          <Text
            color={dynamicStyles.loader as keyof Theme["colors"]}
            style={[{ color: dynamicStyles.text }, textStyle]}
            size={size}
            weight={weight}
            align={textAlign}
          >
            {children}
          </Text>
        </View>
      ) : (
        children
      )}
    </TouchableOpacity>
  );
}

function getStyles(
  colors: Theme["colors"],
  type: Props["type"],
  disabled: boolean
) {
  switch (type) {
    case "outline":
      return {
        container: {
          backgroundColor: colors["transparent"],
          borderColor: disabled
            ? colors["color-colors-border-border-disabled-subtle"]
            : colors["colors-border-border-primary"],
          borderWidth: 1
        },
        text: colors.primary,
        loader: colors.backgroundColor
      };
    case "text":
      return {
        text: colors.primary
      };
    case "danger":
      return {
        container: {
          backgroundColor:
            colors[
              "component-colors-components-buttons-primary-error-button-primary-error-bg"
            ],
          borderColor: disabled
            ? colors["color-colors-border-border-disabled-subtle"]
            : colors[
                "component-colors-components-buttons-primary-error-button-primary-error-border"
              ],
          borderWidth: 1
        },
        text: colors["colors-foreground-fg-white"],
        loader: colors["colors-foreground-fg-white"]
      };
    default:
      return {
        container: {
          backgroundColor: disabled
            ? colors["color-colors-border-border-disabled-subtle"]
            : colors[
                "color-component-colors-components-buttons-primary-button-primary-bg"
              ]
        },
        text: colors[
          "color-component-colors-components-buttons-primary-button-primary-fg"
        ],
        loader: colors.backgroundColor
      };
  }
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10
  },
  loader: {
    maxWidth: 16,
    paddingVertical: 2
  },
  row: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center"
  }
});
