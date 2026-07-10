// React Imports
import React from "react";
import { Platform, StyleSheet, View, LogBox } from "react-native";

// Navigation
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { NavigationContainer } from "@react-navigation/native";

// Hooks
import { useTheme } from "hooks/use-theme.ts";

// Components
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { fontSize, padding } from "core/theme/theme.ts";

// Pages
import NotificationsPage from "./pages/NotificationsPage.tsx";
import CallsPage from "./pages/CallsPage.tsx";
import SecurityPage from "./pages/SecurityPage.tsx";
import ProfilePage from "./pages/ProfilePage.tsx";
import { Screen } from "shared/components/utils/Screen.tsx";
import Icon from "shared/components/Icon.tsx";
import { useNavigation } from "@react-navigation/core";

// Ignore specific harmless warnings
LogBox.ignoreLogs([
  "Sending `onAnimatedValueUpdate` with no listeners registered."
]);

type TabParams = {
  Profile: undefined;
  Notifications: undefined;
  Calls: undefined;
  Security: undefined;
};

const TabNavigator = createMaterialTopTabNavigator<TabParams>();

// Tab Label Component
function TabLabel({ label, focused }: { label: string; focused: boolean }) {
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
        weight={"semiBold"}
      >
        {label}
      </Text>
    </View>
  );
}

// Preferences Tab Navigator Component
const PreferencesTabNavigator = () => {
  const theme = useTheme();

  return (
    <TabNavigator.Navigator
      initialRouteName="Profile"
      backBehavior="initialRoute"
      screenOptions={{
        tabBarScrollEnabled: true,
        tabBarStyle: {
          elevation: 0,
          shadowOpacity: 0,
          overflow: "scroll",
          backgroundColor: theme.colors["color-colors-background-bg-primary"],
          paddingHorizontal: padding["md"],
          ...(Platform.OS === "android" && { paddingLeft: -24 })
        },
        tabBarItemStyle: {
          width: "auto",
          flexShrink: 0,
          marginHorizontal: 0,
          paddingHorizontal: 0
        },
        tabBarContentContainerStyle: {
          alignItems: "center",
          paddingVertical: 2,
          paddingRight: padding["md"],
          columnGap: 0,
          gap: 0
        },
        tabBarIndicatorStyle: {
          height: 0
        },
        lazy: true
      }}
    >
      <TabNavigator.Screen
        name="Profile"
        component={ProfilePage}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Profile" focused={focused} />
          )
        }}
      />
      <TabNavigator.Screen
        name="Notifications"
        component={NotificationsPage}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Notifications" focused={focused} />
          )
        }}
      />
      <TabNavigator.Screen
        name="Calls"
        component={CallsPage}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Calls" focused={focused} />
          )
        }}
      />
      <TabNavigator.Screen
        name="Security"
        component={SecurityPage}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Security" focused={focused} />
          )
        }}
      />
    </TabNavigator.Navigator>
  );
};

export const PreferencesScreen: React.FC = () => {
  // Hooks
  const theme = useTheme();
  const navigation = useNavigation();

  return (
    <Screen>
      <View style={styles.header}>
        <Icon name={"chevron-left"} onPress={() => navigation.goBack()} />
        <Text
          size={fontSize.lg}
          weight={"semiBold"}
          style={{
            color: theme.colors["color-colors-text-text-primary"],
            borderColor: theme.colors["color-colors-border-border-secondary"],
            marginLeft: -padding["3xl"]
          }}
        >
          Preferences
        </Text>
        <WhiteSpace />
      </View>

      <View style={styles.tabContainer}>
        <NavigationContainer independent={true}>
          <PreferencesTabNavigator />
        </NavigationContainer>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: padding["3xl"],
    paddingTop: padding.lg,
    marginBottom: padding.lg
  },
  tabItemContainer: {
    borderRadius: 5,
    paddingHorizontal: 16,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center"
  },
  tabContainer: {
    flex: 1
  }
});

export default PreferencesScreen;
