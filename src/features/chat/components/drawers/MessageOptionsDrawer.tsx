// React Imports
import React from "react";
import { View, TouchableOpacity, Platform, Alert } from "react-native";
import { useSelector } from "react-redux";
import { useTheme } from "hooks/use-theme.ts";
import { EditorBridge } from "@10play/tentap-editor";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";

// Utils & Constants
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";
import { ChatMessage, ThreadsNavigationProp } from "features/chat/types.ts";
import { State } from "store/types.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { RichEditorContextType } from "features/chat/rich-editor/context/RichEditorContext.ts";
import { toast } from "@backpackapp-io/react-native-toast";
import { AddReactionDrawer } from "features/chat/components/drawers/AddReactionDrawer.tsx";
import Clipboard from "@react-native-clipboard/clipboard";
import { isHtml } from "shared/utils/utils.ts";
import { useNavigation } from "@react-navigation/core";
import { Routes } from "core/navigation/types/types.ts";

// Types
interface MessageOptionsDrawerProps {
  message: ChatMessage;
  setEditing: RichEditorContextType["setEditing"];
  editor?: EditorBridge;
  /** When true, hides "Reply in thread" option (already viewing a thread). */
  isInThread?: boolean;
}

export const MessageOptionsDrawer: React.FC<MessageOptionsDrawerProps> = ({
  message,
  setEditing,
  editor,
  isInThread = false
}) => {
  const theme = useTheme();
  const { closeDrawer, openDrawer } = useDrawer();
  const { user } = useSelector(({ userReducer }: State) => userReducer);
  const { reactionEvent, deleteUserMessage, currentChannel } =
    useSendbirdContext();

  const navigation = useNavigation<ThreadsNavigationProp>();

  const emojis = ["❤️", "😆", "😀", "👍", "👎"];

  // Check if current user is the message sender
  const isMessageFromCurrentUser =
    message.sender?.userId === user?.id?.toString();

  const canEditMessage =
    isMessageFromCurrentUser &&
    message.customType !== "MESSAGE_GIF" &&
    message.customType !== "MEETING_INVITE";

  const confirmDeleteMessage = () => {
    closeDrawer();
    requestAnimationFrame(() => {
      Alert.alert(
        "Delete message",
        "Are you sure you want to delete this message? This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              if (currentChannel) {
                void deleteUserMessage(message, currentChannel.url);
              }
            }
          }
        ]
      );
    });
  };

  const handleAddReactionDrawer = () => {
    closeDrawer();
    const handleEmojiReaction = async (emoji: string) => {
      if (user?.id) {
        await reactionEvent(message, emoji, user.id.toString());
      }
    };

    openDrawer(<AddReactionDrawer onEmojiSelect={handleEmojiReaction} />), 0.9;
  };

  const menuOptions = [
    ...(!isInThread
      ? [
          {
            icon: "message-text-square-02",
            text: "Reply in thread",
            onPress: () => {
              if (message) {
                closeDrawer();
                navigation.navigate(Routes.Threads, {
                  channelUrl: message.channelUrl,
                  parentMessage: message,
                  offset: 10
                });
              }
            }
          }
        ]
      : []),
    ...(message.isUserMessage() && message.customType !== "MESSAGE_GIF"
      ? [
          {
            icon: "copy-03",
            text: "Copy",
            onPress: () => {
              if (message.customType === "MEETING_INVITE") {
                Clipboard.setString(
                  message.metaArrays?.find((meta) => meta.key === "meetURL")
                    ?.value?.[0] ?? ""
                );
                toast.success("Meet link copied to clipboard!");
              } else if (message.message && isHtml(message.message)) {
                Clipboard.setString(
                  message.message
                    .replace(/<[^>]+>/g, "")
                    .replace(/&nbsp;/g, " ")
                );
                toast.success("Message copied to clipboard!");
              }
              closeDrawer();
              // Refocus editor after copy on Android to fix focus issue
              if (Platform.OS === "android" && editor) {
                // Wait for drawer animation to complete, then blur and refocus
                setTimeout(() => {
                  editor.blur();
                  setTimeout(() => {
                    editor.focus();
                  }, 100);
                }, 500);
              }
            }
          }
        ]
      : []),
    ...(canEditMessage
      ? [
          {
            icon: "edit-05",
            text: "Edit message",
            onPress: () => {
              if (setEditing) {
                console.log("[Edit Button] Setting edit message:", message);
                console.log("[Edit Button] Message ID:", message.messageId);
                console.log(
                  "[Edit Button] Parent Message ID:",
                  message.parentMessageId
                );
                setEditing(message);
                closeDrawer();
              } else {
                toast.error("Error editing message");
              }
            }
          }
        ]
      : []),
    ...(isMessageFromCurrentUser
      ? [
          {
            icon: "trash-03",
            text: "Delete message",
            onPress: () => {
              confirmDeleteMessage();
            }
          }
        ]
      : [])
  ];

  return (
    <View style={{ paddingHorizontal: padding.xl }}>
      {/* Emoji Reactions Row */}
      <View
        style={{
          display: "flex",
          justifyContent: "space-between",
          flexDirection: "row",
          alignItems: "center",
          marginBottom: padding.xl
        }}
      >
        {emojis.map((emoji, index) => (
          <TouchableOpacity
            key={index}
            style={{
              backgroundColor:
                theme.colors["component-colors-components-avatars-avatar-bg"],
              borderRadius: borderRadius.full,
              padding: padding.lg
            }}
            onPress={async () => {
              if (user?.id) {
                await reactionEvent(message, emoji, user.id.toString());
                closeDrawer();
              }
            }}
          >
            <Text size={fontSize["2xl"]}>{emoji}</Text>
          </TouchableOpacity>
        ))}

        {/* Add Reaction Button */}
        <TouchableOpacity
          style={{
            backgroundColor:
              theme.colors["component-colors-components-avatars-avatar-bg"],
            borderRadius: borderRadius.full,
            padding: padding.lg
          }}
          onPress={handleAddReactionDrawer}
        >
          <Icon
            name="plus"
            size={24}
            color={
              theme.colors[
                "component-colors-components-application-navigation-nav-item-button-icon-fg"
              ]
            }
          />
        </TouchableOpacity>
      </View>

      {/* Divider */}
      <View
        style={{
          borderStyle: "solid",
          borderWidth: 0.5,
          borderColor: theme.colors["color-colors-border-border-secondary"],
          marginBottom: padding.xl
        }}
      />

      {/* Menu Options */}
      {menuOptions.map((option, index) => (
        <TouchableOpacity
          key={index}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: padding.lg
          }}
          onPress={option.onPress}
        >
          <Icon
            name={option.icon}
            size={16}
            color={theme.colors["color-colors-text-text-primary"]}
          />
          <View style={{ width: padding.md }} />
          <Text
            size={fontSize.sm}
            weight="medium"
            color="color-colors-text-text-primary"
          >
            {option.text}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};
