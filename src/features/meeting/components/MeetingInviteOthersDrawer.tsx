import React, { memo, useCallback, useMemo, useState } from "react";
import { StyleSheet, View, TouchableOpacity } from "react-native";
import { useSelector } from "react-redux";
import { Text } from "shared/components/Text.tsx";
import SearchBar from "shared/components/utils/SearchBar.tsx";
import { FlatList } from "shared/components/utils/Flatlist.tsx";
import { Avatar } from "shared/components/Avatar.tsx";
import { fontSize, padding } from "core/theme/theme.ts";
import { useTheme } from "hooks/use-theme.ts";
import Icon from "shared/components/Icon.tsx";
import { toast } from "@backpackapp-io/react-native-toast";
import { Logger } from "shared/utils/Logger.ts";
import { State } from "store/types.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { createUserInSendbird } from "shared/api/chat/methods.ts";
import { MessageMetaArray, type UserMessageCreateParams } from "@sendbird/chat/message";
import type { DirectoryContact } from "shared/api/directory/types.ts";

const logger = new Logger("MeetingInviteOthersDrawer(Android)");

const ROW_HEIGHT = 42 + padding.md * 2;

type MeetingInviteAppearance = "meeting" | "app";

type MeetingInviteOthersDrawerProps = {
  meetURL: string;
  dialInNum?: string;
  pin?: string;
  roomId?: string;
  token?: string;
  creatorName?: string;
  onClose?: () => void;
  /** Dark sheet (in-call). `app` = light theme for New → Video pre-join invite. */
  appearance?: MeetingInviteAppearance;
  /** Light `app` only: back affordance in header (e.g. return to meeting-ready screen). */
  onBack?: () => void;
};

const splitTokenLikeWeb = (token: string): string[] => {
  const parts = token.split(".");
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i === 1) {
      const mid = Math.ceil(parts[i].length / 2);
      out.push(parts[i].slice(0, mid), parts[i].slice(mid));
    } else {
      out.push(parts[i]);
    }
  }
  return out;
};

const buildMeetingInviteMetaArrays = ({
  meetURL,
  dialInNum,
  pin,
  roomId,
  token,
  creatorName
}: {
  meetURL: string;
  dialInNum?: string;
  pin?: string;
  roomId?: string;
  token?: string;
  creatorName?: string;
}): MessageMetaArray[] => {
  const meta: MessageMetaArray[] = [];
  meta.push(new MessageMetaArray({ key: "meetURL", value: [meetURL] }));
  if (dialInNum) meta.push(new MessageMetaArray({ key: "dialInNum", value: [dialInNum] }));
  if (pin) meta.push(new MessageMetaArray({ key: "pin", value: [pin] }));
  if (roomId) meta.push(new MessageMetaArray({ key: "roomId", value: [roomId] }));
  if (token) meta.push(new MessageMetaArray({ key: "token", value: splitTokenLikeWeb(token) }));
  if (creatorName) meta.push(new MessageMetaArray({ key: "creator", value: [creatorName] }));
  return meta;
};

/** Dedupe by userId and sort for stable FlatList keys / scroll position. */
const buildCompanyInviteContacts = (
  directory: DirectoryContact[] | undefined
): DirectoryContact[] => {
  const seen = new Set<number>();
  const list: DirectoryContact[] = [];
  for (const c of directory ?? []) {
    if (c.type !== "company" || !c.userId) continue;
    if (seen.has(c.userId)) continue;
    seen.add(c.userId);
    list.push(c);
  }
  return list.sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" })
  );
};

type InviteContactRowProps = {
  item: DirectoryContact;
  isSelected: boolean;
  contentPadH: number;
  nameColor: "color-colors-text-text-primary" | "white";
  subtleBorder: string;
  onToggle: (userId: number) => void;
};

const InviteContactRow = memo(function InviteContactRow({
  item,
  isSelected,
  contentPadH,
  nameColor,
  subtleBorder,
  onToggle
}: InviteContactRowProps) {
  const userId = item.userId!;

  return (
    <TouchableOpacity
      onPress={() => onToggle(userId)}
      style={[styles.row, { paddingHorizontal: contentPadH }]}
    >
      <Avatar
        size={42}
        source={item.avatarThumbnailPath || item.avatarPath || undefined}
        name={item.name || "User"}
      />
      <View style={styles.rowName}>
        <Text
          size={fontSize.md}
          weight="semiBold"
          color={nameColor}
          numberOfLines={1}
        >
          {item.name || "Unknown"}
        </Text>
      </View>
      <View
        style={[
          styles.checkCircle,
          { borderColor: subtleBorder },
          isSelected ? styles.checkCircleSelected : null
        ]}
      >
        {isSelected ? <Icon name="check" size={16} color="white" /> : null}
      </View>
    </TouchableOpacity>
  );
});

export const MeetingInviteOthersDrawer = ({
  meetURL,
  dialInNum,
  pin,
  roomId,
  token,
  creatorName,
  onClose,
  appearance = "meeting",
  onBack
}: MeetingInviteOthersDrawerProps) => {
  const theme = useTheme();
  const isAppAppearance = appearance === "app";
  const subtleBorder = isAppAppearance
    ? theme.colors["color-colors-border-border-secondary"]
    : "#3a3f44";
  const rootBg = isAppAppearance
    ? theme.colors["color-colors-background-bg-secondary"]
    : "#1f1f21";
  const titleColor = isAppAppearance
    ? "color-colors-text-text-primary"
    : "white";
  const nameColor = isAppAppearance
    ? "color-colors-text-text-primary"
    : "white";
  const sendActionColor = isAppAppearance
    ? "color-component-colors-utility-brand-utility-brand-700"
    : "white";
  const contentPadH = isAppAppearance ? padding.lg : padding.xl;
  const { createOrJoinDMChannel, findExistingDMChannel, isConnected } =
    useSendbirdContext();
  const directory = useSelector((state: State) => state.directoryReducer.directory);

  const [searchValue, setSearchValue] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableContacts = useMemo(
    () => buildCompanyInviteContacts(directory),
    [directory]
  );

  const filteredContacts = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) return availableContacts;
    return availableContacts.filter((c) =>
      (c.name || "").toLowerCase().includes(q)
    );
  }, [availableContacts, searchValue]);

  const selectionKey = useMemo(
    () => Array.from(selectedContacts).sort((a, b) => a - b).join(","),
    [selectedContacts]
  );

  const metaArrays = useMemo(
    () =>
      buildMeetingInviteMetaArrays({
        meetURL,
        dialInNum,
        pin,
        roomId,
        token,
        creatorName
      }),
    [creatorName, dialInNum, meetURL, pin, roomId, token]
  );

  const toggleSelect = useCallback((userId: number) => {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const sendInvites = useCallback(async () => {
    if (!isConnected) {
      toast.error("Chat is not connected yet. Please try again.");
      return;
    }
    const ids = Array.from(selectedContacts);
    if (ids.length === 0) return;
    setIsSubmitting(true);
    try {
      for (const userId of ids) {
        const invitee = availableContacts.find((c) => c.userId === userId);
        if (!invitee?.userId) continue;

        try {
          await createUserInSendbird(
            String(invitee.userId),
            invitee.name || "Unknown",
            invitee.avatarThumbnailPath || invitee.avatarPath || undefined
          );
        } catch {
          // ignore (often already exists)
        }

        const targetUserId = String(invitee.userId);
        const existing = findExistingDMChannel([targetUserId]);
        if (!existing) {
          const res = await createOrJoinDMChannel([targetUserId]);
          if (!res.success || !res.channelUrl) {
            throw new Error(res.error || "Failed to create DM");
          }
        }

        const channel = existing ?? findExistingDMChannel([targetUserId]);
        if (!channel) {
          logger.warn("DM channel not found after create/join", { targetUserId });
          continue;
        }

        const params: UserMessageCreateParams = {
          message: "",
          customType: "MEETING_INVITE",
          mentionedUserIds: [targetUserId],
          metaArrays
        };
        channel.sendUserMessage(params as any);
      }

      toast.success(`Sent ${ids.length} invite${ids.length === 1 ? "" : "s"}`);
      onClose?.();
    } catch (e) {
      logger.error("Failed to send meeting invites", e);
      toast.error("Failed to send invites");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    availableContacts,
    createOrJoinDMChannel,
    findExistingDMChannel,
    isConnected,
    metaArrays,
    onClose,
    selectedContacts
  ]);

  const keyExtractor = useCallback(
    (item: DirectoryContact) => String(item.userId),
    []
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<DirectoryContact> | null | undefined, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index
    }),
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: DirectoryContact }) => (
      <InviteContactRow
        item={item}
        isSelected={!!item.userId && selectedContacts.has(item.userId)}
        contentPadH={contentPadH}
        nameColor={nameColor}
        subtleBorder={subtleBorder}
        onToggle={toggleSelect}
      />
    ),
    [contentPadH, nameColor, selectedContacts, subtleBorder, toggleSelect]
  );

  const listEmpty = useMemo(
    () => (
      <View style={{ paddingHorizontal: contentPadH, paddingTop: padding.xl }}>
        <Text size={fontSize.sm} color="color-colors-text-text-tertiary">
          No users found.
        </Text>
      </View>
    ),
    [contentPadH]
  );

  const sendLabel =
    selectedContacts.size > 0
      ? isSubmitting
        ? "Sending..."
        : `Send (${selectedContacts.size})`
      : "";

  return (
    <View style={[styles.root, { backgroundColor: rootBg }]}>
      {isAppAppearance && onBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={[styles.backRow, { paddingHorizontal: contentPadH }]}
          accessibilityRole="button"
        >
          <Icon name="chevron-left" size={18} type="outline" />
          <Text
            size={fontSize.sm}
            weight="semiBold"
            color="color-colors-text-text-secondary"
          >
            Back
          </Text>
        </TouchableOpacity>
      ) : null}

      <View style={[styles.headerRow, { paddingHorizontal: contentPadH}]}>
        <View style={[styles.headerTitleWrap]}>
          {isAppAppearance ? (
            <Text size={fontSize.lg} weight="semiBold" color={titleColor} style={{textAlign: 'left'}}>
              Invite others
            </Text>
          ) : (
            <Text size={fontSize.lg} weight="semiBold" color={titleColor} style={{textAlign: 'left'}}>
              Add others
            </Text>
          )}
        </View>

        <View style={styles.headerSendSlot}>
          {selectedContacts.size > 0 ? (
            isAppAppearance ? (
              <TouchableOpacity
                onPress={() => void sendInvites()}
                disabled={isSubmitting}
              >
                <Text size={fontSize.md} weight="semiBold" color={sendActionColor}>
                  {sendLabel}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => void sendInvites()}
                disabled={isSubmitting}
              >
                <View
                  style={[styles.sendPill, isSubmitting ? styles.sendPillDisabled : null]}
                >
                  <Text size={fontSize.sm} weight="semiBold" color={sendActionColor}>
                    {sendLabel}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.searchWrap,
          {
            paddingHorizontal: contentPadH,
            marginVertical: isAppAppearance ? padding.md : padding.xl
          }
        ]}
      >
        <SearchBar
          value={searchValue}
          onChangeText={setSearchValue}
          onCancel={() => setSearchValue("")}
          placeholder="Search coworkers..."
          {...(isAppAppearance
            ? {
                borderColor: subtleBorder,
                backgroundColor:
                  theme.colors["color-colors-background-bg-primary"]
              }
            : {
                borderColor: subtleBorder,
                backgroundColor: "#2a2f34",
                iconColor: "rgba(255,255,255,0.7)",
                cancelTextColor: "white",
                style: { color: "white" }
              })}
        />
      </View>

      <FlatList
        style={styles.list}
        data={filteredContacts}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        extraData={selectionKey}
        getItemLayout={getItemLayout}
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        ListEmptyComponent={listEmpty}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingBottom: padding["4xl"]
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: padding.xs,
    paddingTop: padding.md,
    paddingBottom: padding.sm
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: padding.lg,
    minHeight: 48
  },
  headerTitleWrap: {
    flex: 1,
    paddingRight: padding.md
  },
  headerSendSlot: {
    minWidth: 108,
    alignItems: "flex-end",
    justifyContent: "center"
  },
  sendPill: {
    backgroundColor: "#3f9df8",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  sendPillDisabled: {
    opacity: 0.65
  },
  searchWrap: {},
  list: {
    flex: 1
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: padding.md,
    gap: padding.md,
    height: ROW_HEIGHT
  },
  rowName: {
    flex: 1,
    minWidth: 0
  },
  checkCircle: {
    height: 24,
    width: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  checkCircleSelected: {
    backgroundColor: "#3f9df8"
  }
});
