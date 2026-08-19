import React, { useEffect } from "react";
import { Routes } from "core/navigation/types/types.ts";
import { useTheme } from "hooks/use-theme.ts";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { InboxCalls } from "features/inbox/pages/InboxCalls.tsx";
import { InboxRecordings } from "features/inbox/pages/InboxRecordings.tsx";
import { InboxMissed } from "features/inbox/pages/InboxMissed.tsx";
import { InboxVoicemails } from "features/inbox/pages/InboxVoicemails.tsx";
import { InboxFaxes } from "features/inbox/pages/InboxFaxes.tsx";
import { Text } from "shared/components/Text.tsx";
import { DeviceEventEmitter, StyleSheet, View } from "react-native";
import { borderRadius, padding } from "core/theme/theme.ts";
import { useNavigation, useRoute } from "@react-navigation/native";
import { MISSED_CALL_NAV_EVENT } from "core/navigation/utils/MissedCallNavEvent.ts";
import { VOICEMAIL_NAV_EVENT } from "core/navigation/utils/VoicemailNavEvent.ts";

export type TabParams = {
  Calls: undefined;
  Missed: undefined;
  Voicemails: undefined;
  Meetings: undefined;
  Recordings: undefined;
  Faxes: undefined;
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

export function InboxTabNavigator() {
  const theme = useTheme();
  const navigation = useNavigation();
  const _route = useRoute();

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      MISSED_CALL_NAV_EVENT,
      () => {
        console.log(
          "📍 [InboxTabNavigator] Received missed call nav event, jumping to Missed tab"
        );
        try {
          (navigation as any).jumpTo(Routes.Missed);
        } catch (e) {
          console.log(
            "📍 [InboxTabNavigator] jumpTo failed, trying navigate:",
            e
          );
        }
      }
    );
    return () => subscription.remove();
  }, [navigation]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      VOICEMAIL_NAV_EVENT,
      () => {
        console.log(
          "📍 [InboxTabNavigator] Received voicemail nav event, jumping to Voicemails tab"
        );
        try {
          (navigation as any).jumpTo(Routes.Voicemails);
        } catch (e) {
          console.log(
            "📍 [InboxTabNavigator] voicemail jumpTo failed, trying navigate:",
            e
          );
        }
      }
    );
    return () => subscription.remove();
  }, [navigation]);

  return (
    <TabNavigator.Navigator
      initialRouteName={Routes.Calls}
      backBehavior="initialRoute"
      screenOptions={{
        tabBarScrollEnabled: true,
        tabBarStyle: {
          elevation: 1,
          overflow: "scroll",
          backgroundColor: theme.colors["color-colors-background-bg-primary"]
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
        name={Routes.Calls}
        component={InboxCalls}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel label={Routes.Calls} focused={focused} />
          )
        }}
      />
      <TabNavigator.Screen
        name={Routes.Missed}
        component={InboxMissed}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel label={Routes.Missed} focused={focused} />
          )
        }}
      />
      <TabNavigator.Screen
        name={Routes.Voicemails}
        component={InboxVoicemails}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel label={Routes.Voicemails} focused={focused} />
          )
        }}
      />
      <TabNavigator.Screen
        name={Routes.Recordings}
        component={InboxRecordings}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel label={Routes.Recordings} focused={focused} />
          )
        }}
      />
      <TabNavigator.Screen
        name={Routes.Faxes}
        component={InboxFaxes}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel label={Routes.Faxes} focused={focused} />
          )
        }}
      />
    </TabNavigator.Navigator>
  );
}

const styles = StyleSheet.create({
  tabItemContainer: {
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center"
  }
});
