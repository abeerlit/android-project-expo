// React Import
import { borderRadius, padding } from "core/theme/theme.ts";
import { phoneNumberFormatter } from "shared/utils/utils.ts";
import { useSoftphone } from "core/softphone/useSoftphone.ts";
import { Logger } from "shared/utils/Logger.ts";
import { toast } from "@backpackapp-io/react-native-toast";

// Type Import
import React from "react";

// Component Import
import { StyleSheet, View, Pressable, Alert } from "react-native";
import Icon from "shared/components/Icon.tsx";
import { Text } from "shared/components/Text.tsx";

export const ContactInfo = ({
  item,
  keyBy,
  backgroundColor,
  iconColor,
  header,
  icon
}: {
  item: string | number | string[] | null;
  keyBy: string;
  backgroundColor: string;
  iconColor: string;
  header: string;
  icon: string;
}) => {
  const logger = new Logger("ContactInfo");
  const { makeCall, isInitializing, isRegistering, hasOngoingCall } =
    useSoftphone();

  if (!item) return null;

  const isPhoneNumber = keyBy === "number";
  const displayText = isPhoneNumber
    ? phoneNumberFormatter(item as string)
    : item;

  const handlePhonePress = async () => {
    if (!isPhoneNumber || !item) return;

    const phoneNumber = item as string;

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
      // @ts-ignore
      navigation.navigate("InCallScreen" as never, {
        callId: "dialing",
        destination: phoneNumber
      });
      void makeCall(phoneNumber);
      logger.debug("Call initiated to:", phoneNumber);
    } catch (error) {
      logger.error("Failed to make call:", error);
      toast.error("Failed to make call");
    }
  };

  const ContentView = isPhoneNumber ? Pressable : View;

  return (
    <ContentView
      style={styles.container}
      onPress={isPhoneNumber ? handlePhonePress : undefined}
    >
      {/* Icon */}
      <View
        style={[{ backgroundColor: backgroundColor }, styles.iconContainer]}
      >
        <Icon name={icon} size={24} color={iconColor} />
      </View>

      {/* Header / Subtext */}
      <View style={{ alignItems: "flex-start" }}>
        <Text color={"color-colors-text-text-secondary"} weight={"semiBold"}>
          {header}
        </Text>
        <Text
          color={
            isPhoneNumber
              ? "color-colors-text-text-brand-secondary"
              : "color-colors-text-text-tertiary"
          }
          style={
            isPhoneNumber ? { textDecorationLine: "underline" } : undefined
          }
        >
          {displayText}
        </Text>
      </View>
    </ContentView>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: "row", gap: padding.lg, alignItems: "center" },
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    width: 48,
    borderRadius: borderRadius.full
  }
});
