// React Imports
import React from "react";
import { useTheme } from "hooks/use-theme.ts";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";

// Component Imports
import Icon from "shared/components/Icon.tsx";
import { Text } from "shared/components/Text.tsx";
import { Dimensions, StyleSheet, View } from "react-native";

const { height } = Dimensions.get("window");

export const EmptyState = ({
  icon,
  title,
  subtext
}: {
  icon: string;
  title: string;
  subtext: string;
}) => {
  // Hooks
  const theme = useTheme();

  return (
    <View
      style={[
        styles.containerStyle,
        { backgroundColor: theme.colors["color-colors-background-bg-primary"] }
      ]}
    >
      <View
        style={[
          styles.columnStyle,
          {
            gap: padding["2xl"]
          }
        ]}
      >
        <View
          style={[
            styles.iconBackground,
            {
              backgroundColor: theme.colors["colors-background-bg-secondary"]
            }
          ]}
        >
          <Icon
            name={icon}
            size={40}
            style={{ color: theme.colors["colors-foreground-fg-tertiary"] }}
          />
        </View>

        <View
          style={[
            styles.columnStyle,
            {
              gap: padding.md
            }
          ]}
        >
          <Text
            style={[
              styles.titleStyle,
              { color: theme.colors["color-colors-text-text-primary"] }
            ]}
          >
            {title}
          </Text>
          <Text
            style={[
              styles.subtextStyle,
              { color: theme.colors["color-colors-text-text-tertiary"] }
            ]}
          >
            {subtext}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  containerStyle: {
    minHeight: height * 0.3,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: padding.xl
  },
  columnStyle: {
    alignItems: "center",
    flexDirection: "column"
  },
  iconBackground: {
    width: 80,
    height: 80,
    alignItems: "center",
    borderRadius: borderRadius.full,
    padding: 20
  },
  titleStyle: {
    fontSize: fontSize.xl,
    fontWeight: "700"
  },
  subtextStyle: {
    fontWeight: "400"
  }
});
