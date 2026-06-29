import React, { ReactNode, useState, forwardRef } from "react";
import {
  Platform,
  StyleProp,
  StyleSheet,
  TextInput as NativeTextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
  TextStyle
} from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import Icon from "shared/components/Icon.tsx";
import { fontSize, Theme } from "core/theme/theme.ts";

interface Props extends Omit<TextInputProps, "placeholderTextColor"> {
  containerStyle?: StyleProp<ViewStyle>;
  before?: ReactNode;
  after?: ReactNode;
  secureTextEntry?: boolean;
  height?: number;
  paddingHorizontal?: number;
  variant?: "text" | "outline";
  // Text style props
  textColor?: keyof Theme["colors"];
  textSize?: number;
  textWeight?: keyof Theme["fonts"];
  // Placeholder style props
  placeholderColor?: keyof Theme["colors"];
  placeholderSize?: number;
  placeholderWeight?: keyof Theme["fonts"];
}

export const TextInput = forwardRef<NativeTextInput, Props>(function TextInput(
  {
    before,
    after,
    containerStyle,
    style,
    height = 50,
    paddingHorizontal = 10,
    secureTextEntry,
    variant = "outline",
    // Text styling
    textColor = "color-colors-text-text-primary",
    textSize = fontSize.md,
    textWeight = "regular",
    // Placeholder styling
    placeholderColor = "color-colors-text-text-tertiary",
    placeholder,
    ...forwardProps
  },
  ref
) {
  const theme = useTheme();
  const [viewPassword, setViewPassword] = useState(secureTextEntry);

  const getInputContainerStyle = () => {
    const baseStyle = {
      height: height,
      paddingHorizontal: paddingHorizontal
    };

    if (variant === "outline") {
      return {
        ...baseStyle,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors["colors-border-border-primary"],
        backgroundColor: theme.colors["transparent"]
      };
    }

    return baseStyle;
  };

  const getTextStyle = () => ({
    flex: 1,
    color: theme.colors[textColor],
    fontSize: textSize,
    fontWeight: theme.fonts[textWeight] as TextStyle["fontWeight"]
  });

  return (
    <View
      style={[
        styles.container,
        variant === "outline" && {
          borderColor: theme.colors["colors-border-border-primary"],
          backgroundColor: theme.colors["transparent"]
        },
        containerStyle
      ]}
    >
      {before}
      <View style={[getInputContainerStyle(), style, styles.searchInput]}>
        {Platform.OS === "ios" ? (
          <NativeTextInput
            ref={ref}
            style={getTextStyle()}
            autoComplete={forwardProps.autoComplete}
            autoCapitalize={"sentences"}
            placeholder={placeholder}
            placeholderTextColor={theme.colors[placeholderColor]}
            {...forwardProps}
            secureTextEntry={viewPassword}
          />
        ) : (
          <NativeTextInput
            ref={ref}
            style={getTextStyle()}
            autoCapitalize={"sentences"}
            placeholder={placeholder}
            placeholderTextColor={theme.colors[placeholderColor]}
            {...forwardProps}
            secureTextEntry={viewPassword}
          />
        )}
        {secureTextEntry && (
          <TouchableOpacity
            onPress={() => setViewPassword(!viewPassword)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 20 }}
            style={{
              justifyContent: "center",
              alignItems: "center",
              alignSelf: "stretch"
            }}
          >
            {viewPassword ? <Icon name={"eye-off"} /> : <Icon name={"eye"} />}
          </TouchableOpacity>
        )}
      </View>
      {after}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center"
  },
  searchInput: {
    flex: 1,
    display: "flex",
    justifyContent: "space-between",
    flexDirection: "row"
  }
});
