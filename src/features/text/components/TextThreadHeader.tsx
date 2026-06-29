import React from "react";
import { View } from "react-native";
import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";
import { useTheme } from "hooks/use-theme.ts";
import { componentSize, fontSize, padding } from "core/theme/theme.ts";
import { useNavigation } from "@react-navigation/core";

interface TextThreadHeaderProps {
  title: string;
}

export const TextThreadHeader = ({ title }: TextThreadHeaderProps) => {
  const theme = useTheme();
  const navigation = useNavigation();

  return (
    <View
      style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: padding["3xl"],
        height: 60,
        borderBottomColor: theme.colors["color-colors-border-border-secondary"],
        borderBottomWidth: 1
      }}
    >
      <Icon
        name={"chevron-left"}
        onPress={() => navigation.goBack()}
        size={componentSize.xs}
        color={
          theme.colors[
            "color-component-colors-components-buttons-tertiary-button-tertiary-fg"
          ]
        }
      />

      <Text
        style={{ flex: 1, textAlign: "center", paddingHorizontal: padding.md }}
        size={fontSize.md}
        weight={"semiBold"}
        color={
          "color-component-colors-components-buttons-tertiary-button-tertiary-fg"
        }
        numberOfLines={1}
      >
        {title}
      </Text>

      {/* Spacer to keep title centered */}
      <View style={{ width: componentSize.xs }} />
    </View>
  );
};
