// React Imports
import React from "react";
// import { useSelector } from "react-redux";
import { useTheme } from "hooks/use-theme.ts";

// Type Imports
// import { State } from "store/types.ts";
// import { CallData } from "shared/api/inbox/types.ts";

// Component Imports
import { TouchableOpacity, View, StyleSheet } from "react-native";
import Icon from "shared/components/Icon.tsx";
import { channelListRowStyles } from "features/chat/styles/component-styles.ts";
import { Text } from "shared/components/Text.tsx";
import { componentSize, fontSize, padding } from "core/theme/theme.ts";
import { useNavigation } from "@react-navigation/core";
import { ChatNavigationProp, FilteredChannel } from "features/chat/types.ts";
import { Routes } from "core/navigation/types/types.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { toast } from "@backpackapp-io/react-native-toast";
import { Logger } from "shared/utils/Logger.ts";

type ChannelListRowProps = {
  channel: FilteredChannel;
};

export const ChannelListRow = ({ channel }: ChannelListRowProps) => {
  // Constants
  const logger = new Logger("ChannelListRow: ");
  const theme = useTheme();
  const navigation = useNavigation<ChatNavigationProp>();
  const { sendbirdInstance } = useSendbirdContext();

  // Hide channel until it has a proper name.
  const name = channel.name?.toLowerCase().trim() || "";
  if (!name || name.startsWith("unnamed")) {
    return null;
  }

  const handleJoinChannel = async () => {
    const sendbirdChannel = await sendbirdInstance?.groupChannel.getChannel(
      channel.url
    );
    try {
      const joinRes = await sendbirdChannel?.join();
      if (joinRes) {
        navigation.navigate(Routes.Chat, { channelUrl: channel.url });
      }
    } catch (e) {
      toast.error("Unable to join channel");
      logger.error("Error joining channel: ", e);
    }
  };

  return (
    <TouchableOpacity
      style={[channelListRowStyles.containerStyle]}
      onPress={() =>
        navigation.navigate(Routes.Chat, {
          channelUrl: channel.url
        })
      }
    >
      {/* Icon - Fixed width container for consistent alignment */}
      <View style={styles.iconContainer}>
        <Icon
          name={channel.isPublic ? "hash-02" : "lock-03"}
          size={componentSize.xs}
          stroke={
            theme.colors[
              "component-colors-components-application-navigation-nav-item-button-icon-fg"
            ]
          }
          type="outline"
        />
      </View>
      
      {/* Name */}
      <View style={styles.namesContainer}>
        <Text
          size={fontSize.md}
          style={{
            color: theme.colors["color-colors-text-text-primary"]
          }}
          weight={channel.unreadCount ? "bold" : "medium"}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {(() => {
            const channelName = channel.name || "";
            return channelName.length > 30
              ? `${channelName.slice(0, 30)}...`
              : channelName;
          })()}
        </Text>
      </View>
      {channel.unreadCount > 0 && (
        <View
          style={[
            channelListRowStyles.badgeContainer,
            {
              backgroundColor: theme.colors["colors-border-border-error"],
              borderColor:
                theme.colors["color-colors-foreground-fg-error-primary"]
            }
          ]}
        >
          <Text
            size={fontSize.sm}
            weight="medium"
            color="colors-text-text-primary-on-brand"
          >
            {channel.unreadCount > 9 ? "9+" : channel.unreadCount}
          </Text>
        </View>
      )}
      {channel.joined === false && (
        <Text
          size={fontSize.sm}
          weight={"semiBold"}
          onPress={handleJoinChannel}
          color={
            "color-component-colors-components-buttons-tertiary-color-button-tertiary-color-fg"
          }
        >
          Join
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  iconContainer: {
    width: componentSize.xs,
    height: componentSize.xs,
    alignItems: "center",
    justifyContent: "center"
  },
  namesContainer: {
    flex: 1,
    minWidth: 0,
    marginLeft: padding.lg,
    alignItems: "flex-start",
    justifyContent: "center"
  }
});
