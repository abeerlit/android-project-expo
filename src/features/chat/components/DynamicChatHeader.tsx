import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from "react";
import {
  TouchableOpacity,
  View,
  StyleSheet,
  Alert,
  TextInput as RNTextInput,
  Keyboard
} from "react-native";
import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";
import { Avatar } from "shared/components/Avatar.tsx";
import { TextInput } from "shared/components/TextInput.tsx";
import { useTheme } from "hooks/use-theme.ts";
import {
  borderRadius,
  componentSize,
  fontSize,
  padding
} from "core/theme/theme.ts";
import { GroupChannel } from "@sendbird/chat/groupChannel";
import { useNavigation } from "@react-navigation/core";
import { ChannelDetailsDrawer } from "features/chat/components/drawers/ChannelDetailsDrawer.tsx";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { CustomChannelType } from "features/chat/types.ts";
import { NewMessageItem } from "features/chat/hooks/index.ts";
import { formatPhoneNumber, stripPhoneNumber } from "shared/utils/formatters.ts";
import { useSelector } from "react-redux";
import { State } from "store/types.ts";
import { findContactByPhoneNumber } from "features/calling/utils/contact-lookup.ts";
import { useSoftphone } from "core/softphone/useSoftphone.ts";
import { toast } from "@backpackapp-io/react-native-toast";
import {
  appendAvatarCacheBust,
  appendSelfAvatarCacheBust,
  avatarMediaCacheKey
} from "shared/utils/avatarCache.ts";

// Re-export for backwards compatibility
export type { NewMessageItem };

interface DynamicChatHeaderProps {
  // Search mode props
  isSearchMode: boolean;
  recipient: string;
  onRecipientChange: (value: string) => void;
  onBackspace: () => void;
  selectedRecipients: NewMessageItem[];
  onRemoveRecipient?: (index: number) => void;

  // Chat mode props (Sendbird)
  channel?: GroupChannel;
  user?: any;
  directory?: any[];

  // Text mode props
  textTitle?: string;
  textAvatarPath?: string;
  textRecipientCount?: number;
  textParticipants?: string;

  // Call lifecycle (e.g. pause SMS polling during call)
  onBeforeSmsCall?: () => void;
  onCallFailed?: () => void;
}

export type DynamicChatHeaderHandle = {
  blurSearchInput: () => void;
};

export const DynamicChatHeader = forwardRef<
  DynamicChatHeaderHandle,
  DynamicChatHeaderProps
>(function DynamicChatHeader(
  {
  isSearchMode,
  recipient,
  onRecipientChange,
  onBackspace,
  selectedRecipients,
  onRemoveRecipient,
  channel,
  user,
  directory,
  textTitle,
  textParticipants,
  onBeforeSmsCall,
  onCallFailed
},
  ref
) {
  const theme = useTheme();
  const navigation = useNavigation();
  const { openDrawer } = useDrawer();
  const { makeCall, isInitializing, isRegistering, hasOngoingCall } =
    useSoftphone();
  const callButtonDisabled = isInitializing || isRegistering || hasOngoingCall;
  const {
    personalContacts,
    companyContacts,
    phoneContacts,
    directory: directoryFromState
  } = useSelector((state: State) => state.directoryReducer);
  const { selectedDidNumber } = useSelector(
    (state: State) => state.textReducer
  );

  // Find phone number by userId from directory / company / personal contacts.
  const getPhoneNumberByUserId = useCallback(
    (userId: string | number): string | null => {
      const id = typeof userId === "string" ? parseInt(userId, 10) : userId;
      if (Number.isNaN(id)) return null;
      const dir = directoryFromState || [];
      const company = companyContacts || [];
      const personal = personalContacts || [];
      const contact =
        dir.find((c: { userId: number }) => c.userId === id) ||
        company.find((c: { userId: number }) => c.userId === id) ||
        personal.find((c: { userId: number }) => c.userId === id);
      return contact?.number ?? null;
    },
    [directoryFromState, companyContacts, personalContacts]
  );

  const handleHeaderCall = useCallback(
    async (phoneNumber: string | null) => {
      if (!phoneNumber) {
        toast.error("No phone number available for this contact");
        return;
      }
      const contactInfo = findContactByPhoneNumber(
        phoneNumber,
        personalContacts || [],
        companyContacts || [],
        directoryFromState || [],
        phoneContacts || []
      );
      const displayName =
        contactInfo?.name?.trim() || formatPhoneNumber(phoneNumber);
      const avatarPath =
        contactInfo?.avatarPath || contactInfo?.avatarThumbnailPath || null;
      if (isInitializing || isRegistering) {
        toast.error("Softphone is still initializing...");
        return;
      }
      // If a call is already active, disable the call button instead of alerting from chat.
      if (hasOngoingCall) return;
      try {
        //@ts-ignore
        navigation.navigate("InCallScreen" as any, {
          callId: "dialing",
          destination: phoneNumber,
          ...(displayName ? { displayName } : {}),
          ...(avatarPath ? { avatarPath } : {})
        });
        void makeCall(phoneNumber, {
          ...(displayName ? { displayName } : {}),
          ...(avatarPath ? { avatarPath } : {})
        });
      } catch {
        onCallFailed?.();
        toast.error("Failed to make call");
      }
    },
    [
      companyContacts,
      directoryFromState,
      hasOngoingCall,
      isInitializing,
      isRegistering,
      makeCall,
      navigation,
      onCallFailed,
      personalContacts,
      phoneContacts
    ]
  );

  // Cache SMS header info to prevent flicker during message sending
  const cachedSmsHeaderRef = useRef<{
    firstDisplayName: string;
    remainingRecipients: number;
    textParticipants: string;
  } | null>(null);

  const smsHeaderInfo = useMemo(() => {
    if (!textTitle) {
      return cachedSmsHeaderRef.current;
    }
    if (!textParticipants) {
      return (
        cachedSmsHeaderRef.current ?? {
          firstDisplayName: textTitle.split(",")[0]?.trim() || textTitle,
          remainingRecipients: 0,
          textParticipants: ""
        }
      );
    }
    
    const participantsList = textParticipants.split(",").filter(p => p.trim()) || [];
    const firstParticipantNumber = participantsList[0]?.trim();
    
    if (!firstParticipantNumber) {
      const result = {
        firstDisplayName: "Unknown",
        remainingRecipients: 0,
        textParticipants: textParticipants
      };
      cachedSmsHeaderRef.current = result;
      return result;
    }
    
    const firstParticipantContact = findContactByPhoneNumber(
      firstParticipantNumber,
      personalContacts || [],
      companyContacts || [],
      directory || [],
      phoneContacts || []
    );
    
    const firstDisplayName = firstParticipantContact?.name 
      ? firstParticipantContact.name.split(" ")[0]
      : formatPhoneNumber(firstParticipantNumber);
    
    const remainingRecipients = participantsList.length > 1 ? Math.max(0, participantsList.length - 2) : 0;
    
    const result = {
      firstDisplayName,
      remainingRecipients,
      textParticipants: textParticipants
    };
    
    // Update cache if participants match (same conversation)
    if (!cachedSmsHeaderRef.current || 
        cachedSmsHeaderRef.current.textParticipants === textParticipants) {
      cachedSmsHeaderRef.current = result;
    }
    
    return result;
  }, [textTitle, textParticipants, personalContacts, companyContacts, directory, phoneContacts]);

  const displaySmsHeaderInfo = smsHeaderInfo || cachedSmsHeaderRef.current;

  const contactsForAvatar = useMemo(
    () => [...(companyContacts || []), ...(personalContacts || [])],
    [companyContacts, personalContacts]
  );

  const memberInfo = React.useMemo(() => {
    if (!channel || !user) return { avatar: "", name: "" };

    const otherMembers = channel.members.filter(
      (member) => parseInt(member.userId) !== user?.id
    );
    const profileVer =
      (user as { profileMediaVersion?: number })?.profileMediaVersion ?? 0;

    if (otherMembers.length === 0) {
      const selfContact = contactsForAvatar.find(
        (c) => c.userId != null && c.userId === user?.id
      );
      const base =
        (selfContact as any)?.avatarThumbnailPath ||
        (selfContact as any)?.avatarPath ||
        user?.avatarPath ||
        "";
      return {
        avatar: appendSelfAvatarCacheBust(
          base || undefined,
          user?.avatarPath,
          profileVer
        ),
        name: user?.extName || (selfContact as any)?.name || ""
      };
    }

    const memberContacts = contactsForAvatar.filter((c) =>
      otherMembers.some((m) => c.userId?.toString() === m.userId)
    );
    const first = memberContacts[0];
    const base =
      (first as any)?.avatarThumbnailPath || (first as any)?.avatarPath || "";
    return {
      avatar: base
        ? appendAvatarCacheBust(
            base,
            avatarMediaCacheKey(
              (first as any)?.avatarThumbnailPath,
              (first as any)?.avatarPath
            )
          )
        : "",
      name: (first as any)?.name || ""
    };
  }, [channel?.members, channel, user, contactsForAvatar]);

  const searchInputRef = useRef<RNTextInput>(null);

  useImperativeHandle(
    ref,
    () => ({
      blurSearchInput: () => {
        searchInputRef.current?.blur();
      }
    }),
    []
  );

  // Keep search input focused while typing recipients (avoids keyboard dismiss on layout/state update).
  useEffect(() => {
    if (!isSearchMode || recipient.length === 0) return;
    const id = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [isSearchMode, recipient]);

  const renderRecipientChip = useCallback(
    (item: NewMessageItem, index: number) => (
      <TouchableOpacity
        key={`chip-${item.userId || item.phoneNumber}-${index}`}
        style={[
          styles.chipContainer,
          { borderColor: theme.colors["colors-border-border-primary"] }
        ]}
        onPress={() => onRemoveRecipient?.(index)}
      >
        {item.type === "phone" ? (
          <View style={styles.chipIconContainer}>
            <Icon name="phone" size={16} />
          </View>
        ) : (
          <Avatar
            source={item.avatarPath}
            name={item.name}
            size={24}
            style={{
              borderWidth: 0.5,
              borderColor: theme.colors["colors-border-border-primary"]
            }}
            borderRadius={borderRadius.md}
          />
        )}
        <Text size={fontSize.xs} weight="medium" style={styles.chipText}>
          {item.name}
        </Text>
      </TouchableOpacity>
    ),
    [theme.colors, onRemoveRecipient]
  );

  // Search Mode Header
  if (isSearchMode) {
    return (
      <View>
        <View style={styles.searchHeader}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Icon name="x-close" type="outline" size={24} />
          </TouchableOpacity>
          <Text size={fontSize.xl} weight="semiBold">
            New Message
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <View
          style={[
            styles.divider,
            {
              borderColor: theme.colors["color-colors-border-border-secondary"]
            }
          ]}
        />

        <View style={styles.toField}>
          <Text size={fontSize.md} weight="medium">
            To:
          </Text>
          <View style={styles.inputContainer}>
            {selectedRecipients.map(renderRecipientChip)}
            <View style={styles.textInputWrapper}>
              <TextInput
                ref={searchInputRef}
                variant="text"
                placeholder={
                  selectedRecipients.length === 0
                    ? "#a-channel, @somebody, or 601449..."
                    : ""
                }
                placeholderSize={fontSize.md}
                textWeight="medium"
                placeholderWeight="medium"
                placeholderColor="color-component-colors-components-buttons-tertiary-button-tertiary-fg"
                value={recipient}
                onChangeText={onRecipientChange}
                onKeyPress={({ nativeEvent }) => {
                  if (nativeEvent.key === "Backspace") {
                    onBackspace();
                  }
                }}
              />
            </View>
          </View>
        </View>

        <View
          style={[
            styles.divider,
            {
              borderColor: theme.colors["color-colors-border-border-secondary"]
            }
          ]}
        />
      </View>
    );
  }

  // Text Chat Mode Header (displaySmsHeaderInfo always set when textTitle is set)
  if (textTitle && displaySmsHeaderInfo) {
    const { firstDisplayName, remainingRecipients } = displaySmsHeaderInfo;
    
    // Check if textTitle is phone numbers (contains only digits and phone chars)
    const isPhoneNumbers = /^[\d\s()+-,]+$/.test(textTitle.trim());
    
    // Get display name: phone numbers use firstDisplayName, names use first name from textTitle
    const getHeaderName = () => {
      if (isPhoneNumbers) {
        return firstDisplayName;
      }
      // For names, get only the FIRST name (before comma)
      const firstName = textTitle.split(',')[0].trim();
      return firstName || textTitle;
    };
    
    const headerName = getHeaderName();

    return (
      <View style={styles.chatHeader}>
        <Icon
          name={"chevron-left"}
          onPress={() => navigation.goBack()}
          size={componentSize.xs}
          color={
            theme.colors[
              "color-component-colors-components-buttons-tertiary-button-tertiary-fg"
            ]
          }
        />

        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: padding.sm,
            justifyContent: "center"
          }}
        >
          <View style={styles.phoneIconContainer}>
            <Icon name="message-text-square-01" size={18} />
          </View>
          <View
            style={{
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 2
            }}
          >
            <Text
              size={fontSize.md}
              weight={"semiBold"}
              color={
                "color-component-colors-components-buttons-tertiary-button-tertiary-fg"
              }
              numberOfLines={1}
            >
              {headerName}
            </Text>
            {remainingRecipients > 0 && (
              <Text
                size={fontSize.xs}
                weight={"medium"}
                color={"color-colors-text-text-tertiary"}
              >
                And {remainingRecipients} other{remainingRecipients > 1 ? "s" : ""}
              </Text>
            )}
          </View>
        </View>

        {remainingRecipients < 1 ? (
          <TouchableOpacity
            onPress={() => {
              onBeforeSmsCall?.();
              const allParticipants = textParticipants
                ?.split(",")
                .map((p) => p.trim())
                .filter(Boolean);
              const userDid = selectedDidNumber
                ? stripPhoneNumber(selectedDidNumber.number)
                : "";
              const contactNumber =
                allParticipants?.find(
                  (p) => stripPhoneNumber(p) !== userDid
                ) ?? allParticipants?.[0];
              handleHeaderCall(contactNumber ?? null);
            }}
            disabled={callButtonDisabled}
            style={{
              padding: padding.md,
              borderWidth: 1,
              borderRadius: borderRadius.md,
              borderColor:
                theme.colors[
                  "component-colors-components-buttons-secondary-button-secondary-fg"
                ],
              opacity: callButtonDisabled ? 0.4 : 1
            }}
          >
            <Icon name="phone" size={componentSize.xl} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: componentSize.xl }} />
        )}
      </View>
    );
  }

  // Sendbird Chat Mode Header
  if (channel && user) {
    const isAnyMemberOnline = channel.members
      .filter((member) => parseInt(member.userId) !== user?.id)
      .some((member) => member.connectionStatus === "online");
    const avatarStatus = isAnyMemberOnline ? "online" : "none";

    const remainingMembers = channel.members.length - 2;

    const handleChannelDetails = () => {
      Keyboard.dismiss();
      openDrawer(<ChannelDetailsDrawer />);
    };

    const isGroupChannel =
      channel.customType === CustomChannelType.groupChannel(user?.tenantId || -1);
    const hideCallButton =
      isGroupChannel || channel.members.length > 2;

    return (
      <View style={styles.chatHeader}>
        <Icon
          name={"chevron-left"}
          onPress={() => navigation.goBack()}
          size={componentSize.xs}
          color={
            theme.colors[
              "color-component-colors-components-buttons-tertiary-button-tertiary-fg"
            ]
          }
        />
        {isGroupChannel ? (
          <TouchableOpacity
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: padding.xs
            }}
            onPress={handleChannelDetails}
          >
            <Icon
              name={channel.isPublic ? "hash-02" : "lock-03"}
              size={componentSize.xs}
              color={
                theme.colors[
                  "color-component-colors-components-buttons-tertiary-button-tertiary-fg"
                ]
              }
            />
            <Text
              style={{ paddingHorizontal: padding.xxs }}
              size={fontSize.md}
              weight={"semiBold"}
              color={
                "color-component-colors-components-buttons-tertiary-button-tertiary-fg"
              }
            >
              {channel.name.length > 30
                ? `${channel.name.slice(0, 30)}...`
                : channel.name}
            </Text>
            <Icon
              name={"chevron-down"}
              size={componentSize.xs}
              color={
                theme.colors[
                  "color-component-colors-components-buttons-tertiary-button-tertiary-fg"
                ]
              }
            />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={{
              display: "flex",
              flexDirection: "row",
              gap: padding.sm,
              alignItems: "center"
            }}
            onPress={handleChannelDetails}
          >
            <Avatar
              size={32}
              source={memberInfo.avatar}
              name={memberInfo.name}
              borderRadius={borderRadius.md}
              status={avatarStatus}
            />
            <View
              style={{
                flexDirection: "column",
                alignItems: "flex-start",
                gap: padding.xxs
              }}
            >
              <Text
                size={fontSize.md}
                weight={"semiBold"}
                color={
                  "color-component-colors-components-buttons-tertiary-button-tertiary-fg"
                }
              >
                {memberInfo.name}
              </Text>
              {remainingMembers > 0 && (
                <Text
                  size={fontSize.sm}
                  weight={"medium"}
                  color={
                    "color-component-colors-components-buttons-tertiary-button-tertiary-fg"
                  }
                >
                  And {remainingMembers} others
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}

        {hideCallButton ? (
          <View style={{ width: componentSize.xl }} />
        ) : (
          <TouchableOpacity
            onPress={() => {
              const otherMember = channel.members.find(
                (m) => parseInt(m.userId) !== user?.id
              );
              const phoneNumber = otherMember
                ? getPhoneNumberByUserId(otherMember.userId)
                : null;
              handleHeaderCall(phoneNumber);
            }}
            disabled={callButtonDisabled}
            style={{
              padding: padding.md,
              borderWidth: 1,
              borderRadius: borderRadius.md,
              borderColor:
                theme.colors[
                  "component-colors-components-buttons-secondary-button-secondary-fg"
                ],
              opacity: callButtonDisabled ? 0.4 : 1
            }}
          >
            <Icon name={"phone"} size={componentSize.xl} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return null;
});

const styles = StyleSheet.create({
  searchHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: padding.xl,
    paddingVertical: padding.md
  },
  chatHeader: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: padding["3xl"],
    height: 60,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)"
  },
  backButton: {
    padding: padding.xs
  },
  divider: {
    borderStyle: "solid",
    borderWidth: 0.5
  },
  toField: {
    flexDirection: "row",
    alignItems: "center",
    gap: padding.md,
    paddingVertical: padding.md,
    paddingHorizontal: padding.xl
  },
  inputContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    flex: 1,
    gap: padding.xs
  },
  textInputWrapper: {
    flex: 1,
    minWidth: "20%"
  },
  chipContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 0.75,
    borderRadius: borderRadius.md,
    paddingHorizontal: padding.sm,
    paddingVertical: padding.xxs,
    marginVertical: padding.xs,
    marginHorizontal: padding.xs,
    gap: padding.xs
  },
  chipText: {
    maxWidth: 100
  },
  chipIconContainer: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center"
  },
  phoneIconContainer: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.md,
    backgroundColor: "rgba(0,0,0,0.05)"
  }
});
