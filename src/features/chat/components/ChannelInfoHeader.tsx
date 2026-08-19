import React, { useMemo } from "react";
import { View, StyleSheet, Keyboard } from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { Text } from "shared/components/Text.tsx";
import { Avatar } from "shared/components/Avatar.tsx";
import Icon from "shared/components/Icon.tsx";
import { Button } from "shared/components/Button.tsx";
import {
  borderRadius,
  componentSize,
  fontSize,
  padding
} from "core/theme/theme.ts";
import { CustomChannelType } from "features/chat/types.ts";
import { useSelector } from "react-redux";
import { State } from "store/types.ts";
import { GroupChannel } from "@sendbird/chat/groupChannel";
import { User } from "shared/api/users/types.ts";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { AddPeopleDrawer } from "features/chat/components/drawers/AddPeopleDrawer.tsx";
import { ChannelDetailsDrawer } from "features/chat/components/drawers/ChannelDetailsDrawer.tsx";
import {
  appendAvatarCacheBust,
  appendSelfAvatarCacheBust,
  avatarMediaCacheKey
} from "shared/utils/avatarCache.ts";

interface ChannelInfoHeaderProps {
  channel: GroupChannel;
  user: User;
}

export const ChannelInfoHeader = ({
  channel,
  user
}: ChannelInfoHeaderProps) => {
  const theme = useTheme();
  const { companyContacts, personalContacts } = useSelector(
    (state: State) => state.directoryReducer
  );
  const profileMediaVersion =
    (user as { profileMediaVersion?: number })?.profileMediaVersion ?? 0;
  const { openDrawer, closeDrawer } = useDrawer();

  const contacts = useMemo(
    () => [...(companyContacts || []), ...(personalContacts || [])],
    [companyContacts, personalContacts]
  );

  const isGroup =
    channel.customType === CustomChannelType.groupChannel(user?.tenantId || -1);
  const isPersonal =
    channel.customType ===
    CustomChannelType.personalChannel(user?.tenantId || -1);
  const isDM =
    channel.customType === CustomChannelType.dmChannel(user?.tenantId || -1);

  const handleAddPeople = () => {
    openDrawer(<AddPeopleDrawer onClose={closeDrawer} />);
  };

  const handleEditDescription = () => {
    Keyboard.dismiss();
    openDrawer(<ChannelDetailsDrawer />);
  };

  let memberInfo: { avatar: string; name: string } | null = null;
  if (isDM) {
    const members = channel.members.filter(
      (m: any) => parseInt(m.userId) !== user.id
    );
    const memberContacts = contacts.filter((c: any) =>
      members.some((m: any) => c.userId?.toString() === m.userId)
    );
    const first = memberContacts[0];
    const base =
      (first as any)?.avatarThumbnailPath || (first as any)?.avatarPath || "";
    memberInfo = {
      avatar: base
        ? appendAvatarCacheBust(
            base,
            avatarMediaCacheKey(
              (first as any)?.avatarThumbnailPath,
              (first as any)?.avatarPath
            )
          )
        : "",
      name: (first as any)?.name || (members[0] as any)?.nickname || "Unknown"
    };
  }

  let infoText = null;
  if (isGroup) {
    let creatorName = "Someone";
    if (channel.creator && channel.creator.userId) {
      const isCurrentUser = parseInt(channel.creator.userId) === user.id;
      if (isCurrentUser) {
        creatorName =
          user.extName || channel.creator.nickname || channel.creator.userId;
      } else {
        const creatorContact = contacts.find(
          (c: any) => c.userId?.toString() === channel.creator!.userId
        );
        creatorName =
          (creatorContact as any)?.name ||
          channel.creator.nickname ||
          channel.creator.userId;
      }
    }
    // Format date
    const createdAt = channel.createdAt ? new Date(channel.createdAt) : null;
    const dateStr = createdAt
      ? createdAt.toLocaleDateString(undefined, {
          month: "long",
          day: "numeric"
        })
      : "some time";
    infoText = (
      <Text
        style={{ marginTop: padding.md }}
        color="color-colors-text-text-tertiary"
        align="left"
        size={fontSize.md}
        weight="medium"
      >
        @{creatorName} created this channel on {dateStr}. This is the very
        beginning of the {channel.name} channel.
      </Text>
    );
  } else if (isPersonal) {
    infoText = (
      <Text
        style={{ marginTop: padding.md }}
        color="color-colors-text-text-tertiary"
        align="left"
        size={fontSize.md}
        weight="medium"
      >
        This is your personal channel. Jot down important things, or just have a
        conversation.
      </Text>
    );
  } else if (isDM) {
    const members = channel.members.filter(
      (m: any) => parseInt(m.userId) !== user.id
    );
    const memberNames = members.map((m: any) => {
      const contact = contacts.find(
        (c: any) => c.userId?.toString() === m.userId
      );
      return (contact as any)?.name || m.nickname || "Unknown";
    });
    const namesText = memberNames
      .map((n, i) =>
        i === memberNames.length - 1 && i > 0 ? `and @${n}` : `@${n}`
      )
      .join(", ")
      .replace(", and", " and");
    infoText = (
      <Text
        style={{ marginTop: padding.md }}
        color="color-colors-text-text-tertiary"
        align="left"
        size={fontSize.md}
        weight="medium"
      >
        This is the very beginning of your direct message history with{" "}
        {namesText}.
      </Text>
    );
  }

  return (
    <View style={styles.headerContainer}>
      {isGroup ? (
        <View style={styles.row}>
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
            size={fontSize.lg}
            weight={"semiBold"}
            color={
              "color-component-colors-components-buttons-tertiary-button-tertiary-fg"
            }
          >
            {channel.name}
          </Text>
        </View>
      ) : isPersonal ? (
        <View style={styles.row}>
          <Avatar
            size={48}
            source={appendSelfAvatarCacheBust(
              user.avatarPath || undefined,
              user.avatarPath,
              profileMediaVersion
            )}
            borderRadius={borderRadius.md}
            status="online"
          />
          <View
            style={{
              flexDirection: "column",
              alignItems: "flex-start",
              gap: padding.xxs
            }}
          >
            <Text size={fontSize.md} weight={"semiBold"}>
              {user.extName}
            </Text>
            <Text
              size={fontSize.sm}
              color={"color-colors-text-text-quarterary"}
            >
              you
            </Text>
          </View>
        </View>
      ) : isDM ? (
        <View style={styles.row}>
          <Avatar
            size={48}
            source={memberInfo?.avatar}
            borderRadius={borderRadius.md}
            status="online"
          />
          <View
            style={{
              flexDirection: "column",
              alignItems: "flex-start",
              gap: padding.xxs
            }}
          >
            <Text size={fontSize.md} weight={"semiBold"}>
              {memberInfo?.name}
            </Text>
          </View>
        </View>
      ) : null}
      {infoText}
      <View style={styles.buttonRow}>
        <Button
          type="outline"
          size={fontSize.sm}
          icon={<Icon name="edit-01" size={20} />}
          paddingVertical={padding.md}
          weight={"semiBold"}
          onPress={handleEditDescription}
          style={{ flex: 1 }}
        >
          Add description
        </Button>
        {isGroup && (
          <Button
            type="outline"
            size={fontSize.sm}
            icon={<Icon name="user-plus-01" size={20} />}
            paddingVertical={padding.md}
            weight={"semiBold"}
            onPress={handleAddPeople}
            style={{ flex: 1 }}
          >
            Add coworkers
          </Button>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: padding["3xl"],
    paddingVertical: padding.lg
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: padding.lg
  },
  buttonRow: {
    flexDirection: "row",
    gap: padding.md,
    marginTop: padding.lg
  }
});
