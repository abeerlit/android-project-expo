import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import Icon, { IconProps } from "shared/components/Icon.tsx";
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";

interface Props {
  focused?: boolean;
  icon: IconProps["name"];
  label?: string;
  size?: number;
  textSize?: number;
  count?: number;
}

export function TabBarIcon({
  focused,
  icon,
  label,
  size = 24,
  textSize = 11,
  count = 0
}: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.itemContainer]}>
      <Icon
        name={icon}
        size={size}
        type={focused ? "solid" : "outline"}
        strokeWidth={1.5}
      />
      <WhiteSpace height={5} />
      {label ? (
        <Text
          size={textSize}
          color={"primary"}
          weight={focused ? "medium" : "normal"}
        >
          {label}
        </Text>
      ) : null}
      {count > 0 && (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: theme.colors["colors-border-border-error"],
              borderColor: theme.colors["colors-border-border-error"],
              borderWidth: 1.5
            }
          ]}
        >
          <Text
            size={9}
            weight={"semiBold"}
            color={"colors-text-text-primary-on-brand"}
          >
            {count > 9 ? "9+" : count}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  itemContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch"
  },
  badge: {
    position: "absolute",
    top: 10,
    right: 30,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1
    },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2
  }
});
