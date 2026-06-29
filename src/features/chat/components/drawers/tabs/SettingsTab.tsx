import React, { useState } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  Keyboard
} from "react-native";
import { Text } from "shared/components/Text.tsx";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import Icon from "shared/components/Icon.tsx";
import {
  borderRadius,
  componentSize,
  fontSize,
  padding
} from "core/theme/theme.ts";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { useTheme } from "hooks/use-theme.ts";
import { TextInput } from "shared/components/TextInput.tsx";
import { Logger } from "shared/utils/Logger.ts";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { toast } from "@backpackapp-io/react-native-toast";
import { useNavigation } from "@react-navigation/core";
import {
  BottomTabNavigationParam,
  Routes
} from "core/navigation/types/types.ts";
import { Button } from "shared/components/Button.tsx";

const logger = new Logger("SettingsTab");

export const SettingsTab = () => {
  const {
    currentChannel: channel,
    leaveChannelPermanently,
    deleteChannel
  } = useSendbirdContext();
  const theme = useTheme();
  const { closeDrawer } = useDrawer();
  const navigation = useNavigation<BottomTabNavigationParam>();

  // Local State
  const [channelName, setChannelName] = useState(channel?.name || "");
  const [description, setDescription] = useState(channel?.data || "");

  // Methods
  const handleChannelLeave = async () => {
    if (!channel) return;
    try {
      await leaveChannelPermanently(channel);
      logger.debug("Left Channel: ", channel?.name);
      closeDrawer();
      navigation.navigate(Routes.BottomTabNavigator);
      toast.success("Channel left successfully");
    } catch (error) {
      logger.error("Error leaving channel: ", error);
      closeDrawer();
      navigation.navigate(Routes.BottomTabNavigator);
      toast.error("Error leaving channel");
    }
  };

  const handleChannelDelete = async () => {
    if (!channel) return;
    try {
      await deleteChannel(channel);
      logger.debug("Deleted Channel: ", channel?.name);
      closeDrawer();
      navigation.navigate(Routes.BottomTabNavigator);
      toast.success("Channel deleted successfully");
    } catch (error) {
      logger.error("Error deleting channel: ", error);
      closeDrawer();
      navigation.navigate(Routes.BottomTabNavigator);
      toast.error("Error deleting channel");
    }
  };

  const handleChannelUpdate = async () => {
    if (!channel) return;
    if (channel.data === description && channel.name === channelName) return;
    try {
      await channel.updateChannel({ name: channelName, data: description });
      logger.debug("Channel description updated: ", channel?.name);
      closeDrawer();
      toast.success("Channel updated successfully");
    } catch (error) {
      logger.error("Error updating channel: ", error);
      closeDrawer();
      toast.error("Error updating channel");
    }
  };

  if (!channel) {
    return (
      <View>
        <Text>Error loading channel settings</Text>
      </View>
    );
  }

  const errorColor =
    theme.colors[
      "component-colors-components-buttons-tertiary-error-button-tertiary-error-fg"
    ];

  return (
    <ScrollView onScrollBeginDrag={Keyboard.dismiss} keyboardShouldPersistTaps="handled">
        <Text
          weight={"medium"}
          size={fontSize.sm}
          color={"colors-text-text-secondary"}
          align={"left"}
        >
          Channel name
        </Text>
        <WhiteSpace height={padding.sm} />
        <View
          style={[
            styles.channelNameContainer,
            { borderColor: theme.colors["colors-border-border-primary"] }
          ]}
        >
          <Icon
            name={channel.isPublic ? "hash-02" : "lock-03"}
            size={componentSize.xl}
            color={theme.colors["color-colors-foreground-fg-quarterary"]}
          />
          <TextInput
            variant={"text"}
            style={styles.channelNameInput}
            value={channelName}
            onChangeText={setChannelName}
          />
        </View>
        <WhiteSpace height={padding.xl} />
        <Text
          weight={"medium"}
          size={fontSize.sm}
          color={"colors-text-text-secondary"}
          align={"left"}
        >
          Description
        </Text>
        <WhiteSpace height={padding.sm} />
        <TextInput
          variant={"outline"}
          style={styles.descriptionInput}
          value={description}
          numberOfLines={10}
          height={100}
          multiline={true}
          textAlignVertical={"top"}
          onChangeText={setDescription}
        />
        <WhiteSpace height={padding.xl} />
        <Text align={"left"} size={fontSize.lg} weight={"medium"}>
          Created by:
        </Text>
        <WhiteSpace height={padding.xs} />
        <Text align={"left"} size={fontSize.sm} weight={"regular"}>
          {channel.creator?.nickname} on{" "}
          {new Date(channel.createdAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric"
          })}
        </Text>
        <WhiteSpace height={padding["2xl"]} />
        <Text
          align={"left"}
          weight={"semiBold"}
          color={
            "component-colors-components-buttons-tertiary-error-button-tertiary-error-fg"
          }
          onPress={handleChannelLeave}
        >
          Leave Channel
        </Text>
        <WhiteSpace height={padding["4xl"]} />
        <View
          style={[
            styles.divider,
            {
              borderColor: theme.colors["color-colors-border-border-secondary"]
            }
          ]}
        />
        <WhiteSpace height={padding["3xl"]} />
        <View style={styles.deleteContainer}>
          {channel.myRole === "operator" ? (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleChannelDelete}
            >
              <Icon name={"trash-03"} size={20} color={errorColor} />
              <Text
                align={"left"}
                weight={"semiBold"}
                color={
                  "component-colors-components-buttons-tertiary-error-button-tertiary-error-fg"
                }
              >
                Delete Channel
              </Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}
          <View
            style={{ display: "flex", flexDirection: "row", gap: padding.lg }}
          >
            <Button type={"outline"} weight={"semiBold"} onPress={closeDrawer}>
              Cancel
            </Button>
            <Button weight={"semiBold"} onPress={handleChannelUpdate}>
              Save
            </Button>
          </View>
        </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  channelNameContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: padding.md,
    paddingHorizontal: padding.xl,
    borderWidth: 1,
    borderRadius: borderRadius.md
  },
  channelNameInput: {
    flex: 1,
    paddingVertical: padding.xs
  },
  descriptionInput: {
    paddingVertical: padding.sm
  },
  divider: {
    width: "100%",
    borderWidth: 1
  },
  deleteContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: padding.md
  }
});
