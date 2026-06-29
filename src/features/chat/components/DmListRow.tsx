// React Imports
import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { useTheme } from "hooks/use-theme.ts";
import { useQuery } from "@tanstack/react-query";
import { getCompanyContacts, getPersonalContacts } from "shared/api/directory/methods.ts";

// Type Imports
import { State } from "store/types.ts";

// Component Imports
import { TouchableOpacity, View, StyleSheet } from "react-native";
import { channelListRowStyles } from "features/chat/styles/component-styles.ts";
import { Text } from "shared/components/Text.tsx";
import {
  borderRadius,
  componentSize,
  fontSize,
  padding
} from "core/theme/theme.ts";
import { Avatar } from "shared/components/Avatar.tsx";
import { ChatNavigationProp, FilteredDMChannel } from "features/chat/types.ts";
import { useNavigation } from "@react-navigation/core";
import { Routes } from "core/navigation/types/types.ts";
import {
  appendAvatarCacheBust,
  appendSelfAvatarCacheBust,
  avatarMediaCacheKey
} from "shared/utils/avatarCache.ts";

type DmListRowProps = {
  channel: FilteredDMChannel;
};

export const DmListRow = ({ channel }: DmListRowProps) => {
  const theme = useTheme();
  const navigation = useNavigation<ChatNavigationProp>();
  const { accessToken } = useSelector(({ authReducer }: State) => authReducer);
  const user = useSelector((state: State) => state.userReducer.user);

  const { data: companyContacts = [] } = useQuery({
    queryKey: ["companyContacts", accessToken],
    queryFn: () => getCompanyContacts(accessToken!),
    enabled: !!accessToken
  });
  const { data: personalContacts = [] } = useQuery({
    queryKey: ["personalContacts", accessToken],
    queryFn: () => getPersonalContacts(accessToken!),
    enabled: !!accessToken
  });

  // Hide channel until it has a proper name.
  const name = channel.name?.toLowerCase().trim() || "";
  if (!name || name.startsWith("unnamed")) {
    return null;
  }

  const mergedContacts = useMemo(() => {
    const byUserId = new Map<
      string,
      { avatarPath?: string | null; avatarThumbnailPath?: string | null; name?: string; userId?: number }
    >();
    [...(companyContacts || []), ...(personalContacts || [])].forEach((c) => {
      if (c?.userId != null) byUserId.set(String(c.userId), c);
    });
    return byUserId;
  }, [companyContacts, personalContacts]);

  const isGroupChannel =
    channel.memberUserIds && channel.memberUserIds.length > 2;
  const displayName = useMemo(() => {
    if (!isGroupChannel) return channel.name;
    const otherMemberIds =
      channel.memberUserIds?.filter(
        (userId) => userId.toString() !== user?.id?.toString()
      ) || [];
    const fullNames = otherMemberIds
      .map((id) => mergedContacts.get(id.toString())?.name?.trim())
      .filter(Boolean) as string[];
    if (fullNames.length === 0) return channel.name;
    return fullNames.join(", ");
  }, [
    channel.name,
    channel.memberUserIds,
    mergedContacts,
    isGroupChannel,
    user?.id
  ]);

  const profileMediaVersion =
    (user as { profileMediaVersion?: number })?.profileMediaVersion ?? 0;
  const avatarSource = useMemo(() => {
    const otherIds =
      channel.memberUserIds?.filter(
        (id) => id.toString() !== user?.id?.toString()
      ) || [];
    const firstOther = otherIds[0];

    if (channel.personal) {
      const base = user?.avatarPath ?? channel.avatar ?? "";
      return appendSelfAvatarCacheBust(
        base || undefined,
        user?.avatarPath,
        profileMediaVersion
      );
    }
    if (!firstOther) {
      const base = channel.avatar || "";
      return base
        ? appendAvatarCacheBust(base, avatarMediaCacheKey(base, null))
        : "";
    }
    const contact = mergedContacts.get(firstOther.toString());
    const base =
      contact?.avatarThumbnailPath ||
      contact?.avatarPath ||
      channel.avatar ||
      "";
    return base
      ? appendAvatarCacheBust(
          base,
          avatarMediaCacheKey(
            contact?.avatarThumbnailPath,
            contact?.avatarPath || channel.avatar
          )
        )
      : "";
  }, [
    channel.avatar,
    channel.memberUserIds,
    channel.personal,
    mergedContacts,
    user?.id,
    user?.avatarPath,
    profileMediaVersion
  ]);

  return (
    <TouchableOpacity
      style={[channelListRowStyles.containerStyle]}
      onPress={() =>
        navigation.navigate(Routes.Chat, { channelUrl: channel.url })
      }
    >
      {/* Profile Picture - Fixed width container for consistent alignment */}
      <View style={styles.avatarContainer}>
        <Avatar
          name={channel.name}
          size={componentSize.xs}
          borderRadius={borderRadius.sm}
          status="online"
          source={avatarSource}
        />
      </View>

      {/* Name */}
      <View style={styles.namesContainer}>
        <Text
          size={fontSize.md}
          weight={channel.unreadCount ? "bold" : "medium"}
          numberOfLines={1}
          ellipsizeMode="tail"
          style={styles.nameText}
        >
          {displayName}
        </Text>
        {channel.personal && (
          <Text size={fontSize.sm} color={"color-colors-text-text-quarterary"}>
            you
          </Text>
        )}
      </View>

      {/* Badge - Always reserve space */}
      <View style={styles.badgeWrapper}>
        {channel.unreadCount > 0 && (
          <View
            style={[
              channelListRowStyles.badgeContainer,
              {
                backgroundColor: theme.colors["colors-border-border-error"],
                borderColor:
                  theme.colors["color-colors-foreground-fg-error-primary"]
              }
            ]}
          >
            <Text
              size={fontSize.sm}
              weight="medium"
              color="colors-text-text-primary-on-brand"
            >
              {channel.unreadCount > 9 ? "9+" : channel.unreadCount}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  avatarContainer: {
    width: componentSize.xs,
    height: componentSize.xs,
    alignItems: "center",
    justifyContent: "center"
  },
  namesContainer: {
    flex: 1,
    minWidth: 0,
    marginLeft: padding.lg,
    marginRight: padding.md,
    alignItems: "flex-start",
    justifyContent: "center"
  },
  nameText: {
    textAlign: "left",
    alignSelf: "stretch"
  },
  badgeWrapper: {
    width: 40,
    alignItems: "flex-end",
    justifyContent: "center"
  }
});
