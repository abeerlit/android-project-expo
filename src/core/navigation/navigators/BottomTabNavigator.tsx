import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Routes } from "core/navigation/types/types.ts";
import { Home } from "features/home/pages/Home.tsx";
import { useTheme } from "hooks/use-theme.ts";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { TouchableWithoutFeedback, View } from "react-native";
import { TabBarIcon } from "shared/components/TabBarIcon.tsx";
import { Contacts } from "features/contacts/pages/Contacts.tsx";
import { Inbox } from "features/inbox/pages/Inbox.tsx";
import { Keypad } from "features/calling/components/Keypad.tsx";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";

export type TabParams = {
  Home: undefined;
  Inbox: undefined;
  Contacts: undefined;
  Keypad: undefined;
};

const TabNavigator = createBottomTabNavigator<TabParams>();

export function BottomTabNavigator() {
  const { bottom } = useSafeAreaInsets();
  const theme = useTheme();
  const { totalUnreadCount } = useSendbirdContext();

  return (
    <TabNavigator.Navigator
      initialRouteName={Routes.Home}
      backBehavior={"initialRoute"}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: 70 + bottom,
          backgroundColor:
            theme.colors["color-colors-background-bg-primary-alt"],
          shadowColor: theme.colors.shadow,
          shadowOffset: {
            width: 0,
            height: 1
          },
          shadowOpacity: 0.2,
          shadowRadius: 1.41,
          elevation: 1
        }
      }}
    >
      <TabNavigator.Screen
        name={Routes.Home}
        component={Home}
        options={{
          unmountOnBlur: false,
          tabBarButton: ({ children, style, onPress, key, ...rest }) => (
            <TouchableWithoutFeedback
              key={key}
              {...rest}
              onPressIn={(e) => {
                return onPress?.(e);
              }}
            >
              <View style={style}>{children}</View>
            </TouchableWithoutFeedback>
          ),
          tabBarIcon: ({ focused }) => (
            <TabBarIcon
              icon={"home-line"}
              focused={focused}
              label="Home"
              count={totalUnreadCount}
            />
          )
        }}
      />
      <TabNavigator.Screen
        name={Routes.Inbox}
        component={Inbox}
        options={{
          unmountOnBlur: false,
          tabBarButton: ({ children, style, onPress, key, ...rest }) => (
            <TouchableWithoutFeedback
              key={key}
              {...rest}
              onPressIn={(e) => {
                return onPress?.(e);
              }}
            >
              <View style={style}>{children}</View>
            </TouchableWithoutFeedback>
          ),
          tabBarIcon: ({ focused }) => (
            <TabBarIcon icon={"recent"} focused={focused} label="Recents" />
          )
        }}
      />
      <TabNavigator.Screen
        name={Routes.Contacts}
        component={Contacts}
        options={{
          unmountOnBlur: false,
          tabBarButton: ({ children, style, onPress, key, ...rest }) => (
            <TouchableWithoutFeedback
              key={key}
              {...rest}
              onPressIn={(e) => {
                return onPress?.(e);
              }}
            >
              <View style={style}>{children}</View>
            </TouchableWithoutFeedback>
          ),
          tabBarIcon: ({ focused }) => (
            <TabBarIcon icon={"users-01"} focused={focused} label="Contacts" />
          )
        }}
      />
      <TabNavigator.Screen
        name={Routes.Keypad}
        component={Keypad}
        options={{
          unmountOnBlur: false,
          tabBarButton: ({ children, style, onPress, key, ...rest }) => (
            <TouchableWithoutFeedback
              key={key}
              {...rest}
              onPressIn={(e) => {
                return onPress?.(e);
              }}
            >
              <View style={style}>{children}</View>
            </TouchableWithoutFeedback>
          ),
          tabBarIcon: ({ focused }) => (
            <TabBarIcon icon={"dots-grid"} focused={focused} label="Keypad" />
          )
        }}
      />
    </TabNavigator.Navigator>
  );
}
