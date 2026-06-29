import React from "react";
import { Routes } from "core/navigation/types/types.ts";
import { useTheme } from "hooks/use-theme.ts";
import { Text } from "shared/components/Text.tsx";
import { StyleSheet, View, Platform } from "react-native";
import { borderRadius, padding } from "core/theme/theme.ts";
import { ContactsDirectory } from "features/contacts/pages/ContactsDirectory.tsx";
import { ContactsGroups } from "features/contacts/pages/ContactsGroups.tsx";
import { ContactsPersonal } from "features/contacts/pages/ContactsPersonal.tsx";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";

export type TabParams = {
  Directory: undefined;
  Groups: undefined;
  Personal: undefined;
};

const TabNavigator = createMaterialTopTabNavigator<TabParams>();

function TabLabel({
  label,
  focused,
  badge
}: {
  label: string;
  focused: boolean;
  badge?: string;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.tabItemContainer,
        focused && {
          backgroundColor:
            theme.colors["color-colors-background-bg-brand-primary-alt"]
        }
      ]}
    >
      <Text
        style={{
          color: focused
            ? theme.colors["color-colors-text-text-brand-secondary"]
            : theme.colors["color-colors-text-text-quarterary"],
          padding: 4
        }}
        size={16}
        weight="semiBold"
      >
        {label}
      </Text>

      {badge ? (
        <View
          style={{
            paddingHorizontal: padding.sm,
            height: 18,
            borderRadius: borderRadius.full,
            marginLeft: padding.sm,
            borderWidth: 1,
            borderColor: focused
              ? theme.colors[
                  "color-component-colors-utility-brand-utility-brand-200"
                ]
              : theme.colors["color-colors-border-border-secondary"]
          }}
        >
          <Text
            style={{
              color: focused
                ? theme.colors[
                    "color-component-colors-utility-brand-utility-brand-700"
                  ]
                : theme.colors["color-colors-text-text-quarterary"]
            }}
          >
            {badge}
          </Text>
        </View>
      ) : undefined}
    </View>
  );
}

export function ContactsTabNavigator() {
  const theme = useTheme();

  return (
    <TabNavigator.Navigator
      initialRouteName={Routes.Directory}
      backBehavior="initialRoute"
      screenOptions={{
        tabBarScrollEnabled: true,
        tabBarStyle: {
          elevation: 1,
          overflow: "scroll",
          backgroundColor: theme.colors["color-colors-background-bg-primary"],
          ...(Platform.OS === "android" && { paddingLeft: -24 })
        },
        tabBarItemStyle: {
          width: "auto"
        },
        tabBarIndicatorStyle: {
          height: 0
        }
      }}
    >
      <TabNavigator.Screen
        name={Routes.Directory}
        component={ContactsDirectory}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel label={Routes.Directory} focused={focused} />
          )
        }}
      />
      <TabNavigator.Screen
        name={Routes.Groups}
        component={ContactsGroups}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel label={Routes.Groups} focused={focused} />
          )
        }}
      />
      <TabNavigator.Screen
        name={Routes.Personal}
        component={ContactsPersonal}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel label={Routes.Personal} focused={focused} />
          )
        }}
      />
    </TabNavigator.Navigator>
  );
}

const styles = StyleSheet.create({
  tabItemContainer: {
    borderRadius: 5,
    paddingHorizontal: 2,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center"
  }
});
