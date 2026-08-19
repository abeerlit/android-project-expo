// React Imports
import React, { useCallback } from "react";
import { useSelector } from "react-redux";
import { useNavigation } from "@react-navigation/core";
import {
  getDisplayName,
  getDisplayNumber
} from "features/inbox/utils/call-utils.ts";
import {
  getDispositionColor,
  getDispositionIcon
} from "features/inbox/utils/call-utils.ts";
import { useTheme } from "hooks/use-theme.ts";
import { fontSize } from "core/theme/theme.ts";
import { formatRelativeTime } from "shared/utils/utils.ts";
import { inboxStyles } from "features/inbox/styles/inbox-styles.ts";
import { useSoftphone } from "core/softphone/useSoftphone.ts";
import { toast } from "@backpackapp-io/react-native-toast";
import { Alert } from "react-native";
import { findContactByPhoneNumber } from "features/calling/utils/contact-lookup.ts";

// Type Imports
import { State } from "store/types.ts";
import { CallData } from "shared/api/inbox/types.ts";

// Component Imports
import { View } from "react-native";
import { Pressable } from "react-native";
import Icon from "shared/components/Icon.tsx";
import { Text } from "shared/components/Text.tsx";
type CallItemProps = {
  item: CallData;
  /** When true, show light red background (e.g. row opened from missed-call notification) */
  highlight?: boolean;
};

export const CallRow = ({ item, highlight = false }: CallItemProps) => {
  // Constants
  const theme = useTheme();
  const navigation = useNavigation();

  const { makeCall, isInitializing, isRegistering, hasOngoingCall } =
    useSoftphone();

  // App State (same sources as InCallScreen / useContactLookup)
  const directory = useSelector(
    ({ directoryReducer }: State) => directoryReducer.directory
  );
  const personalContacts = useSelector(
    ({ directoryReducer }: State) => directoryReducer.personalContacts ?? []
  );
  const companyContacts = useSelector(
    ({ directoryReducer }: State) => directoryReducer.companyContacts ?? []
  );
  const phoneContacts = useSelector(
    ({ directoryReducer }: State) => directoryReducer.phoneContacts ?? []
  );

  const phoneNumber =
    item.direction === "inbound" ? item.callerIdNum : item.dialedNum;

  const displayName = getDisplayName(
    item,
    directory,
    personalContacts,
    companyContacts,
    phoneContacts
  );
  const displayNumber = getDisplayNumber(item);
  const contactInfo = findContactByPhoneNumber(
    phoneNumber || "",
    personalContacts,
    companyContacts,
    directory,
    phoneContacts
  );
  const avatarPath =
    contactInfo?.avatarPath || contactInfo?.avatarThumbnailPath || null;

  const handlePress = useCallback(async () => {
    if (!phoneNumber?.trim()) {
      toast.error("No phone number available for this call");
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
      const callOptions =
        displayName && displayName !== displayNumber
          ? {
              displayName,
              ...(avatarPath ? { avatarPath } : {})
            }
          : undefined;

      // Navigate immediately to show "Dialing..." shell (matches ios-project).
      //@ts-ignore
      navigation.navigate("InCallScreen" as never, {
        callId: "dialing",
        destination: phoneNumber.trim(),
        ...(displayName ? { displayName } : {}),
        ...(avatarPath ? { avatarPath } : {})
      });
      void makeCall(phoneNumber.trim(), callOptions);
    } catch {
      toast.error("Failed to make call");
    }
  }, [
    phoneNumber,
    displayName,
    displayNumber,
    avatarPath,
    isInitializing,
    isRegistering,
    hasOngoingCall,
    makeCall,
    navigation
  ]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        inboxStyles.pressableStyle,
        {
          borderColor: theme.colors["color-colors-border-border-secondary"],
          backgroundColor: pressed
            ? theme.colors["color-colors-background-bg-primary-hover"]
            : highlight
              ? "rgba(255, 0, 0, 0.08)"
              : "transparent"
        }
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon
          name={getDispositionIcon(item.direction)}
          size={25}
          type="outline"
          stroke={getDispositionColor(item.disposition, theme)}
          strokeWidth={1.5}
        />
        <View>
          {displayName && (
            <Text
              size={fontSize.sm}
              style={{
                alignSelf: "flex-start",
                color: theme.colors["color-colors-text-text-primary"]
              }}
            >
              {displayName}
            </Text>
          )}
          <Text
            size={fontSize.sm}
            style={{
              alignSelf: "flex-start",
              color: theme.colors["color-colors-text-text-primary"]
            }}
          >
            {getDisplayNumber(item)}
          </Text>
        </View>
      </View>
      <Text
        size={fontSize.sm}
        style={{ color: theme.colors["color-colors-text-text-primary"] }}
      >
        {formatRelativeTime(item.endTime)}
      </Text>
    </Pressable>
  );
};
