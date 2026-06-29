// React Imports
import React, { useState, useMemo, useCallback, useEffect } from "react";
import { StyleSheet, View, FlatList, TouchableOpacity } from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";
import { useDebounceFn } from "ahooks";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { TextInput } from "shared/components/TextInput.tsx";
import { Button } from "shared/components/Button.tsx";
import { useSelector } from "react-redux";
import { State } from "store/types.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { Avatar } from "shared/components/Avatar.tsx";
import Icon from "shared/components/Icon.tsx";
import { ThreadPreview } from "features/new/components/ThreadPreview.tsx";

// Navigation
import { useNavigation } from "@react-navigation/native";
import { Routes } from "core/navigation/types/types.ts";
import { ChatNavigationProp, ChatMessage } from "features/chat/types.ts";

// Context
import { useDrawer } from "core/drawer/DrawerContext.tsx";

// Utils
import { toast } from "@backpackapp-io/react-native-toast";
import { Logger } from "shared/utils/Logger.ts";
import { GroupChannel } from "@sendbird/chat/groupChannel";

export type NewMessageItem = {
  name: string;
  avatarPath?: string;
  channelUrl?: string;
  userId?: string;
  type: "channel" | "user" | "dm";
  public?: boolean;
};

export const MessageDrawer = () => {
  const logger = new Logger("MessageDrawer");
  const theme = useTheme();
  const navigation = useNavigation<ChatNavigationProp>();
  const { closeDrawer } = useDrawer();

  const { directory } = useSelector((state: State) => state.directoryReducer);
  const { user } = useSelector((state: State) => state.userReducer);

  const {
    filteredGroupChannels,
    filteredDMChannels,
    createOrJoinDMChannel,
    findExistingDMChannel,
    getChannelPreviewMessages
  } = useSendbirdContext();

  // Memoize business contacts to avoid recalculating on every render
  const businessContacts = useMemo(
    () =>
      directory.filter(
        (contact) => contact.type === "company" && contact.userId
      ),
    [directory]
  );

  const [recipient, setRecipient] = useState("");
  const [searchResults, setSearchResults] = useState<NewMessageItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<
    NewMessageItem[]
  >([]);

  // Thread preview state
  const [existingChannel, setExistingChannel] = useState<GroupChannel | null>(
    null
  );
  const [previewMessages, setPreviewMessages] = useState<ChatMessage[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Memoize selected user IDs
  const selectedUserIds = useMemo(
    () => new Set(selectedRecipients.map((r) => r.userId).filter(Boolean)),
    [selectedRecipients]
  );

  // Helper function to check if a DM channel contains any selected users
  const dmContainsSelectedUsers = useCallback(
    (memberUserIds?: string[]) => {
      if (!memberUserIds) return false;
      return memberUserIds.some((id) => selectedUserIds.has(id));
    },
    [selectedUserIds]
  );

  // Helper function to create user item from contact
  const createUserItem = useCallback(
    (contact: any): NewMessageItem => ({
      name: contact.name,
      avatarPath: contact.avatarThumbnailPath || undefined,
      userId: contact.userId?.toString(),
      type: "user"
    }),
    []
  );

  // Helper function to create channel item
  const createChannelItem = useCallback(
    (channel: any): NewMessageItem => ({
      name: channel.name,
      channelUrl: channel.url,
      type: "channel",
      public: channel.isPublic
    }),
    []
  );

  // Helper function to create DM item
  const createDMItem = useCallback(
    (dm: any): NewMessageItem => ({
      name: dm.name,
      avatarPath: dm.avatar,
      channelUrl: dm.url,
      type: "dm"
    }),
    []
  );

  const handleSearch = async (searchTerm: string) => {
    setIsSearching(true);

    if (!searchTerm.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const normalizedSearch = searchTerm.toLowerCase().trim();
    const results: NewMessageItem[] = [];

    // Determine search parameters
    const searchingChannels = normalizedSearch.startsWith("#");
    const searchingUsers = normalizedSearch.startsWith("@");
    const searchQuery =
      searchingChannels || searchingUsers
        ? normalizedSearch.slice(1)
        : normalizedSearch;

    // Can only search channels if no recipients are selected
    const canSearchChannels = selectedRecipients.length === 0;

    // Search channels
    if (
      canSearchChannels &&
      (searchingChannels || (!searchingUsers && searchQuery))
    ) {
      results.push(
        ...filteredGroupChannels
          .filter((channel) => channel.name.toLowerCase().includes(searchQuery))
          .map(createChannelItem)
      );
    }

    // Search users and DMs (unless explicitly searching for channels)
    if (!searchingChannels && searchQuery) {
      // Create a map of user IDs to existing DMs for efficient lookup
      const userToDMMap = new Map<string, any[]>();
      filteredDMChannels.forEach((dm) => {
        if (!dm.personal && dm.memberUserIds) {
          dm.memberUserIds.forEach((userId) => {
            if (!userToDMMap.has(userId)) {
              userToDMMap.set(userId, []);
            }
            userToDMMap.get(userId)!.push(dm);
          });
        }
      });

      // Search DM channels that don't contain selected users
      const eligibleDMs = filteredDMChannels.filter(
        (dm) =>
          !dm.personal &&
          dm.name.toLowerCase().includes(searchQuery) &&
          !dmContainsSelectedUsers(dm.memberUserIds)
      );

      // Add DM results
      const addedDMUrls = new Set<string>();
      eligibleDMs.forEach((dm) => {
        results.push(createDMItem(dm));
        addedDMUrls.add(dm.url);
      });

      // Search business contacts
      businessContacts
        .filter(
          (contact) =>
            contact.name.toLowerCase().includes(searchQuery) &&
            !selectedUserIds.has(contact.userId?.toString())
        )
        .forEach((contact) => {
          const contactId = contact.userId?.toString();
          const contactDMs = contactId ? userToDMMap.get(contactId) || [] : [];

          // Check if we've already added DMs for this contact
          const contactDMsAdded = contactDMs.some((dm) =>
            addedDMUrls.has(dm.url)
          );

          // Check if a 1-on-1 DM exists
          const has1on1DM = contactDMs.some(
            (dm) =>
              dm.memberUserIds?.length === 2 &&
              dm.memberUserIds.includes(user?.id?.toString() || "")
          );

          // Only add as user if no 1-on-1 DM exists and we haven't added their DMs
          if (!has1on1DM && !contactDMsAdded) {
            results.push(createUserItem(contact));
          }
        });
    }

    setSearchResults(results);
    setIsSearching(false);
  };

  const { run: debouncedSearch } = useDebounceFn(handleSearch, {
    wait: 500
  });

  const handleRecipientChange = (value: string) => {
    setRecipient(value);
    debouncedSearch(value);
  };

  const handleRecipientSelect = useCallback(
    (item: NewMessageItem) => {
      if (item.type === "dm") {
        // Extract users from DM channel
        const dmChannel = filteredDMChannels.find(
          (dm) => dm.url === item.channelUrl
        );
        if (dmChannel?.memberUserIds) {
          const dmUsers = dmChannel.memberUserIds
            .filter((userId) => userId !== user?.id?.toString())
            .map((userId) => {
              const contact = businessContacts.find(
                (c) => c.userId?.toString() === userId
              );
              return createUserItem(
                contact || { name: `User ${userId}`, userId }
              );
            });

          // Add DM users to existing recipients (avoid duplicates)
          setSelectedRecipients((prev) => {
            const existingUserIds = new Set(prev.map((r) => r.userId));
            const newUsers = dmUsers.filter(
              (user) => !existingUserIds.has(user.userId)
            );
            return [...prev, ...newUsers];
          });
        }
      } else if (item.type === "user") {
        // Add single user (using Set to check for duplicates is more efficient)
        setSelectedRecipients((prev) => {
          if (selectedUserIds.has(item.userId)) return prev;
          return [...prev, item];
        });
      }

      // Clear search
      setRecipient("");
      setSearchResults([]);
    },
    [
      filteredDMChannels,
      user?.id,
      businessContacts,
      createUserItem,
      selectedUserIds
    ]
  );

  const handleBackspace = useCallback(() => {
    if (!recipient && selectedRecipients.length > 0) {
      setSelectedRecipients((prev) => prev.slice(0, -1));
    }
  }, [recipient, selectedRecipients.length]);

  const handleChannelPress = useCallback(
    (channelUrl: string) => {
      closeDrawer();
      navigation.navigate(Routes.Chat, { channelUrl });
    },
    [closeDrawer, navigation]
  );

  // Create a stable key from selected user IDs to use as dependency
  const selectedUserIdsKey = useMemo(() => {
    const ids = selectedRecipients
      .map((r) => r.userId)
      .filter(Boolean)
      .sort()
      .join(",");
    return ids;
  }, [selectedRecipients]);

  // Search for existing thread when recipients change
  useEffect(() => {
    const searchForExistingThread = async () => {
      if (selectedRecipients.length === 0) {
        setExistingChannel(null);
        setPreviewMessages([]);
        return;
      }

      const userIds = selectedRecipients
        .map((r) => r.userId)
        .filter(Boolean) as string[];

      if (userIds.length === 0) return;

      logger.debug("Searching for existing thread with users:", userIds);
      setIsLoadingPreview(true);

      try {
        const foundChannel = findExistingDMChannel(userIds);

        if (foundChannel) {
          logger.debug("Found existing channel:", foundChannel.url);
          setExistingChannel(foundChannel);

          // Fetch preview messages
          const messages = await getChannelPreviewMessages(foundChannel.url);
          setPreviewMessages(messages);
        } else {
          logger.debug("No existing channel found");
          setExistingChannel(null);
          setPreviewMessages([]);
        }
      } catch (error) {
        logger.error("Error searching for existing thread:", error);
      } finally {
        setIsLoadingPreview(false);
      }
    };

    searchForExistingThread();
  }, [selectedUserIdsKey, findExistingDMChannel, getChannelPreviewMessages]);

  const handleStartChat = useCallback(async () => {
    if (selectedRecipients.length === 0) return;

    // If we have an existing channel, just navigate to it
    if (existingChannel) {
      closeDrawer();
      navigation.navigate(Routes.Chat, { channelUrl: existingChannel.url });
      return;
    }

    // Otherwise, create a new channel
    try {
      const userIds = selectedRecipients
        .map((r) => r.userId)
        .filter(Boolean) as string[];

      const result = await createOrJoinDMChannel(userIds);

      if (result.success && result.channelUrl) {
        closeDrawer();
        navigation.navigate(Routes.Chat, { channelUrl: result.channelUrl });
      } else {
        toast.error("Failed to create chat");
        logger.error("Failed to create DM channel:", result.error);
      }
    } catch (error) {
      toast.error("Error creating chat");
      logger.error("Error in handleStartChat:", error);
    }
  }, [
    selectedRecipients,
    existingChannel,
    createOrJoinDMChannel,
    closeDrawer,
    navigation,
    logger
  ]);

  const renderRecipientChip = useCallback(
    (item: NewMessageItem, index: number) => (
      <View
        key={`chip-${item.userId}-${index}`}
        style={[
          styles.chipContainer,
          { borderColor: theme.colors["colors-border-border-primary"] }
        ]}
      >
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
        <Text size={fontSize.xs} weight="medium" style={styles.chipText}>
          {item.name}
        </Text>
      </View>
    ),
    [theme.colors]
  );

  const renderSearchResult = useCallback(
    ({ item }: { item: NewMessageItem }) => {
      const handlePress = () => {
        if (item.type === "channel" && item.channelUrl) {
          handleChannelPress(item.channelUrl);
        } else {
          handleRecipientSelect(item);
        }
      };

      return (
        <TouchableOpacity style={styles.resultItem} onPress={handlePress}>
          {item.type === "channel" ? (
            <View style={styles.iconContainer}>
              <Icon name={item.public ? "hash-01" : "lock-03"} size={22} />
            </View>
          ) : (
            <Avatar
              source={item.avatarPath}
              name={item.name}
              size={32}
              borderRadius={borderRadius.md}
            />
          )}
          <View style={styles.resultTextContainer}>
            <Text size={fontSize.md} weight="medium">
              {item.name.length > 30
                ? `${item.name.slice(0, 30)}...`
                : item.name}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [handleChannelPress, handleRecipientSelect]
  );

  const keyExtractor = useCallback(
    (item: NewMessageItem, index: number) =>
      `${item.type}-${item.channelUrl || item.userId || item.name}-${index}`,
    []
  );

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <WhiteSpace height={3} />
        <Text
          size={fontSize.lg}
          style={[
            styles.title,
            { color: theme.colors["color-colors-text-text-primary"] }
          ]}
        >
          New Message
        </Text>
        <WhiteSpace
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
                onChangeText={handleRecipientChange}
                onKeyPress={({ nativeEvent }) => {
                  if (nativeEvent.key === "Backspace") {
                    handleBackspace();
                  }
                }}
              />
            </View>
          </View>
        </View>
        <WhiteSpace
          style={[
            styles.divider,
            {
              borderColor: theme.colors["color-colors-border-border-secondary"]
            }
          ]}
        />

        {/* Search Results */}
        {recipient.trim().length > 0 && (
          <View style={styles.resultsContainer}>
            {isSearching ? (
              <View style={styles.resultItem}>
                <Text size={fontSize.md} color="colors-text-text-secondary">
                  Searching...
                </Text>
              </View>
            ) : searchResults.length > 0 ? (
              <FlatList
                data={searchResults}
                keyExtractor={keyExtractor}
                renderItem={renderSearchResult}
                showsVerticalScrollIndicator={false}
              />
            ) : (
              <View style={styles.resultItem}>
                <Text size={fontSize.md} color="colors-text-text-secondary">
                  No results found
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Thread Preview */}
        {selectedRecipients.length > 0 &&
          recipient.trim().length === 0 &&
          (existingChannel || isLoadingPreview) && (
            <View style={styles.previewContainer}>
              <ThreadPreview
                messages={previewMessages}
                isLoading={isLoadingPreview}
              />
            </View>
          )}
      </View>

      {/* Start Chat Button - Sticky Bottom */}
      {selectedRecipients.length > 0 && (
        <View
          style={[
            styles.buttonContainer,
            {
              borderTopColor:
                theme.colors["color-colors-border-border-secondary"]
            }
          ]}
        >
          <Button onPress={handleStartChat}>
            {existingChannel ? "Continue conversation" : "Start a chat"}
          </Button>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  content: {
    flex: 1
  },
  title: {
    fontWeight: "600",
    marginBottom: padding["2xl"],
    paddingHorizontal: padding.xl
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
  resultsContainer: {
    flex: 1,
    paddingTop: padding.md,
    paddingHorizontal: padding.xl
  },
  previewContainer: {
    flex: 1
  },
  resultItem: {
    display: "flex",
    flexDirection: "row",
    gap: padding.xl,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingVertical: padding.md
  },
  resultTextContainer: {
    alignItems: "flex-start",
    gap: padding.sm
  },
  iconContainer: {
    width: 32,
    height: 32,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center"
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
  buttonContainer: {
    paddingHorizontal: padding.xl,
    paddingVertical: padding.lg,
    paddingBottom: padding.xl,
    borderTopWidth: 0.5
  }
});
