import React, { useState, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "shared/components/Text.tsx";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { componentSize, fontSize, padding } from "core/theme/theme.ts";
import RadioButton from "shared/components/utils/RadioButton.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { PushTriggerOption } from "@sendbird/chat";
import { toast } from "@backpackapp-io/react-native-toast";

export const NotificationsTab = () => {
  const { currentChannel: channel } = useSendbirdContext();

  // State for notification type.
  const [notificationType, setNotificationType] = useState<PushTriggerOption>(
    channel?.myPushTriggerOption || PushTriggerOption.ALL
  );

  // Refresh channel and sync state when component mounts.
  useEffect(() => {
    const refreshChannelSettings = async () => {
      if (channel) {
        try {
          // Refresh channel to get latest settings from server.
          await channel.refresh();
          if (channel.myPushTriggerOption) {
            setNotificationType(channel.myPushTriggerOption);
          }
        } catch (error) {
          console.error("Failed to refresh channel settings", error);
        }
      }
    };
    refreshChannelSettings();
  }, [channel?.url]);

  const handleNotificationTypeChange = async (type: PushTriggerOption) => {
    if (!channel) return;

    const previousType = notificationType;
    try {
      // Optimistic UI update.
      setNotificationType(type);

      // Await the Sendbird API call.
      await channel.setMyPushTriggerOption(type);

      toast.success("Notification settings updated");
    } catch (error) {
      // Revert UI change on error
      setNotificationType(previousType);
      toast.error("Failed to update notification settings");
      console.error("Failed to update notification type", error);
    }
  };

  if (!channel) {
    return (
      <View style={styles.container}>
        <Text>Error loading channel notifications</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container]}>
      <Text
        weight="semiBold"
        size={fontSize.md}
        color="colors-text-text-secondary"
        align="left"
        style={styles.sectionTitle}
      >
        Notify me about...
      </Text>

      <View style={styles.radioGroupContainer}>
        <RadioButton
          size={componentSize.sm}
          label="All new messages"
          selected={
            notificationType === PushTriggerOption.ALL ||
            notificationType === PushTriggerOption.DEFAULT
          }
          onSelect={() => handleNotificationTypeChange(PushTriggerOption.ALL)}
        />
        <WhiteSpace height={padding.md} />
        <RadioButton
          size={componentSize.sm}
          label="Mentions"
          selected={notificationType === PushTriggerOption.MENTION_ONLY}
          onSelect={() =>
            handleNotificationTypeChange(PushTriggerOption.MENTION_ONLY)
          }
        />
        <WhiteSpace height={padding.md} />
        <RadioButton
          size={componentSize.sm}
          label="Nothing"
          selected={notificationType === PushTriggerOption.OFF}
          onSelect={() => handleNotificationTypeChange(PushTriggerOption.OFF)}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  sectionTitle: {
    marginBottom: padding.lg,
    width: "100%"
  },
  radioGroupContainer: {
    width: "100%"
  }
});
