// React Imports
import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  TouchableOpacity,
  ListRenderItemInfo,
  Platform
} from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";
import { useDebounceFn } from "ahooks";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { TextInput } from "shared/components/TextInput.tsx";
import { useSelector } from "react-redux";
import { State } from "store/types.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { Avatar } from "shared/components/Avatar.tsx";
import Icon from "shared/components/Icon.tsx";
import { Screen } from "shared/components/utils/Screen.tsx";
import { Message } from "features/chat/components/Message.tsx";

// Navigation
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { Routes } from "core/navigation/types/types.ts";
import { ChatNavigationProp, ChatMessage } from "features/chat/types.ts";

// Utils
import { toast } from "@backpackapp-io/react-native-toast";
import { Logger } from "shared/utils/Logger.ts";
import { GroupChannel } from "@sendbird/chat/groupChannel";
import {
  isValidPhoneNumber,
  formatPhoneNumber,
  stripPhoneNumber
} from "shared/utils/formatters.ts";
import {
  sendNewTextMessage,
  uploadMediaFiles
} from "shared/api/messaging/methods.ts";
import { EditorMessage } from "shared/api/messaging/types.ts";

// Editor Imports
import {
  BlockquoteBridge,
  BoldBridge,
  BridgeExtension,
  BulletListBridge,
  CodeBridge,
  CoreBridge,
  HistoryBridge,
  ImageBridge,
  ItalicBridge,
  OrderedListBridge,
  PlaceholderBridge,
  StrikeBridge,
  useEditorBridge
} from "@10play/tentap-editor";
import { Mention } from "@tiptap/extension-mention";
import { MentionType } from "@sendbird/chat/message";
import { Editor } from "features/chat/rich-editor/AdvancedRichText.tsx";
import { RichEditorProvider } from "features/chat/rich-editor/context/RichEditorProvider.tsx";
import { useRichEditor } from "features/chat/rich-editor/context/RichEditorContext.ts";
import { EditorMention } from "features/chat/rich-editor/types.ts";
import { MentionActionType } from "features/chat/rich-editor/mentions/MentionBridge.ts";
import { LinkBridge } from "features/chat/rich-editor/bridges/LinkBridge.ts";
import { editorHtml } from "features/chat/editor/build/editorHtml.ts";
import { Asset } from "react-native-image-picker";

export type NewMessageItem = {
  name: string;
  avatarPath?: string;
  channelUrl?: string;
  userId?: string;
  phoneNumber?: string;
  type: "channel" | "user" | "dm" | "phone" | "personal" | "phone-contact";
  public?: boolean;
};

const MENTION_CHAR = "@";

const NewMessageComponent = () => {
  const logger = new Logger("NewMessage");
  const theme = useTheme();
  const navigation = useNavigation<ChatNavigationProp>();
  const suppressNextEmptyMentionQueryRef = useRef(false);

  const { directory } = useSelector((state: State) => state.directoryReducer);
  const { user } = useSelector((state: State) => state.userReducer);
  const { accessToken } = useSelector((state: State) => state.authReducer);
  const { provisionedNumbers, selectedDidNumber } = useSelector(
    (state: State) => state.textReducer
  );

  const {
    filteredGroupChannels,
    filteredDMChannels,
    createOrJoinDMChannel,
    findExistingDMChannel,
    getChannelPreviewMessages,
    channels,
    sendbirdInstance
  } = useSendbirdContext();

  const { toggleMentionSuggestion, setMentionQuery } = useRichEditor();

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

  // Reset state when screen gains focus.
  useFocusEffect(
    useCallback(() => {
      setRecipient("");
      setSearchResults([]);
      setSelectedRecipients([]);
      setExistingChannel(null);
      setPreviewMessages([]);
    }, [])
  );

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

  // Helper function to create phone number item
  const createPhoneItem = useCallback(
    (phoneNumber: string): NewMessageItem => ({
      name: formatPhoneNumber(phoneNumber),
      phoneNumber: stripPhoneNumber(phoneNumber),
      type: "phone"
    }),
    []
  );

  // Helper function to check if a number is a provisioned DID
  const isDIDNumber = useCallback(
    (phoneNumber: string): boolean => {
      if (!provisionedNumbers || provisionedNumbers.length === 0) return false;
      const stripped = stripPhoneNumber(phoneNumber);
      return provisionedNumbers.some(
        (pn) => stripPhoneNumber(pn.number) === stripped
      );
    },
    [provisionedNumbers]
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

      // Search business contacts (by name and phone number)
      const normalizedSearchPhone = stripPhoneNumber(searchQuery);
      businessContacts
        .filter((contact) => {
          const nameMatch = contact.name.toLowerCase().includes(searchQuery);
          // Also check phone number (normalize both for comparison)
          const contactPhone = contact.number
            ? stripPhoneNumber(contact.number)
            : "";
          const phoneMatch =
            contactPhone && contactPhone.includes(normalizedSearchPhone);

          const contactUserId = contact.userId?.toString();
          const currentUserId = user?.id?.toString();
          const isSelf = contactUserId === currentUserId;
          console.log(isSelf);

          return (
            (nameMatch || phoneMatch) && !selectedUserIds.has(contactUserId)
          );
        })
        .forEach((contact) => {
          const contactId = contact.userId?.toString();
          const contactDMs = contactId ? userToDMMap.get(contactId) || [] : [];
          const currentUserId = user?.id?.toString();
          const isSelf = contactId === currentUserId;

          // Check if we've already added DMs for this contact
          const contactDMsAdded = contactDMs.some((dm) =>
            addedDMUrls.has(dm.url)
          );

          // Check if a 1-on-1 DM exists
          const has1on1DM = contactDMs.some(
            (dm) =>
              dm.memberUserIds?.length === 2 &&
              dm.memberUserIds.includes(currentUserId || "")
          );

          // Only add as user if no 1-on-1 DM exists and we haven't added their DMs
          if (!has1on1DM && !contactDMsAdded) {
            const userItem = createUserItem(contact);
            console.warn("🔍 [NewMessage] Adding contact to results:", {
              ...userItem,
              isSelf
            });
            results.push(userItem);
          } else {
            console.warn(
              "🔍 [NewMessage] Skipping contact (has DM or already added):",
              {
                contactName: contact.name,
                contactId,
                isSelf,
                has1on1DM,
                contactDMsAdded
              }
            );
          }
        });

      // Check if search term is a valid phone number and add custom phone option
      // Accept both 10-digit and 11-digit (with leading 1) numbers, but normalize to 10 digits
      if (isValidPhoneNumber(searchQuery) && !isDIDNumber(searchQuery)) {
        // Normalize the phone number (strip leading 1 to get 10-digit number)
        const normalizedPhone = stripPhoneNumber(searchQuery);

        // Show if it's a valid 10-digit number (after normalization)
        if (normalizedPhone.length === 10) {
          // Check if this phone number is already in the results
          // Check against all phone-related types and normalized numbers
          const phoneAlreadyAdded = results.some((item) => {
            // Check direct phone items
            if (item.type === "phone" && item.phoneNumber === normalizedPhone) {
              return true;
            }
            // Check personal and phone-contact types
            if (
              (item.type === "personal" || item.type === "phone-contact") &&
              item.phoneNumber === normalizedPhone
            ) {
              return true;
            }
            // Check if any user contact has this normalized phone number
            if (item.type === "user" && item.userId) {
              const contact = directory.find(
                (c) => c.userId?.toString() === item.userId
              );
              if (contact && contact.number) {
                const contactNormalized = stripPhoneNumber(contact.number);
                if (contactNormalized === normalizedPhone) {
                  return true;
                }
              }
            }
            return false;
          });

          if (!phoneAlreadyAdded) {
            // Create phone item with normalized 10-digit number
            // This works for both "5551234567" and "15551234567" - both become "5551234567"
            results.unshift(createPhoneItem(normalizedPhone));
          }
        }
      }
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
      const currentUserId = user?.id?.toString();
      const isSelf = item.userId === currentUserId;
      console.log(isSelf);

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
          const itemUserId = item.userId || "";
          if (selectedUserIds.has(itemUserId)) {
            return prev;
          }
          const newRecipients = [...prev, item];
          return newRecipients;
        });
      } else if (
        item.type === "phone" ||
        item.type === "personal" ||
        item.type === "phone-contact"
      ) {
        // Normalize the phone number to ensure it's 10 digits (no leading 1)
        // This handles both "5551234567" and "15551234567" - both become "5551234567"
        // Also handle cases where phoneNumber might be in the name field
        let phoneToNormalize = item.phoneNumber || "";

        // If no phoneNumber but name contains digits, try to extract from name
        if (!phoneToNormalize && item.name) {
          const nameDigits = item.name.replace(/\D/g, "");
          if (nameDigits.length >= 10) {
            phoneToNormalize = nameDigits;
          }
        }

        const normalizedPhone = phoneToNormalize
          ? stripPhoneNumber(phoneToNormalize)
          : "";

        console.warn("📱 [NewMessage] Phone recipient selected:", {
          originalType: item.type,
          originalPhoneNumber: item.phoneNumber,
          originalName: item.name,
          phoneToNormalize,
          normalizedPhone,
          isValid: normalizedPhone.length === 10
        });

        // Only add if we have a valid normalized phone number (exactly 10 digits)
        if (normalizedPhone.length === 10) {
          // Create a normalized phone item - always use "phone" type for consistency
          const normalizedItem: NewMessageItem = {
            ...item,
            phoneNumber: normalizedPhone,
            name: formatPhoneNumber(normalizedPhone), // Ensure name is also normalized
            type: "phone" // Always use "phone" type for consistency
          };

          console.warn(
            "📱 [NewMessage] Creating normalized phone item:",
            normalizedItem
          );

          // Add phone number recipient (avoid duplicates)
          // Check for duplicates by normalized phone number across all phone-related types
          setSelectedRecipients((prev) => {
            const phoneExists = prev.some(
              (r) =>
                (r.type === "phone" ||
                  r.type === "personal" ||
                  r.type === "phone-contact") &&
                r.phoneNumber === normalizedPhone
            );
            if (phoneExists) {
              console.warn("📱 [NewMessage] Phone already exists, skipping");
              return prev;
            }
            const newRecipients = [...prev, normalizedItem];
            console.warn(
              "📱 [NewMessage] Added phone recipient. Total recipients:",
              newRecipients.length,
              newRecipients
            );
            return newRecipients;
          });
        } else {
          console.warn("📱 [NewMessage] Invalid phone number, not adding:", {
            normalizedPhone,
            length: normalizedPhone.length
          });
        }
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
      // Use push so Android back gesture returns to this screen (navigate may focus an existing Chat route).
      navigation.push(Routes.Chat as never, { channelUrl } as never);
    },
    [navigation]
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

      // Skip searching for phone recipients (they use SMS, not Sendbird)
      const hasPhoneRecipients = selectedRecipients.some(
        (r) =>
          r.type === "phone" ||
          r.type === "personal" ||
          r.type === "phone-contact"
      );
      if (hasPhoneRecipients) {
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
  }, [
    selectedUserIdsKey,
    findExistingDMChannel,
    getChannelPreviewMessages,
    selectedRecipients
  ]);

  const handleSendMessage = useCallback(
    async ({
      message,
      mentionedUsers
    }: {
      message: string;
      mentionedUsers: string[];
    }) => {
      if (selectedRecipients.length === 0) return;

      try {
        // Check if any recipients are phone numbers (including personal and phone-contact types)
        const hasPhoneRecipients = selectedRecipients.some(
          (r) =>
            r.type === "phone" ||
            r.type === "personal" ||
            r.type === "phone-contact"
        );

        // If we have phone recipients, send SMS/MMS instead of Sendbird
        if (hasPhoneRecipients) {
          logger.debug(
            "📱 [NewMessage] Phone recipient detected, preparing SMS send"
          );
          logger.debug(
            "📱 [NewMessage] Selected recipients:",
            selectedRecipients
          );

          if (!selectedDidNumber) {
            logger.error("📱 [NewMessage] No DID number selected");
            toast.error("Please select a phone number to send from");
            return;
          }

          const phoneRecipients = selectedRecipients
            .filter(
              (r) =>
                r.type === "phone" ||
                r.type === "personal" ||
                r.type === "phone-contact"
            )
            .map((r) => r.phoneNumber!)
            .filter(Boolean);

          logger.debug(
            "📱 [NewMessage] Phone recipients after filtering:",
            phoneRecipients
          );
          logger.debug("📱 [NewMessage] Sender DID:", selectedDidNumber.number);

          if (phoneRecipients.length === 0) {
            logger.error(
              "📱 [NewMessage] No valid phone recipients found after filtering"
            );
            toast.error("No valid phone number found");
            return;
          }

          const editorMessage: EditorMessage = { text: message };
          const sender = stripPhoneNumber(selectedDidNumber.number);

          logger.debug("📱 [NewMessage] Sending SMS:", {
            recipients: phoneRecipients,
            sender: sender,
            messageLength: message.length,
            tenantId: user?.tenantId
          });

          try {
            const response = await sendNewTextMessage(
              accessToken,
              user?.tenantId,
              phoneRecipients,
              sender,
              editorMessage,
              [] // No media URLs for now
            );

            logger.debug("📱 [NewMessage] SMS sent successfully:", response);
            toast.success("Message sent");

            // Small delay before navigation
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Navigate back or to text messages
            navigation.goBack();
          } catch (error: any) {
            logger.error("📱 [NewMessage] Error sending SMS:", {
              error: error,
              code: error?.code,
              message: error?.message,
              response: error?.response || error,
              recipients: phoneRecipients,
              sender: sender
            });

            const errorMessage =
              error?.message ||
              error?.response?.message ||
              "Failed to send message";
            toast.error(errorMessage);
          }

          return;
        }

        // Original Sendbird logic for user recipients
        let channelUrl: string | undefined;

        // If we have an existing channel, use it
        if (existingChannel) {
          channelUrl = existingChannel.url;
        } else {
          // Otherwise, create a new channel
          const userIds = selectedRecipients
            .map((r) => r.userId)
            .filter(Boolean) as string[];

          const result = await createOrJoinDMChannel(userIds);

          if (result.success && result.channelUrl) {
            channelUrl = result.channelUrl;
          } else {
            toast.error("Failed to create chat");
            logger.error("Failed to create DM channel:", result.error);
            return;
          }
        }

        // Navigate to chat - the Chat screen will handle entering the channel
        // and we'll send the message there
        if (channelUrl) {
          // Get the channel object - first check existing or channels array
          let channel =
            existingChannel || channels.find((ch) => ch.url === channelUrl);

          // If not found in channels array (newly created), fetch from Sendbird
          if (!channel && sendbirdInstance) {
            try {
              channel = await sendbirdInstance.groupChannel.getChannel(
                channelUrl
              );
            } catch (error) {
              logger.error("Error fetching channel:", error);
            }
          }

          if (channel) {
            // Send message directly to the channel without relying on context
            channel.sendUserMessage({
              message,
              mentionType: MentionType.USERS,
              mentionedUserIds: mentionedUsers.map((i) => i.toString())
            });
          }

          // Small delay to allow editor to cleanup before navigation
          await new Promise((resolve) => setTimeout(resolve, 50));

          // Navigate to the chat
          navigation.push(Routes.Chat as never, { channelUrl } as never);
        }
      } catch (error) {
        toast.error("Error sending message");
        logger.error("Error in handleSendMessage:", error);
      }
    },
    [
      selectedRecipients,
      existingChannel,
      createOrJoinDMChannel,
      channels,
      sendbirdInstance,
      navigation,
      logger,
      selectedDidNumber,
      accessToken,
      user?.tenantId
    ]
  );

  const handleGifUpload = useCallback(
    async (value: {
      title: string;
      url: string;
      height: number;
      width: number;
    }) => {
      if (selectedRecipients.length === 0) return;

      try {
        // Check if any recipients are phone numbers (including personal and phone-contact types)
        const hasPhoneRecipients = selectedRecipients.some(
          (r) =>
            r.type === "phone" ||
            r.type === "personal" ||
            r.type === "phone-contact"
        );

        // If we have phone recipients, send MMS instead of Sendbird
        if (hasPhoneRecipients) {
          logger.debug(
            "📱 [NewMessage] Phone recipient detected, preparing MMS send for GIF"
          );

          if (!selectedDidNumber) {
            logger.error("📱 [NewMessage] No DID number selected");
            toast.error("Please select a phone number to send from");
            return;
          }

          const phoneRecipients = selectedRecipients
            .filter(
              (r) =>
                r.type === "phone" ||
                r.type === "personal" ||
                r.type === "phone-contact"
            )
            .map((r) => r.phoneNumber!)
            .filter(Boolean);

          if (phoneRecipients.length === 0) {
            logger.error("📱 [NewMessage] No valid phone recipients found");
            toast.error("No valid phone number found");
            return;
          }

          const sender = stripPhoneNumber(selectedDidNumber.number);

          // Upload GIF file
          const gifFile = {
            uri: value.url,
            name: `gif_${Date.now()}.gif`,
            type: "image/gif"
          };

          logger.debug("📱 [NewMessage] Uploading GIF for MMS:", {
            recipients: phoneRecipients,
            sender: sender
          });

          const uploadResponse = await uploadMediaFiles(accessToken, [gifFile]);

          if (uploadResponse && uploadResponse.length > 0) {
            const editorMessage: EditorMessage = { text: "" };
            const response = await sendNewTextMessage(
              accessToken,
              user?.tenantId,
              phoneRecipients,
              sender,
              editorMessage,
              uploadResponse
            );

            logger.debug("📱 [NewMessage] MMS sent successfully:", response);
            toast.success("GIF sent");

            // Small delay before navigation
            await new Promise((resolve) => setTimeout(resolve, 50));
            navigation.goBack();
          } else {
            throw new Error("Failed to get media URL from upload");
          }

          return;
        }

        // Original Sendbird logic for user recipients
        let channelUrl: string | undefined;

        if (existingChannel) {
          channelUrl = existingChannel.url;
        } else {
          const userIds = selectedRecipients
            .map((r) => r.userId)
            .filter(Boolean) as string[];

          const result = await createOrJoinDMChannel(userIds);

          if (result.success && result.channelUrl) {
            channelUrl = result.channelUrl;
          } else {
            toast.error("Failed to create chat");
            return;
          }
        }

        if (channelUrl) {
          // Note: GIF upload logic would need metaArrays handling similar to Chat.tsx
          // For now, just navigate to chat and let user send GIF from there

          // Small delay to allow editor to cleanup before navigation
          await new Promise((resolve) => setTimeout(resolve, 50));

          navigation.push(Routes.Chat as never, { channelUrl } as never);
        }
      } catch (error: any) {
        logger.error("📱 [NewMessage] Error in handleGifUpload:", {
          error: error,
          code: error?.code,
          message: error?.message
        });
        const errorMessage = error?.message || "Error sending GIF";
        toast.error(errorMessage);
      }
    },
    [
      selectedRecipients,
      existingChannel,
      createOrJoinDMChannel,
      navigation,
      logger,
      selectedDidNumber,
      accessToken,
      user?.tenantId
    ]
  );

  const handleFileUpload = useCallback(
    async (files: Asset[]) => {
      if (selectedRecipients.length === 0) return;

      try {
        // Check if any recipients are phone numbers (including personal and phone-contact types)
        const hasPhoneRecipients = selectedRecipients.some(
          (r) =>
            r.type === "phone" ||
            r.type === "personal" ||
            r.type === "phone-contact"
        );

        // If we have phone recipients, send MMS instead of Sendbird
        if (hasPhoneRecipients) {
          logger.debug(
            "📱 [NewMessage] Phone recipient detected, preparing MMS send for files"
          );

          if (!selectedDidNumber) {
            logger.error("📱 [NewMessage] No DID number selected");
            toast.error("Please select a phone number to send from");
            return;
          }

          const phoneRecipients = selectedRecipients
            .filter(
              (r) =>
                r.type === "phone" ||
                r.type === "personal" ||
                r.type === "phone-contact"
            )
            .map((r) => r.phoneNumber!)
            .filter(Boolean);

          if (phoneRecipients.length === 0) {
            logger.error("📱 [NewMessage] No valid phone recipients found");
            toast.error("No valid phone number found");
            return;
          }

          const sender = stripPhoneNumber(selectedDidNumber.number);

          // Prepare files for upload
          const filesToUpload = files
            .filter((file) => file.uri)
            .map((file) => {
              // Detect MIME type from file extension if not provided (important for videos)
              let mimeType = file.type;
              if (!mimeType && file.fileName) {
                const extension = file.fileName.toLowerCase().split(".").pop();
                if (
                  extension === "mp4" ||
                  extension === "mov" ||
                  extension === "avi" ||
                  extension === "mkv" ||
                  extension === "m4v"
                ) {
                  mimeType = "video/mp4";
                } else if (extension === "jpg" || extension === "jpeg") {
                  mimeType = "image/jpeg";
                } else if (extension === "png") {
                  mimeType = "image/png";
                } else if (extension === "gif") {
                  mimeType = "image/gif";
                } else if (extension === "webp") {
                  mimeType = "image/webp";
                } else {
                  mimeType = "image/jpeg"; // Default fallback
                }
              }

              // Generate filename with proper extension
              let fileName = file.fileName || `file_${Date.now()}`;
              if (!file.fileName) {
                const extension = mimeType?.split("/")[1] || "jpg";
                fileName = `file_${Date.now()}.${extension}`;
              }

              return {
                uri: file.uri!,
                name: fileName,
                fileName: fileName, // Also set fileName for uploadMediaFiles compatibility
                type: mimeType || "image/jpeg"
              };
            });

          if (filesToUpload.length === 0) {
            logger.error("📱 [NewMessage] No valid files to upload");
            toast.error("No valid files to upload");
            return;
          }

          logger.debug("📱 [NewMessage] Uploading files for MMS:", {
            recipients: phoneRecipients,
            sender: sender,
            fileCount: filesToUpload.length,
            fileTypes: filesToUpload.map((f) => f.type),
            fileNames: filesToUpload.map((f) => f.fileName)
          });

          try {
            const uploadResponse = await uploadMediaFiles(
              accessToken,
              filesToUpload
            );

            logger.debug("📱 [NewMessage] Upload response received:", {
              hasResponse: !!uploadResponse,
              isArray: Array.isArray(uploadResponse),
              length: Array.isArray(uploadResponse) ? uploadResponse.length : 0,
              response: uploadResponse
            });

            if (uploadResponse && uploadResponse.length > 0) {
              const editorMessage: EditorMessage = { text: "" };
              const response = await sendNewTextMessage(
                accessToken,
                user?.tenantId,
                phoneRecipients,
                sender,
                editorMessage,
                uploadResponse
              );

              logger.debug("📱 [NewMessage] MMS sent successfully:", response);
              toast.success("Files sent");

              // Small delay before navigation
              await new Promise((resolve) => setTimeout(resolve, 50));
              navigation.goBack();
            } else {
              logger.error(
                "📱 [NewMessage] Upload response was empty or invalid:",
                {
                  uploadResponse,
                  responseType: typeof uploadResponse
                }
              );
              toast.error("Failed to upload files. Please try again.");
            }
          } catch (uploadError: any) {
            logger.error("📱 [NewMessage] Error uploading files for MMS:", {
              error: uploadError,
              code: uploadError?.code,
              message: uploadError?.message,
              response: uploadError?.response,
              stack: uploadError?.stack
            });
            const errorMessage =
              uploadError?.message ||
              uploadError?.response?.message ||
              "Failed to upload files";
            toast.error(errorMessage);
            return; // Don't continue to Sendbird logic if upload fails
          }

          return;
        }

        // Original Sendbird logic for user recipients
        let channelUrl: string | undefined;

        if (existingChannel) {
          channelUrl = existingChannel.url;
        } else {
          const userIds = selectedRecipients
            .map((r) => r.userId)
            .filter(Boolean) as string[];

          const result = await createOrJoinDMChannel(userIds);

          if (result.success && result.channelUrl) {
            channelUrl = result.channelUrl;
          } else {
            toast.error("Failed to create chat");
            return;
          }
        }

        if (channelUrl) {
          // Get the channel object - first check existing or channels array
          let channel =
            existingChannel || channels.find((ch) => ch.url === channelUrl);

          // If not found in channels array (newly created), fetch from Sendbird
          if (!channel && sendbirdInstance) {
            try {
              channel = await sendbirdInstance.groupChannel.getChannel(
                channelUrl
              );
            } catch (error) {
              logger.error("Error fetching channel:", error);
            }
          }

          if (channel) {
            // Send files directly to the channel
            if (files.length === 1) {
              const file = files[0];
              if (!file.uri) {
                toast.error("Error sending message");
                return;
              }

              channel.sendFileMessage({
                file: {
                  uri: file.uri,
                  name: file.fileName || "",
                  type: file.type || ""
                },
                fileSize: file.fileSize,
                fileName: file.fileName,
                mimeType: file.type
              } as any);
            } else {
              const adaptedFiles = files.map((item) => ({
                file: {
                  uri: item.uri || "",
                  name: item.fileName || "",
                  type: item.type || ""
                },
                fileSize: item.fileSize,
                fileName: item.fileName,
                mimeType: item.type
              }));
              channel.sendMultipleFilesMessage({
                fileInfoList: adaptedFiles
              } as any);
            }
          }

          // Small delay to allow editor to cleanup before navigation
          await new Promise((resolve) => setTimeout(resolve, 50));

          // Navigate to the chat
          navigation.push(Routes.Chat as never, { channelUrl } as never);
        }
      } catch (error: any) {
        logger.error("📱 [NewMessage] Error in handleFileUpload:", {
          error: error,
          code: error?.code,
          message: error?.message
        });
        const errorMessage = error?.message || "Error sending files";
        toast.error(errorMessage);
      }
    },
    [
      selectedRecipients,
      existingChannel,
      createOrJoinDMChannel,
      channels,
      sendbirdInstance,
      navigation,
      logger,
      selectedDidNumber,
      accessToken,
      user?.tenantId
    ]
  );

  const renderRecipientChip = useCallback(
    (item: NewMessageItem, index: number) => {
      const isPhoneType =
        item.type === "phone" ||
        item.type === "personal" ||
        item.type === "phone-contact";

      return (
        <View
          key={`chip-${item.userId || item.phoneNumber}-${index}`}
          style={[
            styles.chipContainer,
            { borderColor: theme.colors["colors-border-border-primary"] }
          ]}
        >
          {isPhoneType ? (
            <View
              style={{
                width: 24,
                height: 24,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Icon name="message-text-square-01" size={16} />
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
        </View>
      );
    },
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

      const isPhoneType =
        item.type === "phone" ||
        item.type === "personal" ||
        item.type === "phone-contact";

      return (
        <TouchableOpacity style={styles.resultItem} onPress={handlePress}>
          {item.type === "channel" ? (
            <View style={styles.iconContainer}>
              <Icon name={item.public ? "hash-01" : "lock-03"} size={22} />
            </View>
          ) : isPhoneType ? (
            <View style={styles.iconContainer}>
              <Icon name="message-text-square-01" size={22} />
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
            {isPhoneType && item.phoneNumber && (
              <Text size={fontSize.sm} color="colors-text-text-secondary">
                {formatPhoneNumber(item.phoneNumber)}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [handleChannelPress, handleRecipientSelect]
  );

  const keyExtractor = useCallback(
    (item: NewMessageItem, index: number) =>
      `${item.type}-${
        item.channelUrl || item.userId || item.phoneNumber || item.name
      }-${index}`,
    []
  );

  const renderMessage = useCallback(
    ({ item, index }: ListRenderItemInfo<ChatMessage>) => {
      const prevMessage =
        index < previewMessages.length - 1 ? previewMessages[index + 1] : null;
      return <Message message={item} prevMessage={prevMessage} />;
    },
    [previewMessages]
  );

  const messageKeyExtractor = useCallback(
    (item: ChatMessage) => item.messageId.toString(),
    []
  );

  // Determine the recipient names for placeholder
  const recipientNames = useMemo(() => {
    if (selectedRecipients.length === 0) return "";
    if (selectedRecipients.length === 1) return selectedRecipients[0].name;
    if (selectedRecipients.length === 2) {
      return `${selectedRecipients[0].name} and ${selectedRecipients[1].name}`;
    }
    return "group";
  }, [selectedRecipients]);

  // Bridge Configuration
  const createMentionBridge = useCallback(() => {
    const handleMentionQuery = (message: { payload: string; type: string }) => {
      const payload = message.payload ?? "";
      if (suppressNextEmptyMentionQueryRef.current && payload === "") {
        suppressNextEmptyMentionQueryRef.current = false;
        toggleMentionSuggestion(false);
        setMentionQuery("");
        return;
      }
      toggleMentionSuggestion(true);
      setMentionQuery(payload);
    };

    const handleExitMention = () => {
      suppressNextEmptyMentionQueryRef.current = false;
      toggleMentionSuggestion(false);
      setMentionQuery("");
    };

    return new BridgeExtension({
      tiptapExtension: Mention.configure({
        HTMLAttributes: {
          class:
            "bg-component-colors-utility-brand-utility-brand-50 hover:bg-component-colors-utility-brand-utility-brand-100 transition duration-100 border border-component-colors-utility-brand-utility-brand-200 text-component-colors-utility-brand-utility-brand-700 rounded-md p-0.5 cursor-pointer"
        },
        renderText({ options, node }) {
          return `${options.suggestion.char}${
            node.attrs.label ?? node.attrs.id
          }`;
        },
        deleteTriggerWithBackspace: true,
        suggestion: {
          char: MENTION_CHAR,
          allowSpaces: false,
          items: () => []
        }
      }),
      onEditorMessage: (message, editorBridge) => {
        if (message.type === "mention-query") {
          editorBridge.mentionQuery(message);
          return true;
        } else if (message.type === MentionActionType.ExitMention) {
          editorBridge.exitMention();
          return true;
        }
        return false;
      },
      extendEditorInstance: (sendBridgeMessage) => ({
        mentionQuery: handleMentionQuery,
        insertMentionChar: () => {
          sendBridgeMessage({ type: MentionActionType.InsertMentionChar });
        },
        insertMention: (item: EditorMention) => {
          suppressNextEmptyMentionQueryRef.current = true;
          sendBridgeMessage({
            type: MentionActionType.InsertMention,
            payload: item
          });
        },
        exitMention: handleExitMention
      })
    });
  }, [toggleMentionSuggestion, setMentionQuery]);

  const themedEditor = editorHtml
    .replace(
      "{{theme-background}}",
      theme.colors["color-colors-background-bg-primary"]
    )
    .replace("{{theme-color}}", theme.colors["color-colors-text-text-primary"]);

  // Editor Configuration
  const editor = useEditorBridge({
    customSource: themedEditor,
    bridgeExtensions: [
      CoreBridge,
      ImageBridge,
      BoldBridge,
      ItalicBridge,
      StrikeBridge,
      LinkBridge,
      CodeBridge,
      HistoryBridge,
      BlockquoteBridge.configureExtension({
        HTMLAttributes: {
          class: "pl-1 border-l-2 border-colors-border-border-primary text-base"
        }
      }),
      OrderedListBridge.configureExtension({
        HTMLAttributes: {
          class: "pl-5 list-decimal list-outside text-base"
        }
      }),
      BulletListBridge.configureExtension({
        HTMLAttributes: {
          class: "pl-5 list-disc list-outside text-base"
        },
        keepMarks: true,
        keepAttributes: true
      }),
      PlaceholderBridge.configureExtension({
        placeholder: recipientNames
          ? `Message ${recipientNames}...`
          : "Select recipients..."
      }),
      createMentionBridge()
    ],
    avoidIosKeyboard: Platform.OS === "ios"
  });

  return (
    <Screen avoidKeyboard={false}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
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

        <WhiteSpace
          style={[
            styles.divider,
            {
              borderColor: theme.colors["color-colors-border-border-secondary"]
            }
          ]}
        />

        {/* To Field */}
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

        {/* Search Results or Preview */}
        <View style={styles.content}>
          {recipient.trim().length > 0 ? (
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
          ) : selectedRecipients.length > 0 &&
            (existingChannel || isLoadingPreview) ? (
            <View style={styles.previewContainer}>
              {isLoadingPreview ? (
                <View style={styles.emptyContainer}>
                  <Text
                    size={fontSize.sm}
                    color="color-colors-text-text-secondary"
                  >
                    Loading conversation...
                  </Text>
                </View>
              ) : previewMessages.length > 0 ? (
                <>
                  <View style={styles.previewHeader}>
                    <Text
                      size={fontSize.sm}
                      weight="medium"
                      color="color-colors-text-text-tertiary"
                    >
                      Existing conversation
                    </Text>
                  </View>
                  <FlatList
                    data={previewMessages.slice(0, 10).reverse()}
                    renderItem={renderMessage}
                    keyExtractor={messageKeyExtractor}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    inverted={false}
                  />
                </>
              ) : (
                <View style={styles.emptyContainer}>
                  <Text
                    size={fontSize.sm}
                    color="color-colors-text-text-secondary"
                  >
                    No messages yet
                  </Text>
                </View>
              )}
            </View>
          ) : null}
        </View>

        {/* Editor */}
        {selectedRecipients.length > 0 && (
          <Editor
            editor={editor}
            handleGifUpload={handleGifUpload}
            handleFile={handleFileUpload}
            sendMessage={handleSendMessage}
          />
        )}
      </View>
    </Screen>
  );
};

export const NewMessage = () => {
  return (
    <RichEditorProvider>
      <NewMessageComponent />
    </RichEditorProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: padding.xl,
    paddingVertical: padding.md
  },
  backButton: {
    padding: padding.xs
  },
  content: {
    flex: 1
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
  previewHeader: {
    paddingHorizontal: padding.md,
    paddingVertical: padding.md,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(0,0,0,0.1)"
  },
  listContent: {
    paddingVertical: padding.md,
    paddingHorizontal: padding.md
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
  emptyContainer: {
    padding: padding["2xl"],
    alignItems: "center"
  }
});
