import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { FlatList } from "react-native-gesture-handler";
import { Text } from "shared/components/Text.tsx";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import SearchBar from "shared/components/utils/SearchBar.tsx";
import { Member } from "@sendbird/chat/groupChannel";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";
import { useSelector } from "react-redux";
import { State } from "store/types.ts";
import { Avatar } from "shared/components/Avatar.tsx";
import { removeUserFromChannel } from "shared/api/chat/methods.ts";
import { toast } from "@backpackapp-io/react-native-toast";
import { Logger } from "shared/utils/Logger.ts";
import { Role } from "@sendbird/chat";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { AddPeopleDrawer } from "features/chat/components/drawers/AddPeopleDrawer.tsx";
import Icon from "shared/components/Icon.tsx";
import { Button } from "shared/components/Button.tsx";
import {
  appendAvatarCacheBust,
  avatarMediaCacheKey
} from "shared/utils/avatarCache.ts";

const logger = new Logger("MembersTab: ");

export const MembersTab = () => {
  const { currentChannel: channel } = useSendbirdContext();
  const { companyContacts, personalContacts } = useSelector(
    (state: State) => state.directoryReducer
  );
  const { openDrawer, closeDrawer } = useDrawer();

  const [searchValue, setSearchValue] = useState("");

  const contacts = useMemo(
    () => [...(companyContacts || []), ...(personalContacts || [])],
    [companyContacts, personalContacts]
  );

  const handleAddMembers = () => {
    if (channel?.myRole !== "operator") {
      toast.error("You are not authorized to add members");
      return;
    }
    openDrawer(<AddPeopleDrawer onClose={closeDrawer} />);
  };

  const filteredMembers = useMemo(() => {
    if (!channel?.members) return [];

    if (!searchValue.trim()) return channel.members;

    const searchLower = searchValue.toLowerCase().trim();

    return channel.members.filter((member) => {
      const c = contacts.find(
        (contact) => (contact as any).userId?.toString() === member.userId
      );
      const name = (c as any)?.name ?? member.nickname ?? "";
      return name.toLowerCase().includes(searchLower);
    });
  }, [channel?.members, searchValue, contacts]);

  if (!channel) {
    return (
      <View>
        <Text>Error loading channel members</Text>
      </View>
    );
  }

  const canAddMembers = channel.myRole === "operator";

  return (
    <View style={{ flex: 1 }}>
      {canAddMembers ? (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            alignItems: "center",
            marginBottom: padding.xl
          }}
        >
          <Button
            type="outline"
            size={fontSize.sm}
            icon={<Icon name="user-plus-01" size={20} />}
            paddingVertical={padding.md}
            weight={"semiBold"}
            onPress={handleAddMembers}
          >
            Add People
          </Button>
        </View>
      ) : null}

      <SearchBar
        value={searchValue}
        onChangeText={setSearchValue}
        onCancel={() => setSearchValue("")}
        placeholder="Search members..."
      />
      <FlatList
        data={filteredMembers}
        renderItem={({ item }) => <MembersRow member={item} contacts={contacts} />}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: padding["4xl"] }}
        nestedScrollEnabled={true}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

interface MembersRowProps {
  member: Member;
  contacts: any[];
}

const MembersRow = ({ member, contacts }: MembersRowProps) => {
  const { currentChannel: channel } = useSendbirdContext();
  const { user: activeUser } = useSelector((state: State) => state.userReducer);

  const [userRole, setUserRole] = useState(member.role);

  const contact = useMemo(
    () =>
      contacts.find((c) => (c as any).userId?.toString() === member.userId),
    [contacts, member.userId]
  );

  const displayName =
    (contact as any)?.name ?? member.nickname ?? member.userId ?? "Unknown";
  const avatarBase =
    (contact as any)?.avatarThumbnailPath ||
    (contact as any)?.avatarPath ||
    (member as any).plainProfileUrl ||
    "";
  const cacheKey = contact
    ? avatarMediaCacheKey(
        (contact as any)?.avatarThumbnailPath,
        (contact as any)?.avatarPath
      )
    : avatarMediaCacheKey((member as any).plainProfileUrl, null);
  const avatarSource = avatarBase
    ? appendAvatarCacheBust(avatarBase, cacheKey)
    : undefined;

  const handleRoleUpdate = async () => {
    if (!channel) return;
    try {
      if (userRole !== "operator") {
        await channel.addOperators([member.userId]);
        setUserRole(Role.OPERATOR);
        toast.success("User promoted to admin");
      } else {
        await channel.removeOperators([member.userId]);
        setUserRole(Role.NONE);
        toast.success("Admin role removed");
      }
    } catch (e) {
      toast.error("Error changing user permissions");
      logger.error("Error toggling members", e);
    }
  };

  const handleMemberRemove = async () => {
    if (!channel) return;
    try {
      await removeUserFromChannel(channel.url, member.userId);
    } catch (e) {
      logger.error("Error removing user", e);
      toast.error("Error removing user");
    }
  };

  const isCreator = channel?.creator?.userId === member.userId;
  const isSelf = member.userId === activeUser?.id?.toString();
  const canChangeRole =
    channel?.myRole === "operator" && !isCreator && !isSelf;

  return (
    <View
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: padding.xl
      }}
    >
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: padding.md
        }}
      >
        <Avatar
          borderRadius={borderRadius.md}
          source={avatarSource}
          name={displayName}
        />
        <View style={{ flex: 1 }}>
          <Text
            style={{ lineHeight: 20 }}
            size={fontSize.sm}
            align={"left"}
            weight={"medium"}
          >
            {displayName}
          </Text>
          {userRole === "operator" && (
            <Text
              size={fontSize.xs}
              color={"color-colors-text-text-tertiary"}
              weight={"medium"}
              align={"left"}
            >
              (Admin)
            </Text>
          )}
        </View>
      </View>
      <View style={{ flexShrink: 0, alignItems: "flex-start" }}>
        {canChangeRole && (
          <View
            style={{
              display: "flex",
              flexDirection: "row",
              gap: padding.lg
            }}
          >
            <Text
              size={fontSize.sm}
              weight={"semiBold"}
              onPress={handleRoleUpdate}
            >
              {userRole === "operator" ? "Remove Admin" : "Make Admin"}
            </Text>
            <Text
              size={fontSize.sm}
              weight={"semiBold"}
              color={
                "component-colors-components-buttons-tertiary-error-button-tertiary-error-fg"
              }
              onPress={handleMemberRemove}
            >
              Remove
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};
