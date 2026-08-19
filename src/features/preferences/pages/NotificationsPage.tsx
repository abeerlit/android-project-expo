import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Switch,
  Platform,
  StyleProp,
  ViewStyle,
  NativeModules
} from "react-native";
import { useSelector, useDispatch } from "react-redux";
import { toast } from "@backpackapp-io/react-native-toast";

import { useTheme } from "hooks/use-theme.ts";
import { updateUser } from "store/users/actions.ts";
import {
  patchCallNotifications,
  patchChatNotifications,
  patchTextNotifications
} from "shared/api/users/methods.ts";
import { handleApiError } from "shared/api/utils/api-error-wrapper.ts";
import { ChatNotifications } from "shared/api/users/types.ts";
import { Text } from "shared/components/Text.tsx";
import { fontSize } from "core/theme/theme.ts";
import { Logger } from "shared/utils/Logger.ts";
import { State } from "store/types.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { useNotifications } from "hooks/use-notifications.ts";
import { usePermissions } from "core/permissions/use-permissions.ts";
import { PushTriggerOption } from "@sendbird/chat";

// Types
type MessageNotificationType = "all" | "direct" | "none";

interface SettingsListItemProps {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  isFirst?: boolean;
  isLast?: boolean;
  style?: StyleProp<ViewStyle>;
}

interface SettingsSectionProps {
  title?: string;
  footer?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const SettingsListItem: React.FC<SettingsListItemProps> = ({
  title,
  subtitle,
  value,
  onValueChange,
  isFirst = false,
  isLast = false,
  style = {}
}) => {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.listItem,
        {
          backgroundColor: theme.colors["color-colors-background-bg-primary"],
          borderTopLeftRadius: isFirst ? 10 : 0,
          borderTopRightRadius: isFirst ? 10 : 0,
          borderBottomLeftRadius: isLast ? 10 : 0,
          borderBottomRightRadius: isLast ? 10 : 0,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor:
            theme.colors["color-colors-border-border-disabled-subtle"]
        },
        style
      ]}
    >
      <View style={styles.listItemContent}>
        <View style={styles.listItemText}>
          <Text
            weight="regular"
            size={fontSize.md}
            color="primary"
            align="left"
            style={styles.listItemTitle}
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              weight="regular"
              size={fontSize.sm}
              color="color-colors-text-text-secondary"
              align="left"
              style={styles.listItemSubtitle}
            >
              {subtitle}
            </Text>
          )}
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{
            false: theme.colors["color-colors-border-border-disabled-subtle"],
            true: theme.colors["colors-background-bg-brand-solid"]
          }}
        />
      </View>
    </View>
  );
};

const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  footer,
  children
}) => {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      {title && (
        <Text
          weight="medium"
          size={fontSize.sm}
          color="color-colors-text-text-secondary"
          align="left"
          style={styles.sectionHeader}
        >
          {title}
        </Text>
      )}
      <View
        style={[
          styles.sectionContent,
          {
            backgroundColor: theme.colors["color-colors-background-bg-primary"],
            borderRadius: 10
          }
        ]}
      >
        {children}
      </View>
      {footer && (
        <Text
          weight="regular"
          size={fontSize.sm}
          color="color-colors-text-text-tertiary"
          align="left"
          style={styles.sectionFooter}
        >
          {footer}
        </Text>
      )}
    </View>
  );
};

export const NotificationsPage: React.FC = () => {
  // Constants
  const logger = new Logger("NotificationsPage");

  // Hooks
  const theme = useTheme();
  const dispatch = useDispatch();
  const user = useSelector(({ userReducer }: State) => userReducer.user);
  const accessToken = useSelector(
    ({ authReducer }: State) => authReducer.accessToken
  );
  const { setPushNotification, sendbirdInstance } = useSendbirdContext();
  const { tokens } = useNotifications();
  const { permissions } = usePermissions();

  // State
  const [incomingCallsEnabled, setIncomingCallsEnabled] = useState(false);
  const [chatMessagesEnabled, setChatMessagesEnabled] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [messageNotificationType, setMessageNotificationType] =
    useState<MessageNotificationType>("none");
  const [hasAutoEnabled, setHasAutoEnabled] = useState(false);

  useEffect(() => {
    if (user) {
      const notificationPermissionGranted =
        permissions.notifications?.granted ?? false;
      logger.debug(
        "🔔 [NotificationsPage] Initializing notification preferences",
        {
          notificationPermissionGranted,
          currentChatEnabled: user.enableChatNotifications,
          currentSMSEnabled: user.enableMobileTextNotifications,
          currentCallEnabled: user.enableMobileCallNotifications,
          hasNeverSetPreference:
            user.enableChatNotifications === null ||
            user.enableChatNotifications === undefined,
          willAutoEnable: false
        }
      );

      setIncomingCallsEnabled(!!user.enableMobileCallNotifications);
      setChatMessagesEnabled(!!user.enableChatNotifications);
      // Same as chat/call flags: 1 = ON, 0 = OFF
      setSmsEnabled(user.enableMobileTextNotifications === 1);
      setMessageNotificationType(user.enableChatNotifications ? "all" : "none");
      const hasNeverSetPreference =
        user.enableChatNotifications === null ||
        user.enableChatNotifications === undefined;

      if (Platform.OS === "ios") {
        if (chatMessagesEnabled) {
          sendbirdInstance?.setPushTriggerOption(PushTriggerOption.ALL);
        } else {
          sendbirdInstance?.setPushTriggerOption(PushTriggerOption.OFF);
        }
      }

      if (
        notificationPermissionGranted &&
        hasNeverSetPreference &&
        !hasAutoEnabled &&
        accessToken
      ) {
        const autoEnableChat = async () => {
          try {
            const chatSettings: ChatNotifications = {
              enableChatNotifications: 1,
              enableAllNewMessageNotifications: 1,
              enableDirectMessageNotifications: 0
            };

            await patchChatNotifications(chatSettings, accessToken);

            dispatch(
              updateUser({
                enableChatNotifications: 1,
                enableAllNewMessageNotifications: 1,
                enableDirectMessageNotifications: 0
              })
            );

            setChatMessagesEnabled(true);
            setMessageNotificationType("all");
            setHasAutoEnabled(true);

            tokens.forEach((token) => {
              if (
                token.tokenType === "android_fcm" ||
                token.tokenType === "ios_remote_notifications"
              ) {
                void setPushNotification(
                  true,
                  Platform.OS === "ios" ? "ios" : "android",
                  token.token
                );
              }
            });
          } catch (error) {
            logger.error(
              "❌ [NotificationsPage] Failed to auto-enable chat notifications",
              error
            );
          }
        };

        void autoEnableChat();
      }
    }
  }, [
    user,
    permissions.notifications?.granted,
    hasAutoEnabled,
    accessToken,
    dispatch,
    tokens,
    setPushNotification
  ]);

  // Handlers
  const handleCallNotificationsToggle = useCallback(
    async (value: boolean) => {
      try {
        setIncomingCallsEnabled(value);
        await patchCallNotifications(value ? 1 : 0, accessToken);

        dispatch(
          updateUser({
            enableMobileCallNotifications: value ? 1 : 0
          })
        );
        if (Platform.OS === "android") {
          NativeModules.VoxoConnectAndroidNotifications?.setEnableMobileCallNotifications?.(
            value
          );
        }
        toast.success("Call notification settings updated");
      } catch (error) {
        logger.error(
          "❌ [NotificationsPage] Failed to update call notifications",
          error
        );
        setIncomingCallsEnabled(!value);
        handleApiError(error as any);
      }
    },
    [accessToken, dispatch, incomingCallsEnabled]
  );

  const handleChatNotificationsToggle = useCallback(
    async (value: boolean) => {
      try {
        setChatMessagesEnabled(value);

        if (value && messageNotificationType === "none") {
          setMessageNotificationType("all");
        }

        const chatSettings: ChatNotifications = {
          enableChatNotifications: value ? 1 : 0,
          enableAllNewMessageNotifications:
            messageNotificationType === "all" ? 1 : 0,
          enableDirectMessageNotifications:
            messageNotificationType === "direct" ? 1 : 0
        };

        const pushTriggerOption = value
          ? PushTriggerOption.ALL
          : PushTriggerOption.OFF;

        if (Platform.OS === "ios") {
          sendbirdInstance
            ?.setPushTriggerOption(pushTriggerOption)
            .then((res) => {
              logger.debug("Push trigger option set to OFF", res);
            })
            .catch((error) => {
              logger.error("Error setting push trigger option to OFF", error);
            });
        }

        await patchChatNotifications(chatSettings, accessToken);

        dispatch(
          updateUser({
            enableChatNotifications: value ? 1 : 0
          })
        );

        let registeredCount = 0;
        let unregisteredCount = 0;

        tokens.forEach((token) => {
          if (
            token.tokenType === "android_fcm" ||
            token.tokenType === "ios_remote_notifications"
          ) {
            void setPushNotification(
              value,
              Platform.OS === "ios" ? "ios" : "android",
              token.token
            );

            if (value) {
              registeredCount++;
            } else {
              unregisteredCount++;
            }
          }
        });

        logger.debug("✅ [NotificationsPage] Chat notifications updated", {
          enabled: value,
          registeredTokens: registeredCount,
          unregisteredTokens: unregisteredCount,
          totalTokens: tokens.length
        });

        toast.success("Chat notification settings updated");
      } catch (error) {
        logger.error(
          "❌ [NotificationsPage] Failed to update chat notifications",
          error
        );
        setChatMessagesEnabled(!value);
        handleApiError(error as any);
      }
    },
    [
      messageNotificationType,
      accessToken,
      dispatch,
      setPushNotification,
      tokens,
      chatMessagesEnabled
    ]
  );

  const handleSmsNotificationsToggle = useCallback(
    async (value: boolean) => {
      logger.debug("🔄 [NotificationsPage] SMS notifications toggle", {
        newValue: value,
        previousValue: smsEnabled
      });

      try {
        setSmsEnabled(value);
        const apiValue = value ? 1 : 0;
        const response = await patchTextNotifications(apiValue, accessToken);
        logger.debug("Notification Settings Response: ", response);

        dispatch(
          updateUser({
            enableMobileTextNotifications: apiValue
          })
        );

        logger.debug("✅ [NotificationsPage] SMS notifications updated", {
          enabled: value
        });

        toast.success("SMS notification settings updated");
      } catch (error) {
        logger.error(
          "❌ [NotificationsPage] Failed to update SMS notifications",
          error
        );
        setSmsEnabled(!value);
        handleApiError(error as any);
      }
    },
    [accessToken, dispatch, smsEnabled]
  );

  const handleAllNewMessagesToggle = useCallback(
    async (value: boolean) => {
      logger.debug("🔄 [NotificationsPage] All New Messages toggle", {
        newValue: value,
        previousValue: user?.enableAllNewMessageNotifications === 1
      });

      try {
        const newAllEnabled = value ? 1 : 0;
        const directEnabled = user?.enableDirectMessageNotifications || 0;

        const chatSettings: ChatNotifications = {
          enableChatNotifications: 1,
          enableAllNewMessageNotifications: newAllEnabled,
          enableDirectMessageNotifications: value ? 0 : directEnabled
        };

        logger.debug(
          "📤 [NotificationsPage] Updating all new messages settings",
          chatSettings
        );

        await patchChatNotifications(chatSettings, accessToken);

        dispatch(
          updateUser({
            enableChatNotifications: 1,
            enableAllNewMessageNotifications: newAllEnabled,
            enableDirectMessageNotifications: value ? 0 : directEnabled
          })
        );

        logger.debug(
          "✅ [NotificationsPage] All new messages settings updated",
          {
            enabled: value
          }
        );

        toast.success("Chat notification settings updated");
      } catch (error) {
        logger.error(
          "❌ [NotificationsPage] Failed to update all new messages",
          error
        );
        handleApiError(error as any);
      }
    },
    [user, accessToken, dispatch]
  );

  const handleDirectMessagesToggle = useCallback(
    async (value: boolean) => {
      try {
        const newDirectEnabled = value ? 1 : 0;
        const allEnabled = user?.enableAllNewMessageNotifications || 0;

        const chatSettings: ChatNotifications = {
          enableChatNotifications: 1,
          enableAllNewMessageNotifications: value ? 0 : allEnabled,
          enableDirectMessageNotifications: newDirectEnabled
        };

        logger.debug(
          "📤 [NotificationsPage] Updating direct messages settings",
          chatSettings
        );

        await patchChatNotifications(chatSettings, accessToken);

        dispatch(
          updateUser({
            enableChatNotifications: 1,
            enableAllNewMessageNotifications: value ? 0 : allEnabled,
            enableDirectMessageNotifications: newDirectEnabled
          })
        );

        logger.debug(
          "✅ [NotificationsPage] Direct messages settings updated",
          {
            enabled: value
          }
        );

        toast.success("Chat notification settings updated");
      } catch (error) {
        logger.error(
          "❌ [NotificationsPage] Failed to update direct messages",
          error
        );
        handleApiError(error as any);
      }
    },
    [user, accessToken, dispatch]
  );

  return (
    <ScrollView
      style={[
        styles.container,
        {
          backgroundColor: theme.colors["color-colors-background-bg-primary"]
        }
      ]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <SettingsSection
        title="NOTIFICATIONS"
        footer="Choose what notifications you'd like to receive"
      >
        <SettingsListItem
          title="Incoming Calls"
          subtitle="Get notified when someone calls you"
          value={incomingCallsEnabled}
          onValueChange={handleCallNotificationsToggle}
          isFirst={true}
        />

        <SettingsListItem
          title="All New Messages"
          subtitle="Receive notifications for new messages"
          value={chatMessagesEnabled}
          onValueChange={handleChatNotificationsToggle}
        />

        {chatMessagesEnabled && (
          <>
            <SettingsListItem
              title="Chat Messages"
              style={{ marginLeft: 16 }}
              subtitle="Notify me about all new messages"
              value={user?.enableAllNewMessageNotifications === 1}
              onValueChange={handleAllNewMessagesToggle}
            />

            <SettingsListItem
              title="Direct Messages Only"
              style={{ marginLeft: 16 }}
              subtitle="Notify me only about direct messages and mentions"
              value={user?.enableDirectMessageNotifications === 1}
              onValueChange={handleDirectMessagesToggle}
              isLast={true}
            />
          </>
        )}

        {!chatMessagesEnabled && (
          <SettingsListItem
            title="SMS Messages"
            subtitle="Get notified for incoming SMS"
            value={smsEnabled}
            onValueChange={handleSmsNotificationsToggle}
            isLast={true}
          />
        )}
      </SettingsSection>

      {chatMessagesEnabled && (
        <SettingsSection>
          <SettingsListItem
            title="SMS Messages"
            subtitle="Get notified for incoming SMS"
            value={smsEnabled}
            onValueChange={handleSmsNotificationsToggle}
            isFirst={true}
            isLast={true}
          />
        </SettingsSection>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  scrollContent: {
    paddingVertical: 20,
    paddingBottom: 40
  },
  section: {
    marginBottom: 32
  },
  sectionHeader: {
    marginTop: 8,
    marginBottom: 8,
    marginLeft: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  sectionContent: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1
  },
  sectionFooter: {
    marginTop: 8,
    marginHorizontal: 16,
    lineHeight: 16
  },
  listItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44
  },
  listItemContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flex: 1
  },
  listItemText: {
    flex: 1,
    marginRight: 12
  },
  listItemTitle: {
    fontSize: 17,
    lineHeight: 22,
    marginBottom: 2
  },
  listItemSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.6
  }
});

export default NotificationsPage;
