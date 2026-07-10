// React Imports
import { useTheme } from "hooks/use-theme.ts";
import { Logger } from "shared/utils/Logger.ts";
import { useDispatch, useSelector } from "react-redux";
import { fontSize, padding } from "core/theme/theme.ts";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import * as directoryActions from "store/directory/actions.ts";
import * as textActions from "store/text/actions.ts";
import { deletePersonalContact } from "shared/api/directory/methods.ts";
import { useSoftphone } from "core/softphone/useSoftphone.ts";
// import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { useNavigation } from "@react-navigation/core";
import { toast } from "@backpackapp-io/react-native-toast";
import { getConversationsByParticipants } from "shared/api/messaging/methods.ts";
import { stripPhoneNumber } from "shared/utils/formatters.ts";

// Type Imports
import React from "react";
import { State } from "store/types.ts";
import { PersonalContact } from "shared/api/directory/types.ts";
import { Contact } from "features/contacts/types/types.ts";
import { ChatNavigationProp } from "features/chat/types.ts";
import { Routes } from "core/navigation/types/types.ts";

// Component Imports
import { View, Alert } from "react-native";
import Icon from "shared/components/Icon.tsx";
import { Text } from "shared/components/Text.tsx";
import { Button } from "shared/components/Button.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { ContactInfo } from "features/contacts/components/ContactInfo.tsx";
import { ContactDrawerAvatar } from "features/contacts/components/ContactDrawerAvatar.tsx";
import { PersonalContactForm } from "features/contacts/components/PersonalContactForm.tsx";
import { ContactDrawerBanner } from "features/contacts/components/ContactDrawerBanner.tsx";

type PersonalContactDrawerProps = {
  /** Saved personal contacts or device phone rows (not directory company users). */
  item: Contact;
};

export const PersonalContactDrawer = ({ item }: PersonalContactDrawerProps) => {
  // Constants
  const { openDrawer, closeDrawer } = useDrawer();
  const dispatch = useDispatch();
  const logger = new Logger("PersonalContactDrawer: ");

  // Hooks
  const theme = useTheme();
  const navigation = useNavigation<ChatNavigationProp>();
  const { makeCall, isInitializing, isRegistering, hasOngoingCall } =
    useSoftphone();
  // const { createOrJoinDMChannel } = useSendbirdContext();

  // App State
  const token = useSelector(
    ({ authReducer }: State) => authReducer.accessToken
  );
  const { selectedDidNumber } = useSelector(
    (state: State) => state.textReducer
  );

  const persistedPersonalId =
    "id" in item && typeof (item as PersonalContact).id === "number"
      ? (item as PersonalContact).id
      : undefined;
  const canEditOrDelete =
    persistedPersonalId != null && persistedPersonalId > 0;

  const contactInfoItems = [
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
      header: "Phone Number",
      icon: "phone",
      iconColor:
        "color-component-colors-components-icons-featured-icons-light-featured-icon-light-fg-brand",
      backgroundColor: "colors-background-bg-brand-secondary"
    },
    {
      key: "company",
      header: "Company",
      icon: "building-04",
      iconColor:
        "color-component-colors-components-icons-featured-icons-light-featured-icon-light-fg-success",
      backgroundColor: "colors-background-bg-success-secondary"
    }
  ] as const;

  const handleCloseDrawer = () => {
    closeDrawer();
    dispatch({ type: directoryActions.FETCH_PERSONAL_CONTACTS });
  };

  const handleEditDrawer = () => {
    if (!canEditOrDelete || persistedPersonalId == null) return;
    openDrawer(
      <PersonalContactForm
        context={"edit"}
        contactId={persistedPersonalId}
        onSubmit={handleCloseDrawer}
      />
    );
  };

  const handleDelete = async () => {
    if (!canEditOrDelete || persistedPersonalId == null) return;
    try {
      await deletePersonalContact(token, persistedPersonalId);
      handleCloseDrawer();
    } catch (e) {
      logger.error("deletePersonalContact() error: ", e);
    }
  };

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
    // First try Sendbird DM if user has a userId (internal user)
    // if (item.userId) {
    //   try {
    //     const result = await createOrJoinDMChannel([item.userId.toString()]);

    //     if (result.success && result.channelUrl) {
    //       logger.debug(
    //         "Successfully created/joined DM channel:",
    //         result.channelUrl
    //       );
    //       closeDrawer();
    //       navigation.navigate(Routes.Chat, { channelUrl: result.channelUrl });
    //     } else {
    //       logger.error("Failed to create or join DM channel:", result.error);
    //       toast.error("Failed to start chat");
    //     }
    //   } catch (error) {
    //     logger.error("Error creating or joining DM channel:", error);
    //     toast.error("Error starting chat");
    //   }
    //   return;
    // }

    // If no userId but has phone number, try SMS/text chat
    if (item.number) {
      if (!selectedDidNumber) {
        logger.error("No phone number selected for SMS");
        toast.error("Please select a phone number in settings first");
        return;
      }

      try {
        // Try to find existing SMS conversation
        const from = stripPhoneNumber(selectedDidNumber.number);
        const to = stripPhoneNumber(item.number);

        logger.debug("Looking for SMS conversation from:", from, "to:", to);

        const conversation = await getConversationsByParticipants(
          token,
          from,
          to
        );

        if (conversation && conversation.id) {
          logger.debug("Found existing SMS conversation:", conversation.id);
          dispatch(textActions.setCurrentConversation(conversation));
          closeDrawer();
          navigation.navigate(Routes.Chat, {
            conversationId: conversation.id,
            recipientName: item.name,
            recipientNumber: item.number,
            recipientAvatarPath:
              item.avatarThumbnailPath || item.avatarPath || undefined
          });
        } else {
          logger.debug("No existing conversation, navigating to new chat");
          // Navigate to chat screen in new message mode
          // The user will need to select the recipient and send a message
          closeDrawer();
          navigation.navigate(Routes.NewMessage, {
            recipientNumber: item.number,
            recipientName: item.name,
            recipientAvatarPath: item.avatarThumbnailPath || item.avatarPath || undefined
          });
        }
      } catch (error: any) {
        // 404 is expected for new conversations - don't log as error
        if (error?.code === 404 || error?.message?.includes("not found")) {
          logger.debug(
            "No existing SMS conversation found (404 - this is normal for new numbers)"
          );
        } else {
          logger.error("Error finding SMS conversation:", error);
        }
        // If conversation not found, navigate to new message screen
        closeDrawer();
        navigation.navigate(Routes.NewMessage, {
          recipientNumber: item.number,
          recipientName: item.name,
          recipientAvatarPath: item.avatarThumbnailPath || item.avatarPath || undefined
        });
      }
      return;
    }

    // No userId or phone number
    logger.error("No user ID or phone number available for messaging");
    toast.error("Unable to start chat - no contact information available");
  };

  return (
    <View>
      <WhiteSpace height={3} />
      <Text
        size={fontSize.lg}
        style={{
          fontWeight: "600",
          marginBottom: 20,
          color: theme.colors["color-colors-text-text-primary"]
        }}
      >
        Profile
      </Text>

      <ContactDrawerBanner src={null} />

      <View style={{ paddingHorizontal: padding["3xl"] }}>
        <View
          style={{
            flexDirection: "column",
            gap: padding["3xl"]
          }}
        >
          <View style={{ marginTop: -50 }}>
            <ContactDrawerAvatar
              src={item.avatarThumbnailPath || item.avatarPath}
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
            style={{
              flexDirection: "row",
              gap: padding.sm,
              width: "100%",
              height: 40
            }}
          >
            <Button
              style={{ flex: 1 }}
              iconSpacing={5}
              type={"outline"}
              icon={<Icon name={"phone"} size={16} />}
              onPress={handleCall}
            >
              Call
            </Button>
            <Button
              style={{ flex: 1 }}
              iconSpacing={5}
              type={"outline"}
              icon={<Icon name={"message-text-square-01"} size={16} />}
              onPress={handleChat}
            >
              Chat
            </Button>
            {canEditOrDelete ? (
              <>
                <Button onPress={handleEditDrawer} type={"outline"}>
                  <Icon name={"edit-01"} size={16} />
                </Button>
                <Button onPress={handleDelete} type={"danger"}>
                  <Icon
                    name={"trash-01"}
                    size={16}
                    color={theme.colors["colors-foreground-fg-white"]}
                  />
                </Button>
              </>
            ) : null}
          </View>
        </View>

        <View style={{ paddingTop: padding["3xl"], gap: padding["2xl"] }}>
          {contactInfoItems.map((info, index) => (
            <ContactInfo
              key={index}
              keyBy={info.key}
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
