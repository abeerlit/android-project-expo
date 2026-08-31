import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  Image,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDispatch, useSelector } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Video from "react-native-video";
import { toast } from "@backpackapp-io/react-native-toast";
import { Text } from "shared/components/Text.tsx";
import SearchBar from "shared/components/utils/SearchBar.tsx";
import { FlatList } from "shared/components/utils/Flatlist.tsx";
import { Avatar } from "shared/components/Avatar.tsx";
import { Button } from "shared/components/Button.tsx";
import Icon from "shared/components/Icon.tsx";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { useTheme } from "hooks/use-theme.ts";
import { State } from "store/types.ts";
import * as textActions from "store/text/actions.ts";
import { TextConversation } from "shared/api/messaging/types.ts";
import { DirectoryContact } from "shared/api/directory/types.ts";
import { createUserInSendbird } from "shared/api/chat/methods.ts";
import { Routes, SharedMediaItem } from "core/navigation/types/types.ts";
import { AuthParams } from "core/navigation/navigators/AuthenticatedStack.tsx";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";
import { clearPendingShareMedia } from "features/share/PendingShareIntent.ts";
import { sendSharedMedia } from "features/share/sendSharedMedia.ts";
import type { ShareDestination } from "features/share/types.ts";
import { findContactByPhoneNumber } from "features/calling/utils/contact-lookup.ts";

type ShareTarget =
  | {
      key: string;
      kind: "user";
      userId: number;
      name: string;
      avatar?: string;
    }
  | {
      key: string;
      kind: "chat";
      channelUrl: string;
      name: string;
      avatar?: string;
      isChannel?: boolean;
      isPublic?: boolean;
      lastMessageAt?: number;
    }
  | {
      key: string;
      kind: "sms";
      conversationId: number;
      participants: string;
      sourceDID: string;
      name: string;
    };

type ListRow =
  | { key: string; kind: "header"; title: string }
  | ShareTarget;

function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11) {
    return `+${cleaned.slice(0, 1)} (${cleaned.slice(1, 4)}) ${cleaned.slice(
      4,
      7
    )}-${cleaned.slice(7)}`;
  }
  return phone;
}

function smsDisplayName(
  conversation: TextConversation,
  contacts: {
    personalContacts: State["directoryReducer"]["personalContacts"];
    companyContacts: State["directoryReducer"]["companyContacts"];
    directory: State["directoryReducer"]["directory"];
    phoneContacts: State["directoryReducer"]["phoneContacts"];
  }
): string {
  if (conversation.conversationName?.trim()) {
    return conversation.conversationName.trim();
  }
  const parts =
    conversation.participants
      ?.split(",")
      .map((p) => p.trim())
      .filter((p) => p && p !== conversation.sourceDID) ?? [];
  if (parts.length === 0) return "SMS";
  return parts
    .map((phoneNumber) => {
      const contactInfo = findContactByPhoneNumber(
        phoneNumber,
        contacts.personalContacts || [],
        contacts.companyContacts || [],
        contacts.directory || [],
        contacts.phoneContacts || []
      );
      return contactInfo ? contactInfo.name : formatPhoneNumber(phoneNumber);
    })
    .join(", ");
}

interface ShareMediaDrawerProps {
  media: SharedMediaItem[];
  onClose?: () => void;
}

export function ShareMediaDrawer({ media, onClose }: ShareMediaDrawerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthParams>>();

  const {
    sendbirdInstance,
    filteredGroupChannels,
    filteredDMChannels,
    createOrJoinDMChannel
  } = useSendbirdContext();
  const { directory } = useSelector((state: State) => state.directoryReducer);
  const { user } = useSelector((state: State) => state.userReducer);
  const { conversations, selectedDidNumber } = useSelector(
    (state: State) => state.textReducer
  );
  const accessToken = useSelector(
    (state: State) => state.authReducer.accessToken
  );
  const { personalContacts, companyContacts, phoneContacts } = useSelector(
    (state: State) => state.directoryReducer
  );

  const [searchValue, setSearchValue] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cancelShare = useCallback(() => {
    clearPendingShareMedia();
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    dispatch(textActions.fetchConversations());
  }, [dispatch]);

  useEffect(() => {
    if (!media.length) {
      toast.error("No shared media found");
      cancelShare();
    }
  }, [media.length, cancelShare]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      cancelShare();
      return true;
    });
    return () => sub.remove();
  }, [cancelShare]);

  const people = useMemo((): ShareTarget[] => {
    const currentUserId = user?.id;
    return directory
      .filter(
        (contact: DirectoryContact) =>
          contact.type === "company" &&
          contact.userId &&
          contact.userId !== currentUserId
      )
      .map((contact: DirectoryContact) => ({
        key: `user:${contact.userId}`,
        kind: "user" as const,
        userId: contact.userId,
        name: contact.name || "Unknown",
        avatar: contact.avatarThumbnailPath || contact.avatarPath || undefined
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [directory, user?.id]);

  const recentChats = useMemo((): ShareTarget[] => {
    const chats: ShareTarget[] = [
      ...filteredDMChannels
        .filter((dm) => !dm.personal)
        .map((dm) => ({
          key: `chat:${dm.url}`,
          kind: "chat" as const,
          channelUrl: dm.url,
          name: dm.name || "Direct message",
          avatar: dm.avatar || undefined,
          lastMessageAt: dm.lastMessageAt || 0
        })),
      ...filteredGroupChannels.map((channel) => ({
        key: `chat:${channel.url}`,
        kind: "chat" as const,
        channelUrl: channel.url,
        name: channel.name || "Unnamed Channel",
        isChannel: true,
        isPublic: channel.isPublic,
        lastMessageAt: channel.lastMessageAt || 0
      }))
    ];
    return chats.sort(
      (a, b) =>
        (b.kind === "chat" ? b.lastMessageAt || 0 : 0) -
        (a.kind === "chat" ? a.lastMessageAt || 0 : 0)
    );
  }, [filteredDMChannels, filteredGroupChannels]);

  const smsTargets = useMemo((): ShareTarget[] => {
    const contacts = {
      personalContacts,
      companyContacts,
      directory,
      phoneContacts
    };
    return conversations
      .filter((c) => !c.hidden)
      .map((sms) => ({
        key: `sms:${sms.id}`,
        kind: "sms" as const,
        conversationId: sms.id,
        participants: sms.participants,
        sourceDID: sms.sourceDID,
        name: smsDisplayName(sms, contacts)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [
    conversations,
    personalContacts,
    companyContacts,
    directory,
    phoneContacts
  ]);

  const searchLower = searchValue.toLowerCase().trim();

  const filteredRecent = useMemo(() => {
    if (!searchLower) return recentChats;
    return recentChats.filter((item) =>
      item.name.toLowerCase().includes(searchLower)
    );
  }, [recentChats, searchLower]);

  const filteredPeople = useMemo(() => {
    if (!searchLower) return people;
    return people.filter((item) =>
      item.name.toLowerCase().includes(searchLower)
    );
  }, [people, searchLower]);

  const filteredSms = useMemo(() => {
    if (!searchLower) return smsTargets;
    return smsTargets.filter(
      (item) =>
        item.name.toLowerCase().includes(searchLower) ||
        (item.kind === "sms" &&
          item.participants.toLowerCase().includes(searchLower))
    );
  }, [smsTargets, searchLower]);

  const listData = useMemo((): ListRow[] => {
    const rows: ListRow[] = [];
    if (filteredRecent.length > 0) {
      rows.push({
        key: "header-recent",
        kind: "header",
        title: "RECENT CHATS"
      });
      rows.push(...filteredRecent);
    }
    if (filteredPeople.length > 0) {
      rows.push({ key: "header-people", kind: "header", title: "PEOPLE" });
      rows.push(...filteredPeople);
    }
    if (filteredSms.length > 0) {
      rows.push({ key: "header-sms", kind: "header", title: "SMS" });
      rows.push(...filteredSms);
    }
    return rows;
  }, [filteredRecent, filteredPeople, filteredSms]);

  const selectedTargets = useMemo(() => {
    const all: ShareTarget[] = [...recentChats, ...people, ...smsTargets];
    return all.filter((item) => selectedKeys.has(item.key));
  }, [recentChats, people, smsTargets, selectedKeys]);

  const handleToggle = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const resolveSendbirdDestination = useCallback(
    async (target: ShareTarget): Promise<ShareDestination | null> => {
      if (target.kind === "sms") {
        return {
          kind: "sms",
          conversationId: target.conversationId,
          participants: target.participants,
          sourceDID: target.sourceDID,
          name: target.name
        };
      }

      if (!sendbirdInstance) {
        toast.error("Chat is not connected");
        return null;
      }

      if (target.kind === "user") {
        const contact = directory.find(
          (item: DirectoryContact) => item.userId === target.userId
        );
        await createUserInSendbird(
          String(target.userId),
          target.name,
          contact?.avatarThumbnailPath || contact?.avatarPath || undefined
        ).catch(() => {});

        const result = await createOrJoinDMChannel([String(target.userId)]);
        if (!result.success || !result.channelUrl) {
          throw new Error(result.error || "Failed to open conversation");
        }
        return {
          kind: "sendbird",
          channelUrl: result.channelUrl,
          name: target.name
        };
      }

      return {
        kind: "sendbird",
        channelUrl: target.channelUrl,
        name: target.name
      };
    },
    [sendbirdInstance, directory, createOrJoinDMChannel]
  );

  const handleSend = useCallback(async () => {
    if (!selectedTargets.length || isSubmitting) return;
    setIsSubmitting(true);
    try {
      let lastOk:
        | { route: string; params: object; destination: ShareDestination }
        | null = null;

      for (const target of selectedTargets) {
        const destination = await resolveSendbirdDestination(target);
        if (!destination) return;

        const result = await sendSharedMedia({
          media,
          destination,
          caption,
          accessToken,
          selectedDidNumber,
          sendbirdInstance,
          dispatch
        });
        if (result.ok === false) {
          toast.error(result.error);
          return;
        }
        lastOk = {
          route: result.navigateTo.route,
          params: result.navigateTo.params,
          destination
        };
      }

      clearPendingShareMedia();
      onClose?.();
      toast.success(
        selectedTargets.length === 1
          ? "Media sent"
          : `Media sent to ${selectedTargets.length} chats`
      );

      if (!lastOk) return;
      if (lastOk.route === "Chat") {
        navigation.navigate(
          Routes.Chat,
          lastOk.params as AuthParams["Chat"]
        );
      } else {
        if (lastOk.destination.kind === "sms") {
          const conversationId = lastOk.destination.conversationId;
          const conv = conversations.find((c) => c.id === conversationId);
          if (conv) {
            dispatch(textActions.setCurrentConversation(conv));
          }
        }
        navigation.navigate(
          Routes.TextThread,
          lastOk.params as AuthParams["TextThread"]
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send media";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    selectedTargets,
    isSubmitting,
    resolveSendbirdDestination,
    media,
    caption,
    accessToken,
    selectedDidNumber,
    sendbirdInstance,
    dispatch,
    onClose,
    navigation,
    conversations
  ]);

  const brand =
    theme.colors["color-component-colors-utility-brand-utility-brand-700"];
  const primaryFg =
    theme.colors[
      "color-component-colors-components-buttons-primary-button-primary-fg"
    ];
  const borderColor =
    theme.colors["color-colors-border-border-secondary"] || "#E5E7EB";
  const bg =
    theme.colors["color-colors-background-bg-primary"] || "#FFFFFF";
  const selectedCount = selectedKeys.size;

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View style={styles.headerRow}>
        <View style={styles.searchWrap}>
          <SearchBar
            value={searchValue}
            onChangeText={setSearchValue}
            onCancel={() => setSearchValue("")}
            placeholder="Search"
            showCancel={false}
          />
        </View>
        <TouchableOpacity
          onPress={cancelShare}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={styles.cancelTap}
        >
          <Text
            size={fontSize.md}
            weight="semiBold"
            color="color-component-colors-utility-brand-utility-brand-700"
            align="right"
          >
            Cancel
          </Text>
        </TouchableOpacity>
      </View>

      {media.length > 0 ? (
        <View style={styles.mediaStrip}>
          {media.map((file, index) => (
            <View key={`${file.uri}-${index}`} style={styles.mediaThumbWrap}>
              {file.mimeType.startsWith("image/") ? (
                <Image source={{ uri: file.uri }} style={styles.mediaThumb} />
              ) : (
                <Video
                  source={{ uri: file.uri }}
                  style={styles.mediaThumb}
                  resizeMode="cover"
                  muted
                  repeat
                />
              )}
            </View>
          ))}
        </View>
      ) : null}

      <FlatList
        data={listData}
        keyExtractor={(item) => item.key}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          if (item.kind === "header") {
            return (
              <View style={styles.sectionHeader}>
                <Text
                  size={fontSize.xs}
                  weight="semiBold"
                  color="color-colors-text-text-tertiary"
                  align="left"
                >
                  {item.title}
                </Text>
              </View>
            );
          }

          return (
            <ShareRow
              item={item}
              isSelected={selectedKeys.has(item.key)}
              brand={brand}
              onToggle={() => handleToggle(item.key)}
            />
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text
              size={fontSize.sm}
              color="color-colors-text-text-tertiary"
              align="left"
            >
              No people or chats found
            </Text>
          </View>
        }
      />

      {selectedCount > 0 ? (
        <View
          style={[
            styles.footer,
            {
              borderTopColor: borderColor,
              backgroundColor: bg,
              paddingBottom: Math.max(insets.bottom, padding.lg)
            }
          ]}
        >
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Add a caption (optional)"
            placeholderTextColor={
              theme.colors["color-colors-text-text-tertiary"] || "#9CA3AF"
            }
            style={[styles.captionInput, { borderColor }]}
            multiline
            maxLength={1000}
          />
          <View style={styles.footerActions}>
            <Text
              size={fontSize.sm}
              weight="medium"
              color="color-colors-text-text-secondary"
              align="left"
            >
              {selectedCount} selected
            </Text>
            <Button
              type="primary"
              size={fontSize.sm}
              weight="semiBold"
              paddingVertical={padding.sm}
              loading={isSubmitting}
              disabled={isSubmitting}
              onPress={handleSend}
              icon={<Icon name="send-03" size={16} color={primaryFg} />}
              containerStyle={styles.sendButton}
            >
              {isSubmitting ? "Sending..." : "Send"}
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const ShareRow = ({
  item,
  isSelected,
  brand,
  onToggle
}: {
  item: ShareTarget;
  isSelected: boolean;
  brand: string;
  onToggle: () => void;
}) => {
  const theme = useTheme();

  return (
    <TouchableOpacity onPress={onToggle} style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={styles.avatarSlot}>
          {item.kind === "chat" && item.isChannel ? (
            <View
              style={[
                styles.iconWrap,
                {
                  backgroundColor:
                    theme.colors["component-colors-components-avatars-avatar-bg"]
                }
              ]}
            >
              <Icon
                name={item.isPublic ? "hash-01" : "lock-03"}
                size={18}
                color={theme.colors["color-colors-text-text-primary"]}
              />
            </View>
          ) : (
            <Avatar
              size={40}
              borderRadius={borderRadius.full}
              source={item.kind === "sms" ? undefined : item.avatar}
              name={item.name}
            />
          )}
        </View>
        <View style={styles.nameWrap}>
          <Text
            size={fontSize.md}
            weight="medium"
            align="left"
            numberOfLines={2}
          >
            {item.name}
          </Text>
          {item.kind === "sms" ? (
            <Text
              size={fontSize.xs}
              color="color-colors-text-text-tertiary"
              align="left"
            >
              SMS
            </Text>
          ) : null}
        </View>
      </View>
      <View
        style={[
          styles.selector,
          {
            borderColor: isSelected
              ? brand
              : theme.colors["color-colors-border-border-secondary"],
            backgroundColor: isSelected ? brand : "transparent"
          }
        ]}
      >
        {isSelected ? (
          <Icon name="check" size={12} color={theme.colors.white} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: padding.lg,
    paddingTop: padding.sm,
    gap: padding.sm
  },
  cancelTap: {
    paddingVertical: padding.md,
    paddingLeft: padding.sm
  },
  searchWrap: {
    flex: 1
  },
  mediaStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: padding.xl,
    paddingTop: padding.md,
    paddingBottom: padding.sm
  },
  mediaThumbWrap: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    overflow: "hidden"
  },
  mediaThumb: {
    width: 56,
    height: 56
  },
  sectionHeader: {
    paddingHorizontal: padding.xl,
    paddingTop: padding.xl,
    paddingBottom: padding.sm
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: padding.lg,
    paddingHorizontal: padding.xl
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: padding.xl,
    flex: 1,
    minWidth: 0,
    paddingRight: padding.md
  },
  avatarSlot: {
    flexShrink: 0
  },
  nameWrap: {
    flex: 1,
    minWidth: 0
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center"
  },
  selector: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginLeft: padding.sm
  },
  empty: {
    paddingHorizontal: padding.xl,
    paddingTop: padding.xl
  },
  footer: {
    paddingHorizontal: padding.xl,
    paddingTop: padding.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: padding.md
  },
  captionInput: {
    minHeight: 44,
    maxHeight: 88,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: padding.md,
    paddingVertical: padding.sm,
    textAlignVertical: "top",
    fontSize: 15
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  sendButton: {
    paddingHorizontal: padding.xl,
    minWidth: 120
  }
});
