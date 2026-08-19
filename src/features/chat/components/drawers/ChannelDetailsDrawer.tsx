// React Imports
import React, { useState, useRef, useEffect } from "react";
import { Text } from "shared/components/Text.tsx";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import {
  borderRadius,
  componentSize,
  fontSize,
  padding
} from "core/theme/theme.ts";
import { ScrollView, View, Dimensions } from "react-native";
import Icon from "shared/components/Icon.tsx";
import { useTheme } from "hooks/use-theme.ts";
import { Button } from "shared/components/Button.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { SettingsTab } from "features/chat/components/drawers/tabs/SettingsTab.tsx";
import { MembersTab } from "features/chat/components/drawers/tabs/MembersTab.tsx";
import { NotificationsTab } from "features/chat/components/drawers/tabs/NotificationsTab.tsx";
import { useDrawer } from "core/drawer/DrawerContext.tsx";

type ActiveTab = "settings" | "members" | "notification";

export const ChannelDetailsDrawer = () => {
  const theme = useTheme();
  const { currentChannel: channel } = useSendbirdContext();
  const { closeDrawer } = useDrawer();

  const [activeTab, setActiveTab] = useState<ActiveTab>("settings");
  const scrollViewRef = useRef<ScrollView>(null);
  const tabRefs = useRef<{ [key in ActiveTab]?: View | null }>({});

  // Close drawer when channel becomes null (user navigated away).
  useEffect(() => {
    if (!channel) {
      closeDrawer();
    }
  }, [channel, closeDrawer]);

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);

    // Scroll to the active tab
    if (tabRefs.current[tab] && scrollViewRef.current) {
      tabRefs.current[tab]?.measureLayout(
        scrollViewRef.current as any,
        (x, _y, _width, _height) => {
          // Scroll to position with some padding
          scrollViewRef.current?.scrollTo({
            x: x - 20, // 20px padding from the left
            animated: true
          });
        },
        () => {} // Error callback
      );
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case "settings":
        return <SettingsTab />;
      case "members":
        return <MembersTab />;
      case "notification":
        return <NotificationsTab />;
      default:
        return null;
    }
  };

  if (!channel) return <View></View>;

  // Get screen height for proper content area sizing
  const screenHeight = Dimensions.get("window").height;
  // Calculate approximate height for content area (adjust as needed)
  const contentHeight = screenHeight - 300; // Adjust based on your header/navigation

  return (
    <View style={{ flex: 1, paddingHorizontal: padding["2xl"] }}>
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: padding.lg
        }}
      >
        <View
          style={{
            height: 48,
            width: 48,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            borderRadius: borderRadius.md,
            borderWidth: 1,
            borderColor: theme.colors["color-colors-border-border-secondary"]
          }}
        >
          <Icon
            name={channel.isPublic ? "hash-02" : "lock-03"}
            size={componentSize.xs}
          />
        </View>
        <View
          style={{
            alignItems: "center",
            gap: padding.sm,
            width: "75%"
          }}
        >
          <Text align="center" size={fontSize.md} weight={"semiBold"}>
            {channel.name}
          </Text>
          <Text size={fontSize.sm} weight={"regular"}>
            View and modify channel details below
          </Text>
        </View>
      </View>
      <WhiteSpace height={padding.xl} />

      {/* Tab ScrollView with fixed height */}
      <View style={{ height: 50 }}>
        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            alignItems: "center"
          }}
          style={{
            flexGrow: 0
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center"
            }}
          >
            <View ref={(ref) => (tabRefs.current.settings = ref)}>
              <Button
                type={activeTab === "settings" ? "outline" : "text"}
                onPress={() => handleTabChange("settings")}
              >
                <Text
                  size={fontSize.sm}
                  weight={"semiBold"}
                  color={
                    activeTab === "settings"
                      ? "color-colors-text-text-primary"
                      : "color-colors-text-text-quarterary"
                  }
                >
                  Settings
                </Text>
              </Button>
            </View>
            <View ref={(ref) => (tabRefs.current.members = ref)}>
              <Button
                type={activeTab === "members" ? "outline" : "text"}
                onPress={() => handleTabChange("members")}
              >
                <View
                  style={{
                    flexDirection: "row",
                    gap: padding.md,
                    alignItems: "center"
                  }}
                >
                  <Text
                    size={fontSize.sm}
                    weight={"semiBold"}
                    color={
                      activeTab === "members"
                        ? "color-colors-text-text-primary"
                        : "color-colors-text-text-quarterary"
                    }
                  >
                    Members{" "}
                  </Text>
                  <View
                    style={{
                      paddingHorizontal: padding.md,
                      paddingVertical: padding.xxs,
                      borderRadius: borderRadius.full,
                      borderColor:
                        theme.colors[
                          "color-component-colors-utility-brand-utility-brand-200"
                        ],
                      borderWidth: 1
                    }}
                  >
                    <Text
                      size={fontSize.xs}
                      weight={"medium"}
                      color={
                        "color-component-colors-utility-brand-utility-brand-700"
                      }
                    >
                      {channel.memberCount}
                    </Text>
                  </View>
                </View>
              </Button>
            </View>
            <View ref={(ref) => (tabRefs.current.notification = ref)}>
              <Button
                type={activeTab === "notification" ? "outline" : "text"}
                onPress={() => handleTabChange("notification")}
              >
                <Text
                  size={fontSize.sm}
                  weight={"semiBold"}
                  color={
                    activeTab === "notification"
                      ? "color-colors-text-text-primary"
                      : "color-colors-text-text-quarterary"
                  }
                >
                  Notifications
                </Text>
              </Button>
            </View>
          </View>
        </ScrollView>
      </View>

      <WhiteSpace height={padding.xl} />

      {/* Content area with explicit height */}
      <View style={{ flex: 1, height: contentHeight }}>{renderContent()}</View>
    </View>
  );
};
