// React Imports
import { useTheme } from "hooks/use-theme.ts";
import { Logger } from "shared/utils/Logger.ts";
import { fontSize, padding } from "core/theme/theme.ts";
import { inboxStyles } from "features/inbox/styles/inbox-styles.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { useNavigation } from "@react-navigation/core";
import { toast } from "@backpackapp-io/react-native-toast";
import { useSoftphone } from "core/softphone/useSoftphone.ts";

// Type Imports
import React, { useCallback } from "react";
import { DirectoryRowProps } from "features/contacts/types/types.ts";
import { ChatNavigationProp } from "features/chat/types.ts";
import { Routes } from "core/navigation/types/types.ts";

// Component Imports
import { Pressable, Alert } from "react-native";
import Icon from "shared/components/Icon.tsx";
import { StyleSheet, View } from "react-native";
import { Text } from "shared/components/Text.tsx";
import { Button } from "shared/components/Button.tsx";
import { UserAvatar } from "features/contacts/components/UserAvatar.tsx";

function DirectoryRow({ item, personal, handlePress }: DirectoryRowProps) {
  // Constants
  const logger = new Logger("DirectoryRow");

  // Hooks
  const theme = useTheme();

  // Prefer thumbnail then full. Only personal (and some) contacts get .../avatars//tmp/xxx URLs
  // from the backend; company contacts get normal .../avatars/<hash>.<ext>. Both are valid S3 URLs.
  const avatarSrc = item.avatarThumbnailPath || item.avatarPath || null;

  // useEffect(() => {
  //   logger.debug("[DirectoryRow] avatar", {
  //     name: item.name,
  //     userId: item.userId,
  //     avatarPath: item.avatarPath ?? "(null/undefined)",
  //     avatarThumbnailPath: item.avatarThumbnailPath ?? "(null/undefined)",
  //     resolvedSrc: avatarSrc ?? "(null/undefined)",
  //     hasSrc: !!avatarSrc
  //   });
  // }, [item.name, item.userId, item.avatarPath, item.avatarThumbnailPath, avatarSrc]);
  const navigation = useNavigation<ChatNavigationProp>();
  const { createOrJoinDMChannel, findExistingDMChannel } = useSendbirdContext();
  const { makeCall, isInitializing, isRegistering, hasOngoingCall } =
    useSoftphone();

  const handleCall = useCallback(async () => {
    logger.debug("Call: ", item);

    if (!item.number) {
      logger.error("No phone number available for calling");
      toast.error("No phone number available");
      return;
    }

    if (isInitializing || isRegistering) {
      toast.error("Softphone is still initializing...");
      return;
    }

    if (hasOngoingCall) {
      Alert.alert(
        "Call in progress",
        "Please end the current call before making a new one."
      );
      return;
    }

    try {
      // Navigate immediately to show "Dialing..." shell (matches ios-project).
      navigation.navigate("InCallScreen", {
        callId: "dialing",
        destination: item.number,
        ...(item.name ? { displayName: item.name } : {}),
        ...(item.avatarPath ? { avatarPath: item.avatarPath } : {})
      });
      void makeCall(item.number, {
        ...(item.name ? { displayName: item.name } : {}),
        ...(item.avatarPath ? { avatarPath: item.avatarPath } : {})
      });
      logger.debug("Call initiated to:", item.number);
    } catch (error) {
      logger.error("Failed to make call:", error);
      toast.error("Failed to make call");
    }
  }, [item, isInitializing, isRegistering, hasOngoingCall, makeCall, navigation]);

  const handleMessage = useCallback(async () => {
    logger.debug("Message: ", item);

    if (!item.userId) {
      logger.error("No user ID available for messaging");
      toast.error("Unable to start chat");
      return;
    }

    try {
      const targetUserId = item.userId.toString();

      // If DM channel with these members already exists in memory, navigate immediately.
      const existing = findExistingDMChannel([targetUserId]);
      if (existing && existing.url) {
        logger.debug(
          "Found existing DM channel, navigating immediately:",
          existing.url
        );
        navigation.navigate(Routes.Chat, { channelUrl: existing.url });
        return;
      }

      const result = await createOrJoinDMChannel([targetUserId]);

      if (result.success && result.channelUrl) {
        logger.debug(
          "Successfully created/joined DM channel:",
          result.channelUrl
        );
        navigation.navigate(Routes.Chat, { channelUrl: result.channelUrl });
      } else {
        logger.error("Failed to create or join DM channel:", result.error);
        toast.error("Failed to start chat");
      }
    } catch (error) {
      logger.error("Error creating or joining DM channel:", error);
      toast.error("Error starting chat");
    }
  }, [item, findExistingDMChannel, createOrJoinDMChannel, navigation]);

  const handlePressItem = useCallback(() => {
    handlePress(item);
  }, [handlePress, item]);

  return (
    <Pressable
      onPress={handlePressItem}
      key={item.userId}
      style={({ pressed }) => [
        inboxStyles.pressableStyle,
        {
          borderColor: theme.colors["color-colors-border-border-secondary"],
          backgroundColor: pressed
            ? theme.colors["color-colors-background-bg-primary-hover"]
            : "transparent"
        }
      ]}
    >
      <View style={styles.container}>
        {/* Avatar / Name */}
        <View style={styles.avatarContainer}>
          <UserAvatar src={avatarSrc} name={item.name} />
          <View style={styles.nameWrapper}>
          <Text
              size={fontSize.sm}
              style={{
                color: theme.colors["color-colors-text-text-primary"],
                marginLeft: 10,
              }}
              weight={"medium"}
              numberOfLines={5}
              align="left"
            >
              {item.name}
            </Text>
          </View>
        </View>
        <View
          style={styles.nameContainer}
          onStartShouldSetResponder={() => true}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {!personal && (
            <Button type={"text"} onPress={handleMessage}>
              <Icon name={"message-text-square-01"} size={20} />
            </Button>
          )}
          <Button type={"text"} onPress={handleCall}>
            <Icon name={"phone"} size={20} />
          </Button>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "space-between"
  },
  avatarContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: padding.lg,
    flex: 1,
    minWidth: 0
  },
  nameWrapper: {
    flex: 1,
    justifyContent: "flex-start"
  },
  nameContainer: {
    flexDirection: "row",
    gap: padding.xs,
    flexShrink: 0,
    alignSelf: "flex-start",
    paddingTop: 2
  }
});

export const DirectoryRowMemoized = React.memo(
  DirectoryRow,
  (prevProps, nextProps) => {
    return (
      prevProps.item.userId === nextProps.item.userId &&
      prevProps.item.avatarPath === nextProps.item.avatarPath &&
      prevProps.item.avatarThumbnailPath ===
        nextProps.item.avatarThumbnailPath &&
      prevProps.item.name === nextProps.item.name &&
      prevProps.personal === nextProps.personal
    );
  }
);
