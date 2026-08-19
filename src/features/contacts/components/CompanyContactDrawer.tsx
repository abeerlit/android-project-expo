// React Imports
import { useState } from "react";
import { DateTime } from "luxon";
import { useTheme } from "hooks/use-theme.ts";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";
import { Logger } from "shared/utils/Logger.ts";
import { useSoftphone } from "core/softphone/useSoftphone.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { useNavigation } from "@react-navigation/core";
import { toast } from "@backpackapp-io/react-native-toast";
import { useDrawer } from "core/drawer/DrawerContext.tsx";

// Type Imports
import React from "react";
import { CompanyContact } from "shared/api/directory/types.ts";
import { ChatNavigationProp } from "features/chat/types.ts";
import { Routes } from "core/navigation/types/types.ts";

// Component Imports
import { View, Alert } from "react-native";
import Icon from "shared/components/Icon.tsx";
import { Text } from "shared/components/Text.tsx";
import { Button } from "shared/components/Button.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { ContactDrawerAvatar } from "features/contacts/components/ContactDrawerAvatar.tsx";
import { ContactDrawerBanner } from "features/contacts/components/ContactDrawerBanner.tsx";

type ContactDrawerProps = {
  item: CompanyContact;
};

export const CompanyContactDrawer = ({ item }: ContactDrawerProps) => {
  // Constants
  const logger = new Logger("CompanyContactDrawer");
  const { closeDrawer } = useDrawer();
  const navigation = useNavigation<ChatNavigationProp>();
  const { makeCall, isInitializing, isRegistering, hasOngoingCall } =
    useSoftphone();
  const { createOrJoinDMChannel } = useSendbirdContext();
  // Constants
  type ContactInfoItem = {
    key: keyof CompanyContact;
    header: string;
    icon: string;
    iconColor: keyof typeof theme.colors;
    backgroundColor: keyof typeof theme.colors;
  };

  const contactInfoItems: ContactInfoItem[] = [
    {
      key: "email",
      header: "Email Address",
      icon: "mail-03",
      iconColor:
        "color-component-colors-components-icons-featured-icons-light-featured-icon-light-fg-gray",
      backgroundColor: "colors-background-bg-tertiary"
    },
    {
      key: "number",
      header: "Extension Number",
      icon: "phone",
      iconColor:
        "color-component-colors-components-icons-featured-icons-light-featured-icon-light-fg-brand",
      backgroundColor: "colors-background-bg-brand-secondary"
    },
    {
      key: "company",
      header: "Branch",
      icon: "building-04",
      iconColor:
        "color-component-colors-components-icons-featured-icons-light-featured-icon-light-fg-success",
      backgroundColor: "colors-background-bg-success-secondary"
    }
  ];

  // Hooks
  const theme = useTheme();

  // Local State
  const [localTime, setLocalTime] = useState<string | null>(null);

  const ContactInfo = ({
    item,
    backgroundColor,
    iconColor,
    header,
    icon
  }: {
    item: string | number | string[] | null;
    backgroundColor: string;
    iconColor: string;
    header: string;
    icon: string;
  }) => {
    if (!item) return null;

    return (
      <View
        style={{ flexDirection: "row", gap: padding.lg, alignItems: "center" }}
      >
        {/* Icon */}
        <View
          style={{
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: backgroundColor,
            height: 48,
            width: 48,
            borderRadius: borderRadius.full
          }}
        >
          <Icon name={icon} size={24} color={iconColor} />
        </View>

        {/* Header / Subtext */}
        <View style={{ alignItems: "flex-start" }}>
          <Text color={"color-colors-text-text-secondary"} weight={"semiBold"}>
            {header}
          </Text>
          <Text color={"color-colors-text-text-tertiary"}>{item}</Text>
        </View>
      </View>
    );
  };

  useState(() => {
    if (item && item.timezone) {
      const time = DateTime.now()
        .setZone(item.timezone)
        .toLocaleString(DateTime.TIME_SIMPLE);

      setLocalTime(time);
    }
  });

  const handleCall = async () => {
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
      // @ts-ignore
      navigation.navigate("InCallScreen" as never, {
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
      closeDrawer();
    } catch (error) {
      logger.error("Failed to make call:", error);
      toast.error("Failed to make call");
    }
  };

  const handleChat = async () => {
    if (!item.userId) {
      logger.error("No user ID available for messaging");
      toast.error("Unable to start chat");
      return;
    }

    try {
      const result = await createOrJoinDMChannel([item.userId.toString()]);

      if (result.success && result.channelUrl) {
        logger.debug(
          "Successfully created/joined DM channel:",
          result.channelUrl
        );
        closeDrawer();
        navigation.navigate(Routes.Chat, { channelUrl: result.channelUrl });
      } else {
        logger.error("Failed to create or join DM channel:", result.error);
        toast.error("Failed to start chat");
      }
    } catch (error) {
      logger.error("Error creating or joining DM channel:", error);
      toast.error("Error starting chat");
    }
  };

  return (
    <View>
      <WhiteSpace height={3} />

      {/* Avatar / Banner */}
      <Text
        size={fontSize.lg}
        style={{
          fontWeight: "600",
          marginBottom: 20,
          color: theme.colors["color-colors-text-text-primary"],
          borderColor: theme.colors["color-colors-border-border-secondary"]
        }}
      >
        Profile
      </Text>

      <ContactDrawerBanner src={item.coverPhoto} />

      {/* Actions (Call / Chat) */}
      <View style={{ paddingHorizontal: padding["3xl"] }}>
        <View
          style={{
            flexDirection: "column",
            gap: padding["3xl"]
          }}
        >
          <View style={{ marginTop: -50 }}>
            <ContactDrawerAvatar
              src={item.avatarPath}
              name={item.name}
              size={100}
            />
          </View>

          <View style={{ flexDirection: "column", gap: padding.sm }}>
            <Text weight={"semiBold"} size={fontSize["2xl"]} align={"left"}>
              {item.name}
            </Text>
          </View>

          <View
            style={{ flexDirection: "row", gap: padding.sm, width: "100%" }}
          >
            <Button
              iconSpacing={5}
              type={"outline"}
              icon={<Icon name={"phone"} size={16} />}
              style={{ width: "50%" }}
              onPress={handleCall}
            >
              Call
            </Button>
            <Button
              iconSpacing={5}
              type={"outline"}
              icon={<Icon name={"message-text-square-01"} size={16} />}
              style={{ width: "50%" }}
              onPress={handleChat}
            >
              Chat
            </Button>
          </View>

          {localTime ? (
            <View
              style={{
                flexDirection: "row",
                gap: padding.sm,
                paddingBottom: padding["3xl"],
                borderBottomWidth: 1,
                borderBottomColor:
                  theme.colors["color-colors-border-border-secondary"]
              }}
            >
              <Icon name={"clock"} size={16} />
              <Text
                align={"left"}
                style={{
                  color: theme.colors["color-colors-text-text-tertiary"]
                }}
              >
                {localTime} local time
              </Text>
            </View>
          ) : undefined}
        </View>

        {/* Contact Info */}
        <View style={{ paddingTop: padding["3xl"], gap: padding["2xl"] }}>
          {contactInfoItems.map((info, index) => (
            <ContactInfo
              key={index}
              item={item[info.key]}
              backgroundColor={theme.colors[info.backgroundColor]}
              iconColor={theme.colors[info.iconColor]}
              header={info.header}
              icon={info.icon}
            />
          ))}
        </View>
      </View>
    </View>
  );
};
