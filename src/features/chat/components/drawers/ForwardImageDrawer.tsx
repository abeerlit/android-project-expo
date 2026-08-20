import React, { useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  StyleSheet,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "shared/components/Text.tsx";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import SearchBar from "shared/components/utils/SearchBar.tsx";
import { FlatList } from "shared/components/utils/Flatlist.tsx";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";
import { useSelector } from "react-redux";
import { State } from "store/types.ts";
import { Avatar } from "shared/components/Avatar.tsx";
import { useTheme } from "hooks/use-theme.ts";
import Icon from "shared/components/Icon.tsx";
import { Button } from "shared/components/Button.tsx";
import { createUserInSendbird } from "shared/api/chat/methods.ts";
import { toast } from "@backpackapp-io/react-native-toast";
import { Logger } from "shared/utils/Logger.ts";
import { DirectoryContact } from "shared/api/directory/types.ts";
import {
  cleanupPreparedImage,
  prepareImageFile,
  prepareRemoteFile,
  shareImageWithSystemSheet,
  shareTextWithSystemSheet
} from "shared/utils/imageModalActions.ts";
import { GroupChannel } from "@sendbird/chat/groupChannel";
import {
  FileMessage,
  MultipleFilesMessage,
  UserMessage,
  UserMessageCreateParams
} from "@sendbird/chat/message";
import { ChatMessage } from "features/chat/types.ts";
import { isHtml } from "shared/utils/utils.ts";

const logger = new Logger("ForwardImageDrawer: ");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNoAckError(error: unknown): boolean {
  const code = (error as { code?: number } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  return code === 800210 || /no ack/i.test(message);
}

async function waitForSendbirdOpen(
  sendbirdInstance: { connectionState?: string } | null,
  timeoutMs = 10000
) {
  if (!sendbirdInstance) {
    throw new Error("Chat is not connected");
  }
  if (sendbirdInstance.connectionState === "OPEN") return;

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (sendbirdInstance.connectionState === "OPEN") {
      await sleep(200);
      return;
    }
    await sleep(250);
  }

  throw new Error("Chat is reconnecting. Please try again.");
}

type ForwardTarget =
  | {
      key: string;
      kind: "user";
      userId: number;
      name: string;
      avatar?: string;
      lastMessageAt?: number;
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
    };

type ListRow =
  | { key: string; kind: "native-share" }
  | { key: string; kind: "header"; title: string }
  | ForwardTarget;

interface ForwardImageDrawerProps {
  imageUrl?: string;
  authToken?: string;
  message?: ChatMessage;
  onClose?: () => void;
}

export const ForwardImageDrawer = ({
  imageUrl,
  authToken,
  message,
  onClose
}: ForwardImageDrawerProps) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const {
    sendbirdInstance,
    currentChannel,
    filteredGroupChannels,
    filteredDMChannels,
    createOrJoinDMChannel
  } = useSendbirdContext();
  const { directory } = useSelector((state: State) => state.directoryReducer);
  const { user } = useSelector((state: State) => state.userReducer);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose?.();
      return true;
    });

    return () => sub.remove();
  }, [onClose]);

  const [searchValue, setSearchValue] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const people = useMemo((): ForwardTarget[] => {
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

  const recentChats = useMemo((): ForwardTarget[] => {
    const chats: ForwardTarget[] = [
      ...filteredDMChannels
        .filter((dm) => dm.url !== currentChannel?.url && !dm.personal)
        .map((dm) => ({
          key: `chat:${dm.url}`,
          kind: "chat" as const,
          channelUrl: dm.url,
          name: dm.name || "Direct message",
          avatar: dm.avatar || undefined,
          lastMessageAt: dm.lastMessageAt || 0
        })),
      ...filteredGroupChannels
        .filter((channel) => channel.url !== currentChannel?.url)
        .map((channel) => ({
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
      (a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0)
    );
  }, [filteredDMChannels, filteredGroupChannels, currentChannel?.url]);

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

  const listData = useMemo((): ListRow[] => {
    const rows: ListRow[] = [{ key: "native-share", kind: "native-share" }];

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
    return rows;
  }, [filteredRecent, filteredPeople]);

  const selectedTargets = useMemo(() => {
    const all: ForwardTarget[] = [...recentChats, ...people];
    return all.filter((item) => selectedKeys.has(item.key));
  }, [recentChats, people, selectedKeys]);

  const handleToggle = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sendFileToChannel = async (
    channel: GroupChannel,
    file: { uri: string; name: string; type: string }
  ) => {
    await new Promise<void>((resolve, reject) => {
      const handler = channel.sendFileMessage({
        file,
        fileName: file.name,
        mimeType: file.type
      });
      if (!handler) {
        reject(new Error("Failed to start file send"));
        return;
      }
      handler.onSucceeded(() => resolve()).onFailed((error) => reject(error));
    });
  };

  const sendTextToChannel = async (
    channel: GroupChannel,
    params: UserMessageCreateParams
  ) => {
    await new Promise<void>((resolve, reject) => {
      const handler = channel.sendUserMessage(params);
      if (!handler) {
        reject(new Error("Failed to start message send"));
        return;
      }
      handler.onSucceeded(() => resolve()).onFailed((error) => reject(error));
    });
  };

  const sendWithRetry = async (run: () => Promise<void>) => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await waitForSendbirdOpen(sendbirdInstance);
        await run();
        return;
      } catch (error) {
        lastError = error;
        if (!isNoAckError(error) || attempt === 2) {
          throw error;
        }
        logger.debug("Forward send got no ack, retrying", { attempt: attempt + 1 });
        await sleep(400 * (attempt + 1));
      }
    }
    throw lastError;
  };

  const resolveTargetChannel = async (target: ForwardTarget) => {
    if (!sendbirdInstance) {
      throw new Error("Chat is not connected");
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
      return sendbirdInstance.groupChannel.getChannel(result.channelUrl);
    }
    return sendbirdInstance.groupChannel.getChannel(target.channelUrl);
  };

  const getPlainShareText = () => {
    if (!message || !message.isUserMessage()) return "";
    const userMessage = message as UserMessage;
    if (userMessage.customType === "MEETING_INVITE") {
      return (
        userMessage.metaArrays?.find((meta) => meta.key === "meetURL")
          ?.value?.[0] ?? userMessage.message
      );
    }
    if (userMessage.message && isHtml(userMessage.message)) {
      return userMessage.message.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ");
    }
    return userMessage.message || "";
  };

  const getImageOrFileUrl = () => {
    if (imageUrl) return imageUrl;
    if (message?.isFileMessage()) {
      const fileMessage = message as FileMessage;
      return fileMessage.url || fileMessage.plainUrl || "";
    }
    if (message?.isMultipleFilesMessage()) {
      const files = (message as MultipleFilesMessage).fileInfoList || [];
      const first = files[0];
      return first?.url || first?.plainUrl || "";
    }
    return "";
  };

  const handleNativeShare = async () => {
    if (isSharing || isSubmitting) return;
    setIsSharing(true);
    try {
      const fileUrl = getImageOrFileUrl();
      if (fileUrl) {
        await shareImageWithSystemSheet(fileUrl, authToken);
        return;
      }
      const text = getPlainShareText();
      if (text) {
        await shareTextWithSystemSheet(text);
      }
    } finally {
      setIsSharing(false);
    }
  };

  const handleForward = async () => {
    if (selectedTargets.length === 0 || isSubmitting) return;
    if (!sendbirdInstance) {
      toast.error("Chat is not connected");
      return;
    }

    setIsSubmitting(true);
    const preparedFiles: Awaited<ReturnType<typeof prepareRemoteFile>>[] = [];
    try {
      await waitForSendbirdOpen(sendbirdInstance);

      let textParams: UserMessageCreateParams | null = null;
      const filesToSend: { uri: string; name: string; type: string }[] = [];

      if (message?.isUserMessage() || message?.isAdminMessage?.()) {
        const userMessage = message as UserMessage;
        textParams = {
          message: userMessage.message || "",
          customType: userMessage.customType,
          data: userMessage.data,
          metaArrays: userMessage.metaArrays?.map((meta) => ({
            key: meta.key,
            value: meta.value
          }))
        };
      } else if (message?.isFileMessage()) {
        const fileMessage = message as FileMessage;
        const remoteUrl = fileMessage.url || fileMessage.plainUrl;
        if (!remoteUrl) throw new Error("Attachment URL is missing");
        const prepared = await prepareRemoteFile(
          remoteUrl,
          authToken,
          fileMessage.name,
          fileMessage.type
        );
        preparedFiles.push(prepared);
        filesToSend.push({
          uri: prepared.uri,
          name: prepared.name,
          type: prepared.type
        });
      } else if (message?.isMultipleFilesMessage()) {
        const files = (message as MultipleFilesMessage).fileInfoList || [];
        for (const fileInfo of files) {
          const remoteUrl = fileInfo.url || fileInfo.plainUrl;
          if (!remoteUrl) continue;
          const prepared = await prepareRemoteFile(
            remoteUrl,
            authToken,
            fileInfo.fileName,
            fileInfo.mimeType
          );
          preparedFiles.push(prepared);
          filesToSend.push({
            uri: prepared.uri,
            name: prepared.name,
            type: prepared.type
          });
        }
        if (filesToSend.length === 0) {
          throw new Error("Attachment URL is missing");
        }
      } else if (imageUrl) {
        const prepared = await prepareImageFile(imageUrl, authToken);
        preparedFiles.push(prepared);
        filesToSend.push({
          uri: prepared.uri,
          name: prepared.name,
          type: prepared.type
        });
      } else {
        throw new Error("Nothing to forward");
      }

      for (const target of selectedTargets) {
        await sendWithRetry(async () => {
          const channel = await resolveTargetChannel(target);
          if (textParams) {
            await sendTextToChannel(channel, textParams);
            return;
          }
          for (const file of filesToSend) {
            await sendFileToChannel(channel, file);
          }
        });
      }

      toast.success(
        selectedTargets.length === 1
          ? "Message forwarded"
          : `Message forwarded to ${selectedTargets.length} chats`
      );
      onClose?.();
    } catch (error) {
      logger.error("Error forwarding message", error);
      const messageText =
        error instanceof Error ? error.message : String(error);
      toast.error(
        /reconnect/i.test(messageText)
          ? "Chat is reconnecting. Please try again."
          : "Failed to forward message"
      );
    } finally {
      preparedFiles.forEach((file) => {
        setTimeout(() => cleanupPreparedImage(file), 60_000);
      });
      setIsSubmitting(false);
    }
  };

  const selectedCount = selectedKeys.size;
  const brand =
    theme.colors["color-component-colors-utility-brand-utility-brand-700"];
  const primaryFg =
    theme.colors[
      "color-component-colors-components-buttons-primary-button-primary-fg"
    ];

  return (
    <View style={styles.root}>
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
          onPress={onClose}
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

      <FlatList
        data={listData}
        keyExtractor={(item) => item.key}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          if (item.kind === "native-share") {
            return (
              <TouchableOpacity
                onPress={handleNativeShare}
                disabled={isSharing}
                style={[styles.row, styles.nativeShareRow]}
              >
                <View style={styles.rowLeft}>
                  <View
                    style={[
                      styles.iconWrap,
                      {
                        backgroundColor:
                          theme.colors[
                            "component-colors-components-avatars-avatar-bg"
                          ]
                      }
                    ]}
                  >
                    <Icon
                      name="share-01"
                      size={18}
                      color={theme.colors["color-colors-text-text-primary"]}
                    />
                  </View>
                  <View>
                    <Text size={fontSize.sm} weight="medium" align="left">
                      {isSharing ? "Opening share..." : "Share via Android"}
                    </Text>
                    <Text
                      size={fontSize.xs}
                      color="color-colors-text-text-tertiary"
                      align="left"
                    >
                      Messages, Gmail, and other apps
                    </Text>
                  </View>
                </View>
                <Icon
                  name="chevron-right"
                  size={16}
                  color={theme.colors["color-colors-text-text-tertiary"]}
                />
              </TouchableOpacity>
            );
          }

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
            <ForwardRow
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
              borderTopColor:
                theme.colors["color-colors-border-border-secondary"],
              backgroundColor:
                theme.colors["color-colors-background-bg-primary"],
              paddingBottom: Math.max(insets.bottom, padding.lg)
            }
          ]}
        >
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
            onPress={handleForward}
            icon={<Icon name="send-03" size={16} color={primaryFg} />}
            containerStyle={styles.forwardButton}
          >
            {isSubmitting ? "Sending..." : "Forward"}
          </Button>
        </View>
      ) : null}
    </View>
  );
};

const ForwardRow = ({
  item,
  isSelected,
  brand,
  onToggle
}: {
  item: ForwardTarget;
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
              source={item.avatar}
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
  nativeShareRow: {
    marginTop: padding.lg
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: padding.xl,
    paddingTop: padding.lg,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  forwardButton: {
    paddingHorizontal: padding.xl,
    minWidth: 120
  }
});
