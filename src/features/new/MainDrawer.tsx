// React Imports
import React from "react";
import { View, TouchableOpacity } from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { fontSize, padding } from "core/theme/theme.ts";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { useNavigation } from "@react-navigation/native";
import { Routes } from "core/navigation/types/types.ts";
import { ChatNavigationProp } from "features/chat/types.ts";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import Icon from "shared/components/Icon.tsx";

// Drawer Imports
import { VideoDrawer } from "./actions/VideoDrawer.tsx";
import { ChannelDrawer } from "./actions/ChannelDrawer.tsx";
import { FaxDrawer } from "./actions/FaxDrawer.tsx";

type ActionItemProps = {
  iconName: string;
  backgroundColor: string;
  iconColor: string;
  title: string;
  helperText: string;
  onPress?: () => void;
};

const ActionItem = ({
  iconName,
  backgroundColor,
  iconColor,
  title,
  helperText,
  onPress
}: ActionItemProps) => {
  const theme = useTheme();

  return (
    <TouchableOpacity onPress={onPress}>
      <View
        style={{
          padding: padding.lg,
          flexDirection: "row",
          alignItems: "center",
          gap: padding.xl
        }}
      >
        <View
          style={{
            backgroundColor,
            borderRadius: 100,
            padding: 12
          }}
        >
          <Icon name={iconName} size={fontSize.lg} stroke={iconColor} />
        </View>
        <View
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start"
          }}
        >
          <Text
            size={fontSize.md}
            weight={"semiBold"}
            style={{
              color: theme.colors["color-colors-text-text-primary"],
              marginBottom: padding.xs
            }}
          >
            {title}
          </Text>
          <Text
            size={fontSize.md}
            weight={"regular"}
            style={{
              color: theme.colors["color-colors-text-text-secondary"]
            }}
          >
            {helperText}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};
// type NewDrawerProps = {
//   // Add props as needed
// };

export const MainDrawer = () => {
  // Hooks
  const theme = useTheme();
  const { openDrawer, closeDrawer } = useDrawer();
  const navigation = useNavigation<ChatNavigationProp>();

  const handleDrawerNavigation = (DrawerComponent: React.ComponentType) => {
    closeDrawer();
    setTimeout(() => {
      openDrawer(<DrawerComponent />);
    }, 300); // Small delay to ensure smooth transition
  };

  const handleScreenNavigation = (route: Routes) => {
    closeDrawer();
    navigation.navigate(route as any);
  };

  const actions = [
    {
      iconName: "phone",
      backgroundColor: theme.colors["colors-background-bg-brand-secondary"],
      iconColor:
        theme.colors[
          "color-component-colors-components-icons-featured-icons-light-featured-icon-light-fg-brand"
        ],
      title: "Call",
      helperText: "Make a voice call",
      onPress: () => handleScreenNavigation(Routes.Keypad)
    },
    {
      iconName: "video-recorder",
      backgroundColor: theme.colors["colors-background-bg-warning-secondary"],
      iconColor:
        theme.colors[
          "component-colors-components-icons-featured-icons-light-featured-icon-light-fg-warning"
        ],
      title: "Video",
      helperText: "Start a video meeting",
      onPress: () => handleDrawerNavigation(VideoDrawer)
    },
    {
      iconName: "message-text-square-01",
      backgroundColor: theme.colors["colors-background-bg-success-secondary"],
      iconColor:
        theme.colors[
          "color-component-colors-components-icons-featured-icons-light-featured-icon-light-fg-success"
        ],
      title: "Message",
      helperText: "Start a conversation",
      onPress: () => handleScreenNavigation(Routes.NewMessage)
    },
    {
      iconName: "hash-02",
      backgroundColor: theme.colors["colors-background-bg-tertiary"],
      iconColor:
        theme.colors[
          "color-component-colors-components-icons-featured-icons-light-featured-icon-light-fg-gray"
        ],
      title: "Channel",
      helperText: "Start a group conversation by topic",
      onPress: () => handleDrawerNavigation(ChannelDrawer)
    },
    {
      iconName: "printer",
      backgroundColor: theme.colors["colors-background-bg-error-secondary"],
      iconColor:
        theme.colors[
          "colors-components-icons-featured-icons-light-featured-icon-light-fg-error"
        ],
      title: "Fax",
      helperText: "Send an outgoing fax",
      onPress: () => handleDrawerNavigation(FaxDrawer)
    }
  ];

  return (
    <>
      <View style={{ paddingHorizontal: 20 }}>
        <WhiteSpace height={3} />
        <Text
          size={fontSize.lg}
          weight={"semiBold"}
          style={{
            marginBottom: padding["2xl"],
            color: theme.colors["color-colors-text-text-primary"],
            borderColor: theme.colors["color-colors-border-border-secondary"]
          }}
        >
          New
        </Text>

        <WhiteSpace
          style={{
            borderStyle: "solid",
            borderWidth: 0.5,
            borderColor: theme.colors["color-colors-border-border-secondary"]
          }}
        />
        <WhiteSpace height={padding["3xl"]} />

        <View>
          {actions.map((action, index) => (
            <ActionItem
              key={index}
              iconName={action.iconName}
              backgroundColor={action.backgroundColor}
              iconColor={action.iconColor}
              title={action.title}
              helperText={action.helperText}
              onPress={action.onPress}
            />
          ))}
        </View>
      </View>
    </>
  );
};
