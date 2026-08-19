import React, { useEffect, useMemo, useState } from "react";
import { BackHandler, Platform, View, TouchableOpacity } from "react-native";
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
import { createUserInSendbird } from "shared/api/chat/methods.ts";
import { toast } from "@backpackapp-io/react-native-toast";
import { Logger } from "shared/utils/Logger.ts";

const logger = new Logger("AddPeopleDrawer: ");

interface AddPeopleDrawerProps {
  onClose?: () => void;
}

export const AddPeopleDrawer = ({ onClose }: AddPeopleDrawerProps) => {
  const { currentChannel: channel, sendbirdInstance, isConnected } =
    useSendbirdContext();
  const { directory } = useSelector((state: State) => state.directoryReducer);
  const theme = useTheme();

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose?.();
      return true;
    });

    return () => sub.remove();
  }, [onClose]);

  const [searchValue, setSearchValue] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<Set<number>>(
    new Set()
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendbirdAvatarByUserId, setSendbirdAvatarByUserId] = useState<
    Record<string, string>
  >({});

  const existingMemberIds = useMemo(() => {
    if (!channel?.members) return new Set<string>();
    return new Set(channel.members.map((m) => m.userId));
  }, [channel?.members]);

  const availableContacts = useMemo(() => {
    return directory.filter(
      (contact) =>
        contact.type === "company" &&
        contact.userId &&
        !existingMemberIds.has(contact.userId.toString())
    );
  }, [directory, existingMemberIds]);


  const filteredContacts = useMemo(() => {
    if (!searchValue.trim()) {
      return availableContacts;
    }

    const searchLower = searchValue.toLowerCase().trim();

    return availableContacts.filter((contact) =>
      contact.name?.toLowerCase().includes(searchLower)
    );
  }, [availableContacts, searchValue]);

  // Fetch Sendbird profile URLs for visible users so we can fallback when
  // directory avatar URLs are expired/forbidden.
  useEffect(() => {
    let cancelled = false;

    const fetchSendbirdAvatars = async () => {
      if (!sendbirdInstance || !isConnected || filteredContacts.length === 0) {
        return;
      }

      

      const visibleUserIds = filteredContacts
        .slice(0, 50)
        .map((contact) => contact.userId?.toString())
        .filter(Boolean) as string[];



      const missingUserIds = visibleUserIds.filter(
        (id) => !sendbirdAvatarByUserId[id]
      );

      if (missingUserIds.length === 0) return;

      try {
        const queryFactory = (sendbirdInstance as any)
          ?.createApplicationUserListQuery;
        if (typeof queryFactory !== "function") return;

        const query = queryFactory.call(sendbirdInstance, {
          userIdsFilter: missingUserIds,
          limit: missingUserIds.length
        });

        const users = await query.next();
        if (!Array.isArray(users) || cancelled) return;

        const nextMap: Record<string, string> = {};
        users.forEach((user: any) => {
          const userId = user?.userId?.toString();
          const profileUrl = user?.profileUrl;
          if (
            userId &&
            typeof profileUrl === "string" &&
            profileUrl.trim().length > 0
          ) {
            nextMap[userId] = profileUrl.trim();
          }
        });

        if (Object.keys(nextMap).length > 0 && !cancelled) {
          setSendbirdAvatarByUserId((prev) => ({ ...prev, ...nextMap }));
        }
      } catch (error) {
        logger.debug("Could not fetch Sendbird user avatars", error);
      }
    };

    void fetchSendbirdAvatars();
    return () => {
      cancelled = true;
    };
  }, [filteredContacts, sendbirdInstance, isConnected, sendbirdAvatarByUserId]);

  const handleToggleContact = (userId: number) => {
    setSelectedContacts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const handleAddPeople = async () => {
    if (!channel || selectedContacts.size === 0) return;

    setIsSubmitting(true);
    try {
      const selectedUsers = Array.from(selectedContacts)
        .map((id) => {
          const contact = directory.find((c) => c.userId === id);
          return contact;
        })
        .filter(Boolean);

      const userIds = selectedUsers.map((user) => String(user!.userId));

      // Create users in Sendbird first if they don't exist
      await Promise.all(
        selectedUsers.map((user) =>
          createUserInSendbird(
            String(user!.userId),
            user!.name || "Unknown",
            sendbirdAvatarByUserId[String(user!.userId)] ||
              user!.avatarThumbnailPath ||
              user!.avatarPath ||
              undefined
          ).catch(() => {
            // User might already exist, ignore error
          })
        )
      );

      // Use Sendbird SDK to invite users
      await channel.inviteWithUserIds(userIds);
      await channel.refresh();

      toast.success(
        `Added ${selectedContacts.size} ${
          selectedContacts.size === 1 ? "person" : "people"
        }`
      );
      onClose?.();
    } catch (e) {
      logger.error("Error adding users to channel", e);
      toast.error("Failed to add people");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!channel) {
    return (
      <View>
        <Text>Error loading channel</Text>
      </View>
    );
  }


  return (
    <View style={{ flex: 1, paddingBottom: padding["4xl"] }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: padding.xl,
          paddingVertical: padding.lg
        }}
      >
        <Text size={fontSize.lg} weight={"semiBold"}>
          Add People
        </Text>
        {selectedContacts.size > 0 && (
          <TouchableOpacity onPress={handleAddPeople} disabled={isSubmitting}>
            <Text
              size={fontSize.md}
              weight={"semiBold"}
              color={"color-component-colors-utility-brand-utility-brand-700"}
            >
              {isSubmitting ? "Adding..." : `Add (${selectedContacts.size})`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View
        style={{ paddingHorizontal: padding.xl, marginVertical: padding.xl }}
      >
        <SearchBar
          value={searchValue}
          onChangeText={setSearchValue}
          onCancel={() => setSearchValue("")}
          placeholder="Search coworkers..."
        />
      </View>

      <FlatList
        data={filteredContacts}
        renderItem={({ item }) => (
          <ContactRow
            contact={item}
            avatarSource={
              sendbirdAvatarByUserId[String(item.userId)] ||
              item?.avatarThumbnailPath ||
              item?.avatarPath ||
              undefined
            }
            isSelected={selectedContacts.has(item.userId!)}
            onToggle={() => handleToggleContact(item.userId!)}
          />
        )}
        keyExtractor={(item) => item.userId?.toString() || ""}
      />
    </View>
  );
};

interface ContactRowProps {
  contact: any;
  avatarSource?: string;
  isSelected: boolean;
  onToggle: () => void;
}

const ContactRow = ({
  contact,
  avatarSource,
  isSelected,
  onToggle
}: ContactRowProps) => {
  const theme = useTheme();

  return (
    <TouchableOpacity
      onPress={onToggle}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: padding.lg,
        paddingHorizontal: padding.xl
      }}
    >
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: padding.xl
        }}
      >
        <Avatar
          borderRadius={borderRadius.md}
          source={avatarSource}
          name={contact?.name}
        />
        <Text size={fontSize.sm} weight={"medium"}>
          {contact?.name}
        </Text>
      </View>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: borderRadius.full,
          borderWidth: 2,
          borderColor: isSelected
            ? theme.colors[
                "color-component-colors-utility-brand-utility-brand-700"
              ]
            : theme.colors["color-colors-border-border-secondary"],
          backgroundColor: isSelected
            ? theme.colors[
                "color-component-colors-utility-brand-utility-brand-700"
              ]
            : "transparent",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {isSelected && (
          <Icon name="check" size={12} color={theme.colors.white} />
        )}
      </View>
    </TouchableOpacity>
  );
};
