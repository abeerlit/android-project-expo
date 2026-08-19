import React from "react";
import { TouchableOpacity, View, Keyboard } from "react-native";
import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";
import { Avatar } from "shared/components/Avatar.tsx";
import { useTheme } from "hooks/use-theme.ts";
import { useSelector } from "react-redux";
import { State } from "store/types.ts";
import { CustomChannelType } from "features/chat/types.ts";
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
import {
  appendAvatarCacheBust,
  appendSelfAvatarCacheBust,
  avatarMediaCacheKey
} from "shared/utils/avatarCache.ts";

interface ChannelHeaderProps {
  channel: GroupChannel;
}

export const ChannelHeader = ({ channel }: ChannelHeaderProps) => {
  const theme = useTheme();
  const { user } = useSelector((state: State) => state.userReducer);
  const { companyContacts, personalContacts } = useSelector(
    (state: State) => state.directoryReducer
  );
  const navigation = useNavigation();

  const { openDrawer } = useDrawer();

  const isAnyMemberOnline = channel.members
    .filter((member) => parseInt(member.userId) !== user?.id)
    .some((member) => member.connectionStatus === "online");
  const avatarStatus = isAnyMemberOnline ? "online" : "none";

  const memberInfo = React.useMemo(() => {
    const contacts = [...(companyContacts || []), ...(personalContacts || [])];
    const otherMembers = channel.members.filter(
      (member) => parseInt(member.userId) !== user?.id
    );

    if (otherMembers.length === 0) {
      const selfContact = contacts.find(
        (c) => c.userId != null && c.userId === user?.id
      );
      const base =
        selfContact?.avatarThumbnailPath ||
        selfContact?.avatarPath ||
        user?.avatarPath ||
        "";
      const version =
        (user as { profileMediaVersion?: number })?.profileMediaVersion ?? 0;
      return {
        avatar: appendSelfAvatarCacheBust(
          base || undefined,
          user?.avatarPath,
          version
        ),
        name: user?.extName || (selfContact as { name?: string })?.name || ""
      };
    }

    const memberContacts = contacts.filter((c) =>
      otherMembers.some((m) => c.userId?.toString() === m.userId)
    );
    const first = memberContacts[0];
    const base = first?.avatarThumbnailPath || first?.avatarPath || "";
    return {
      avatar: base
        ? appendAvatarCacheBust(
            base,
            avatarMediaCacheKey(first?.avatarThumbnailPath, first?.avatarPath)
          )
        : "",
      name: (first as { name?: string })?.name || ""
    };
  }, [
    channel.members,
    companyContacts,
    personalContacts,
    user?.id,
    user?.avatarPath,
    user?.extName,
    (user as { profileMediaVersion?: number })?.profileMediaVersion
  ]);

  const remainingMembers = channel.members.length - 2; // Subtract the current user and the shown avatar

  // Methods
  const handleChannelDetails = () => {
    Keyboard.dismiss();
    openDrawer(<ChannelDetailsDrawer />);
  };

  return (
    <View
      style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: padding["3xl"],
        height: 60,
        borderBottomColor: theme.colors["color-colors-border-border-secondary"],
        borderBottomWidth: 1
      }}
    >
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
      {channel.customType ===
      CustomChannelType.groupChannel(user?.tenantId || -1) ? (
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

      {CustomChannelType.groupChannel(user?.tenantId || -1) ===
      channel.customType ? (
        <View></View>
      ) : (
        <TouchableOpacity
          onPress={() => console.log("Call Pressed")}
          style={{
            padding: padding.md,
            borderWidth: 1,
            borderRadius: borderRadius.md,
            borderColor:
              theme.colors[
                "component-colors-components-buttons-secondary-button-secondary-fg"
              ]
          }}
        >
          <Icon name={"phone"} size={componentSize.xl} />
        </TouchableOpacity>
      )}
    </View>
  );
};
