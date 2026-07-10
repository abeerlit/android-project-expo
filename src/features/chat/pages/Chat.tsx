// Main Chat Component - Unified search + routing (Optimized)
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  View,
  StyleSheet,
  FlatList as RNFlatList,
  TouchableOpacity,
  Platform,
  Keyboard
} from "react-native";
import { useSelector, useDispatch } from "react-redux";
import { useParams } from "hooks/use-params.ts";
import { useNavigation, useFocusEffect } from "@react-navigation/native";

// Type Imports
import { Routes } from "core/navigation/types/types.ts";
import { AuthParams } from "core/navigation/navigators/AuthenticatedStack.tsx";
import { State } from "store/types.ts";
import { ChatNavigationProp } from "features/chat/types.ts";

// Component Imports
import { Screen } from "shared/components/utils/Screen.tsx";
import { RichEditorProvider } from "features/chat/rich-editor/context/RichEditorProvider.tsx";
import { fontSize, padding, borderRadius } from "core/theme/theme.ts";
import { useTheme } from "hooks/use-theme.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { Text } from "shared/components/Text.tsx";
import * as textActions from "store/text/actions.ts";
import { DynamicChatHeader, DynamicChatHeaderHandle } from "features/chat/components/DynamicChatHeader.tsx";
import Icon from "shared/components/Icon.tsx";
import { Avatar } from "shared/components/Avatar.tsx";
import {
  formatPhoneNumber,
  stripPhoneNumber
} from "shared/utils/formatters.ts";
import { SendbirdChatContent } from "features/chat/components/SendbirdChatContent.tsx";
import { TextChatContent } from "features/chat/components/TextChatContent.tsx";
import { GroupChannel } from "@sendbird/chat/groupChannel";

// Custom Hooks
import {
  useRecipientSearch,
  useRecipientManagement,
  useConversationRouter,
  useMessageSending,
  NewMessageItem
} from "features/chat/hooks/index.ts";

// Main Chat Component (Optimized with Custom Hooks)
const ChatComponent: React.FC = () => {
  const params = useParams<AuthParams[Routes.Chat]>();
  const navigation = useNavigation<ChatNavigationProp>();
  const dispatch = useDispatch();
  const {
    channelUrl,
    conversationId,
    recipientName,
    recipientAvatarPath,
    recipientNumber,
    parentMessageId,
    scrollToMessageId
  } = params;

  // Redux State
  const { user } = useSelector((state: State) => state.userReducer);
  const { directory } = useSelector((state: State) => state.directoryReducer);
  const {
    provisionedNumbers,
    selectedDidNumber,
    conversations,
    currentConversation,
    lastCreatedGroupConversationId
  } = useSelector((state: State) => state.textReducer);
  // Sendbird Context
  const { channels, currentChannel, sendbirdInstance } = useSendbirdContext();
  const [directChannel, setDirectChannel] = useState<GroupChannel | null>(null);

  // Search mode state
  const [isSearchMode, setIsSearchMode] = useState(
    !channelUrl && !conversationId
  );
  const [headerHeight, setHeaderHeight] = useState(0);
  const theme = useTheme();

  // Pending Sendbird message when user sends before channel exists (survives SendbirdChatContent remount)
  const [pendingSendbirdMessage, setPendingSendbirdMessage] = useState<{
    message: string;
    mentionedUsers: string[];
  } | null>(null);

  // Pause SMS polling when user taps call - stops interval so call initiates faster
  const [pausePollingForCall, setPausePollingForCall] = useState(false);

  // When opening Chat with no conversation/channel (e.g. "New Message"), clear persisted
  // currentConversation so we show empty state instead of last thread
  useEffect(() => {
    if (conversationId == null && channelUrl == null) {
      dispatch(textActions.setCurrentConversation(null));
    }
  }, [conversationId, channelUrl, dispatch]);

  // Resume polling when returning to chat (e.g. after call ends)
  useFocusEffect(
    useCallback(() => {
      setPausePollingForCall(false);
      return () => {};
    }, [])
  );

  // Navigation handlers
  const handleNavigateToChannel = useCallback(
    (channelUrl: string) => {
      setIsSearchMode(false);
      navigation.setParams({
        channelUrl,
        conversationId: undefined
      } as any);
    },
    [navigation]
  );

  const handleNavigateToConversation = useCallback(
    (conversationId: number) => {
      setIsSearchMode(false);
      navigation.setParams({
        conversationId,
        channelUrl: undefined
      } as any);
    },
    [navigation]
  );

  // Initialize recipient management hook first
  const recipientManagement = useRecipientManagement({
    onClearSearch: () => {}, // Will be set after search hook
    onNavigateToChannel: handleNavigateToChannel,
    onNavigateToConversation: handleNavigateToConversation,
    createUserItem: (contact: any) => ({
      name: contact.name,
      avatarPath: contact.avatarThumbnailPath || undefined,
      userId: contact.userId?.toString(),
      type: "user"
    })
  });

  const {
    selectedRecipients,
    recipientNames,
    handleRemoveRecipient,
    handleBackspace: handleBackspaceBase,
    clearRecipients
  } = recipientManagement;

  // Initialize search hook with getter functions
  const {
    recipient,
    searchResults,
    isSearching,
    handleRecipientChange,
    clearSearch
  } = useRecipientSearch({
    provisionedNumbers: provisionedNumbers || [],
    user,
    getSelectedRecipients: () => recipientManagement.selectedRecipients,
    getSelectedMessagingType: () => recipientManagement.selectedMessagingType
  });

  // console.log({searchResults})

  // Handle recipient selection with proper callback
  const handleRecipientSelect = useCallback(
    async (item: NewMessageItem) => {
      const currentUserId = user?.id?.toString();
      const isSelf = item.userId === currentUserId;

      console.warn("📱 [Chat] handleRecipientSelect called:", {
        item: item,
        itemType: item.type,
        itemPhoneNumber: item.phoneNumber,
        itemName: item.name,
        itemUserId: item.userId,
        currentUserId,
        isSelf,
        itemAvatarPath: item.avatarPath,
        selectedDidNumber: !!selectedDidNumber,
        selectedRecipientsCount: recipientManagement.selectedRecipients.length
      });
      await recipientManagement.handleRecipientSelect(item);
      clearSearch();

      // Dismiss keyboard after each recipient pick (group SMS needs this on 2nd+ number too).
      if (item.type !== "channel") {
        Keyboard.dismiss();
        headerRef.current?.blurSearchInput();
      }

      // Stay in search mode for all recipient types (including phone/personal/phone-contact).
      // This allows adding multiple numbers for group SMS, same as chat-icon (conversation) flow.
    },
    [
      recipientManagement.handleRecipientSelect,
      recipientManagement.selectedRecipients,
      clearSearch
    ]
  );

  const handleBackspace = useCallback(() => {
    handleBackspaceBase(recipient);
  }, [handleBackspaceBase, recipient]);

  const {
    activeChannelUrl,
    activeConversationId,
    chatType,
    smsLookupStatus,
    setActiveChannelUrl,
    setActiveConversationId,
    getDisplayName,
    resetRouting
  } = useConversationRouter({
    selectedRecipients,
    isSearchMode,
    initialChannelUrl: channelUrl,
    initialConversationId: conversationId,
    initialRecipientName: recipientName
  });

  const headerRef = useRef<DynamicChatHeaderHandle>(null);

  // Android: dismiss recipient search keyboard after SMS recipient lookup (incl. group SMS).
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (!isSearchMode || recipient.trim().length > 0) return;
    if (smsLookupStatus !== "done") return;
    if (activeConversationId) return;

    const phoneRecipients = selectedRecipients.filter(
      (r) =>
        r.type === "phone" ||
        r.type === "personal" ||
        r.type === "phone-contact"
    );
    if (phoneRecipients.length === 0) return;

    Keyboard.dismiss();
    headerRef.current?.blurSearchInput();
  }, [
    isSearchMode,
    recipient,
    smsLookupStatus,
    activeConversationId,
    selectedRecipients
  ]);

  // Exit search mode when viewing a conversation/channel from route params.
  // Stay in search mode whenever we have 2+ recipients - exit only via "After group SMS send"
  // effect when we find or create a group (avoids exiting when activeConversationId is stale 1:1).
  useEffect(() => {
    if (!channelUrl && !conversationId) return;
    const phoneCount = selectedRecipients.filter(
      (r) =>
        r.type === "phone" ||
        r.type === "personal" ||
        r.type === "phone-contact"
    ).length;
    if (phoneCount >= 2) return;
    // setIsSearchMode(false);
  }, [
    channelUrl,
    conversationId,
    selectedRecipients
  ]);

  useEffect(() => {
    const fetchChannelDirectly = async () => {
      if (
        activeChannelUrl &&
        chatType === "sendbird" &&
        !isSearchMode &&
        sendbirdInstance?.groupChannel
      ) {
        // Check if channel is already in array or currentChannel.
        const channelInArray = channels.find(
          (ch) => ch.url === activeChannelUrl
        );
        const isCurrentChannel = currentChannel?.url === activeChannelUrl;

        if (channelInArray || isCurrentChannel) {
          // Channel found, clear directChannel if it was set.
          if (directChannel) {
            setDirectChannel(null);
          }
          return;
        }

        // Channel not found, fetch it directly.
        try {
          const channel = await sendbirdInstance.groupChannel.getChannel(
            activeChannelUrl
          );
          if (channel) {
            setDirectChannel(channel);
          }
        } catch (error) {
          console.warn("⚠️ [Chat] Error fetching channel directly:", error);
          setDirectChannel(null);
        }
      } else {
        // Clear directChannel if conditions not met.
        if (directChannel) {
          setDirectChannel(null);
        }
      }
    };

    fetchChannelDirectly();
  }, [
    activeChannelUrl,
    channels,
    currentChannel,
    chatType,
    isSearchMode,
    sendbirdInstance?.groupChannel,
    directChannel
  ]);

  // Initialize message sending hook
  const { handleSendbirdMessageSent, handleTextMessageSent } =
    useMessageSending({
      isSearchMode,
      selectedRecipients,
      activeChannelUrl,
      onChannelCreated: (channelUrl: string) => {
        setActiveChannelUrl(channelUrl);
        setIsSearchMode(false);
        navigation.setParams({
          channelUrl,
          conversationId: undefined
        } as any);
      },
      onConversationCreated: (conversationId: number) => {
        setActiveConversationId(conversationId);
        setIsSearchMode(false);
        navigation.setParams({
          conversationId,
          channelUrl: undefined
        } as any);
      }
    });

  const recipientNumberProcessedRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (
      recipientNumber &&
      recipientNumber !== recipientNumberProcessedRef.current &&
      !conversationId &&
      !channelUrl &&
      selectedDidNumber
    ) {
      recipientNumberProcessedRef.current = recipientNumber;
      console.warn("📱 [Chat] Auto-selecting recipient from params:", {
        recipientNumber,
        recipientName,
        recipientAvatarPath
      });

      // Create a personal/phone recipient item and select it.
      const recipientItem: NewMessageItem = {
        type: "personal",
        name: recipientName || recipientNumber,
        phoneNumber: recipientNumber,
        avatarPath: recipientAvatarPath
      };

      console.warn(
        "📱 [Chat] Calling handleRecipientSelect with:",
        recipientItem
      );
      handleRecipientSelect(recipientItem);
    }
  }, [
    recipientNumber,
    recipientName,
    recipientAvatarPath,
    conversationId,
    channelUrl,
    selectedDidNumber,
    handleRecipientSelect,
    selectedRecipients.length
  ]);


  const processedConversationIdRef = useRef<number | undefined>(undefined);
  const lastConversationsLengthRef = useRef<number>(conversations.length);
  const lastCurrentConversationIdRef = useRef<number | undefined>(
    currentConversation?.id
  );
  const conversationFetchAttemptsRef = useRef<number>(0);
  const lastConversationIdForFetchRef = useRef<number | undefined>(undefined);
  const MAX_CONVERSATION_FETCH_ATTEMPTS = 2;

  useEffect(() => {
    if (conversationId && conversationId > 0) {
      if (lastConversationIdForFetchRef.current !== conversationId) {
        lastConversationIdForFetchRef.current = conversationId;
        conversationFetchAttemptsRef.current = 0;
      }

      const conversation = conversations.find((c) => c.id === conversationId);

      if (!conversation) {
        const attempts = conversationFetchAttemptsRef.current;
        const shouldFetch =
          attempts < MAX_CONVERSATION_FETCH_ATTEMPTS &&
          lastConversationsLengthRef.current === conversations.length;
        if (shouldFetch) {
          conversationFetchAttemptsRef.current = attempts + 1;
          dispatch(textActions.fetchConversations());
        }
        lastConversationsLengthRef.current = conversations.length;
        return;
      }

      conversationFetchAttemptsRef.current = 0;

      // Update conversations length ref.
      lastConversationsLengthRef.current = conversations.length;

      // Check if we've already processed this exact state.
      const conversationIdChanged =
        processedConversationIdRef.current !== conversationId;

      // Only process if conversationId actually changed (not just currentConversation).
      if (!conversationIdChanged) {
        // Update refs to current state but don't process.
        lastCurrentConversationIdRef.current = currentConversation?.id;
        return;
      }

      // Update refs before processing.
      processedConversationIdRef.current = conversationId;
      lastCurrentConversationIdRef.current = conversationId;

      // ✅ CRITICAL FIX: If activeConversationId differs from route param, trust activeConversationId
      // This happens when saga just set a group conversation but route param points to old 1-on-1
      if (activeConversationId && activeConversationId !== conversationId) {
        console.warn(
          "📱 [Chat] activeConversationId differs from route param - trusting active:",
          {
            routeParam: conversationId,
            activeConversationId
          }
        );
        // Don't override - the saga/router has set the correct conversation
        return;
      }

      // Only set if different from current
      if (!currentConversation || currentConversation.id !== conversationId) {
        dispatch(textActions.setCurrentConversation(conversation));
      }
      // Messages are fetched by TextChatContent on mount - no duplicate fetch here
    } else {
      // Reset refs when conversationId is cleared.
      processedConversationIdRef.current = undefined;
      lastCurrentConversationIdRef.current = undefined;
    }
  }, [
    conversationId,
    conversations,
    dispatch,
    activeConversationId,
    currentConversation
  ]);

  // Cleanup when leaving the chat screen
  useEffect(() => {
    return () => {
      resetRouting();
      clearRecipients();
      clearSearch();
      setIsSearchMode(true);
      dispatch(textActions.setCurrentConversation(null));
    };
  }, [dispatch, resetRouting, clearRecipients, clearSearch]);

  // When saga creates/finds a group SMS, it dispatches groupSmsCreated(conversationId).
  // Exit search mode and update params so we show the group thread.
  useEffect(() => {
    if (
      lastCreatedGroupConversationId == null ||
      !isSearchMode
    )
      return;
    setIsSearchMode(false);
    setActiveConversationId(lastCreatedGroupConversationId);
    navigation.setParams({
      conversationId: lastCreatedGroupConversationId,
      channelUrl: undefined
    } as any);
    dispatch(textActions.clearLastCreatedGroup());
  }, [
    lastCreatedGroupConversationId,
    isSearchMode,
    navigation,
    dispatch,
    setActiveConversationId
  ]);

  // ✅ CRITICAL FIX: Clear selectedRecipients when navigating to a conversation
  // This prevents useConversationRouter from continuing to search with old recipients
  useEffect(() => {
    if (
      activeConversationId &&
      selectedRecipients.length > 0 &&
      !isSearchMode
    ) {
      console.log(
        "🔄 [Chat] Clearing selectedRecipients after navigating to conversation:",
        {
          conversationId: activeConversationId,
          previousRecipientsCount: selectedRecipients.length
        }
      );
      clearRecipients();
    }
  }, [
    activeConversationId,
    selectedRecipients.length,
    isSearchMode,
    clearRecipients
  ]);

  // ✅ CRITICAL FIX: Clear SMS conversation when navigating to a Sendbird channel
  // This prevents stale SMS thread from showing when navigating from SMS to Sendbird after app kill
  useEffect(() => {
    if (
      channelUrl &&
      !isSearchMode &&
      (currentConversation || activeConversationId)
    ) {
      console.log(
        "🔄 [Chat] Clearing SMS conversation when navigating to Sendbird channel:",
        {
          channelUrl,
          previousConversationId:
            currentConversation?.id || activeConversationId
        }
      );
      dispatch(textActions.setCurrentConversation(null));
      // Also reset the active conversation ID
      setActiveConversationId(undefined);
    }
  }, [
    channelUrl,
    currentConversation,
    activeConversationId,
    isSearchMode,
    dispatch,
    setActiveConversationId
  ]);

  // Match DynamicChatHeader channel resolution so placeholder uses real members/names
  // when the channel is not yet in context `channels` (direct fetch / current channel).
  const resolvedSendbirdChannel = useMemo(() => {
    if (!activeChannelUrl || chatType !== "sendbird") return null;
    return (
      channels.find((ch) => ch.url === activeChannelUrl) ||
      (currentChannel?.url === activeChannelUrl ? currentChannel : null) ||
      (directChannel?.url === activeChannelUrl ? directChannel : null)
    );
  }, [activeChannelUrl, chatType, channels, currentChannel, directChannel]);

  // Get display name for current chat (avoid baking "Unknown" when placeholder will update next frame)
  const displayName = useMemo(() => {
    const raw = getDisplayName(
      recipientNames,
      user,
      directory,
      conversations,
      currentConversation,
      resolvedSendbirdChannel
    );
    if (raw && raw.trim().length > 0) return raw;
    return "Unknown";
  }, [
    getDisplayName,
    recipientNames,
    user,
    directory,
    conversations,
    currentConversation,
    resolvedSendbirdChannel
  ]);

  // Remount composer when compose recipients or channel change so TipTap placeholder picks up new title
  const sendbirdChatContentKey = useMemo(() => {
    if (channelUrl != null) {
      return activeChannelUrl || channelUrl || "new";
    }
    if (activeChannelUrl) return activeChannelUrl;
    const composeId = selectedRecipients
      .filter(
        (r) =>
          r.type === "user" ||
          r.type === "dm" ||
          r.type === "channel"
      )
      .map((r) => r.userId || r.channelUrl || r.name || "")
      .sort()
      .join("|");
    return `sendbird-compose-${composeId || "none"}`;
  }, [channelUrl, activeChannelUrl, selectedRecipients]);

  // Participants for SMS header: conversation, compose recipients, or route params
  // (personal contact drawer passes recipientNumber for existing threads).
  const textParticipantsResolved = useMemo(() => {
    if (isSearchMode || chatType !== "text") return undefined;
    if (currentConversation?.participants) {
      return currentConversation.participants;
    }
    const phoneRecipients = selectedRecipients.filter(
      (r) =>
        r.type === "phone" ||
        r.type === "personal" ||
        r.type === "phone-contact"
    );
    if (phoneRecipients.length > 0) {
      const numbers = phoneRecipients
        .map((r) => (r.phoneNumber ? stripPhoneNumber(r.phoneNumber) : null))
        .filter((n): n is string => !!n && n.length >= 10);
      if (numbers.length > 0) return numbers.join(",");
    }
    if (recipientNumber) {
      const normalized = stripPhoneNumber(recipientNumber);
      if (normalized.length >= 10) return normalized;
    }
    return undefined;
  }, [
    isSearchMode,
    chatType,
    currentConversation?.participants,
    selectedRecipients,
    recipientNumber
  ]);

  // Log search results changes
  useEffect(() => {
    if (isSearchMode && recipient.trim().length > 0) {
      // console.log("🔍 [Chat] Fuzzy search results updated:", {
      //   searchQuery: recipient,
      //   resultsCount: searchResults.length,
      //   isSearching,
      //   results: searchResults.map((item) => ({
      //     type: item.type,
      //     name: item.name,
      //     phoneNumber: item.phoneNumber,
      //     userId: item.userId,
      //     channelUrl: item.channelUrl,
      //     conversationId: item.conversationId
      //   }))
      // });
    }
  }, [searchResults, recipient, isSearchMode, isSearching]);

  // Search results rendering
  const renderSearchResult = useCallback(
    ({ item }: { item: NewMessageItem }) => {
      // console.log("🔍 [Chat] Rendering search result item:", {
      //   type: item.type,
      //   name: item.name,
      //   phoneNumber: item.phoneNumber,
      //   userId: item.userId,
      //   channelUrl: item.channelUrl,
      //   conversationId: item.conversationId,
      //   recordID: item.recordID,
      //   avatarPath: item.avatarPath
      // });

      const handlePress = () => {
        handleRecipientSelect(item);
      };

      const renderIcon = () => {
        switch (item.type) {
          case "channel":
            return (
              <View style={styles.iconContainer}>
                <Icon name={item.public ? "hash-01" : "lock-03"} size={22} />
              </View>
            );
          case "phone":
          case "personal":
          case "phone-contact":
            return (
              <View style={styles.iconContainer}>
                <Icon name="phone" size={22} />
              </View>
            );
          case "conversation":
            return (
              <View style={styles.iconContainer}>
                <Icon name="message-text-square-01" size={22} />
              </View>
            );
          case "user":
          case "dm":
          default:
            return (
              <Avatar
                source={item.avatarPath}
                name={item.name}
                size={32}
                borderRadius={borderRadius.md}
              />
            );
        }
      };

      return (
        <TouchableOpacity style={styles.resultItem} onPress={handlePress}>
          {renderIcon()}
          <View style={styles.resultTextContainer}>
            <Text size={fontSize.md} weight="medium">
              {item.name.length > 30
                ? `${item.name.slice(0, 30)}...`
                : item.name}
            </Text>
            {(item.type === "phone-contact" || item.type === "personal") &&
              item.phoneNumber && (
                <Text size={fontSize.sm} color="colors-text-text-secondary">
                  {formatPhoneNumber(item.phoneNumber)}
                </Text>
              )}
          </View>
        </TouchableOpacity>
      );
    },
    [handleRecipientSelect]
  );

  const searchKeyExtractor = useCallback(
    (item: NewMessageItem, index: number) =>
      `${item.type}-${
        item.channelUrl ||
        item.userId ||
        item.phoneNumber ||
        item.conversationId ||
        item.recordID ||
        item.name
      }-${index}`,
    []
  );
  // Show only search (no chat) when typing with no recipients; when we have recipients, keep chat mounted and show search as overlay to avoid keyboard flicker
  const showSearchOnly =
    isSearchMode &&
    recipient.trim().length > 0 &&
    selectedRecipients.length === 0;
  const shouldMountOverlay = isSearchMode && selectedRecipients.length > 0;
  const overlayVisible = shouldMountOverlay && recipient.trim().length > 0;

  const searchResultsContent = (
    <View style={styles.resultsContainer}>
      {recipient.trim().length > 0 ? (
        isSearching ? (
          <View style={styles.resultItem}>
            <Text size={fontSize.md} color="colors-text-text-secondary">
              Searching...
            </Text>
          </View>
        ) : searchResults.length > 0 ? (
          <RNFlatList
            data={searchResults}
            keyExtractor={searchKeyExtractor}
            renderItem={renderSearchResult}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        ) : (
          <View style={styles.resultItem}>
            <Text size={fontSize.md} color="colors-text-text-secondary">
              No results found
            </Text>
          </View>
        )
      ) : (
        <View style={styles.resultItem}>
          <Text
            size={fontSize.sm}
            color="color-colors-text-text-secondary"
          >
            Type to search for more recipients
          </Text>
        </View>
      )}
    </View>
  );

  // Main Render — inner chat components own keyboard avoidance (header offset, banners).
  return (
    <Screen avoidKeyboard={false}>
      <View
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        style={{ width: "100%" }}
      >
        <DynamicChatHeader
        ref={headerRef}
        isSearchMode={isSearchMode}
        recipient={recipient}
        onRecipientChange={handleRecipientChange}
        onBackspace={handleBackspace}
        selectedRecipients={selectedRecipients}
        onRemoveRecipient={handleRemoveRecipient}
        channel={
          !isSearchMode && chatType === "sendbird" && activeChannelUrl
            ? channels.find((ch) => ch.url === activeChannelUrl) ||
              (currentChannel?.url === activeChannelUrl
                ? currentChannel
                : undefined) ||
              (directChannel?.url === activeChannelUrl
                ? directChannel
                : undefined)
            : undefined
        }
        user={user}
        directory={directory}
        textTitle={
          !isSearchMode && chatType === "text" ? displayName : undefined
        }
        textAvatarPath={
          !isSearchMode && chatType === "text" ? recipientAvatarPath : undefined
        }
        textRecipientCount={
          !isSearchMode && chatType === "text"
            ? currentConversation?.participants
              ? currentConversation.participants.split(",").length
              : selectedRecipients.filter(
                  (r) =>
                    r.type === "phone" ||
                    r.type === "personal" ||
                    r.type === "phone-contact"
                ).length || 1
            : undefined
        }
        textParticipants={
          !isSearchMode && chatType === "text"
            ? textParticipantsResolved
            : undefined
        }
        onBeforeSmsCall={
          chatType === "text" ? () => setPausePollingForCall(true) : undefined
        }
        onCallFailed={
          chatType === "text" ? () => setPausePollingForCall(false) : undefined
        }
      />
      </View>

      <View style={styles.container}>
        {showSearchOnly ? (
          searchResultsContent
        ) : /* Show appropriate chat content based on type */
        chatType === "sendbird" ? (
          <>
          <SendbirdChatContent
            key={sendbirdChatContentKey}
            channelUrl={activeChannelUrl}
            recipientNames={displayName}
            onSendMessage={handleSendbirdMessageSent}
            scrollToMessageId={scrollToMessageId}
            keyboardOffsetExtra={headerHeight}
            onStorePendingMessage={setPendingSendbirdMessage}
            initialPendingMessage={pendingSendbirdMessage}
            onPendingMessageConsumed={() => setPendingSendbirdMessage(null)}
          />
          </>
        ) : (chatType === "text" ||
            selectedRecipients.some(
              (r) =>
                r.type === "phone" ||
                r.type === "personal" ||
                r.type === "phone-contact"
            )) &&
          selectedDidNumber ? (
          // ✅ FIX: If multiple phone recipients selected, always use NEW conversation mode
          // This prevents loading an existing 1-on-1 conversation when creating a group SMS
          (() => {
            const phoneRecipients = selectedRecipients.filter(
              (r) =>
                r.type === "phone" ||
                r.type === "personal" ||
                r.type === "phone-contact"
            );
            const isGroupSMS = phoneRecipients.length > 1;

            // console.log("🔍 [Chat] Rendering decision:", {
            //   phoneRecipientsCount: phoneRecipients.length,
            //   isGroupSMS: isGroupSMS,
            //   activeConversationId: activeConversationId,
            //   selectedRecipientsCount: selectedRecipients.length
            // });

            // Group SMS: Use activeConversationId once the group exists (after first send).
            // Before that, use -1 so we don't fetch; messages are stored under the real id.
            if (isGroupSMS) {
              const groupConversationId = activeConversationId ?? -1;
              return (
                <TextChatContent
                  key={
                    groupConversationId > 0
                      ? `text-group-${groupConversationId}`
                      : "text-group"
                  }
                  conversationId={groupConversationId}
                  recipientNames={displayName}
                  selectedRecipients={selectedRecipients}
                  onSendMessage={handleTextMessageSent}
                  keyboardOffsetExtra={headerHeight}
                  pausePolling={overlayVisible || pausePollingForCall}
                />
              );
            }

            // Single recipient: Use existing conversation if found
            if (activeConversationId) {
              return (
                <TextChatContent
                  key={`text-${activeConversationId}`}
                  conversationId={activeConversationId}
                  recipientNames={displayName}
                  selectedRecipients={selectedRecipients}
                  onSendMessage={handleTextMessageSent}
                  keyboardOffsetExtra={headerHeight}
                  pausePolling={overlayVisible || pausePollingForCall}
                />
              );
            }

            // Single recipient: New conversation
            return (
                <TextChatContent
                  key="text-new"
                  conversationId={-1}
                  recipientNames={displayName}
                  recipientPhoneNumber={phoneRecipients[0]?.phoneNumber}
                  selectedRecipients={selectedRecipients}
                  onSendMessage={handleTextMessageSent}
                  keyboardOffsetExtra={headerHeight}
                  pausePolling={overlayVisible || pausePollingForCall}
                />
              );
          })()
        ) : (chatType === "text" ||
            selectedRecipients.some(
              (r) =>
                r.type === "phone" ||
                r.type === "personal" ||
                r.type === "phone-contact"
            )) &&
          !selectedDidNumber ? (
          <View style={styles.emptyContainer}>
            <Icon name="phone" size={48} />
            <View style={{ height: padding.md }} />
            <Text
              size={fontSize.md}
              weight="semiBold"
              color="color-colors-text-text-primary"
              style={{ textAlign: "center" }}
            >
              Select a phone number
            </Text>
            <View style={{ height: padding.xs }} />
            <Text
              size={fontSize.sm}
              color="color-colors-text-text-secondary"
              style={{ textAlign: "center", paddingHorizontal: padding.xl }}
            >
              Please select a phone number from settings to send SMS/MMS
              messages
            </Text>
          </View>
        ) : (
          /* Show empty state only when no recipients selected and no active conversation */
          (() => {
            console.warn("🔍 [Chat] Showing empty state:", {
              isSearchMode,
              chatType,
              selectedDidNumber: !!selectedDidNumber,
              selectedRecipientsLength: selectedRecipients.length,
              selectedRecipients: selectedRecipients,
              activeChannelUrl,
              activeConversationId
            });
            return (
              <View style={styles.emptyContainer}>
                <Text
                  size={fontSize.sm}
                  color="color-colors-text-text-secondary"
                >
                  Select recipients to start messaging
                </Text>
              </View>
            );
          })()
        )}
        {shouldMountOverlay ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.resultsOverlay,
              {
                backgroundColor:
                  theme.colors["color-colors-background-bg-primary"],
                opacity: overlayVisible ? 1 : 0,
                pointerEvents: overlayVisible ? "auto" : "none"
              }
            ]}
          >
            {searchResultsContent}
          </View>
        ) : null}
      </View>
    </Screen>
  );
};

// Wrapper with RichEditorProvider
export const Chat: React.FC = () => {
  return (
    <RichEditorProvider>
      <ChatComponent />
    </RichEditorProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  resultsContainer: {
    flex: 1,
    paddingTop: padding.md,
    paddingHorizontal: padding.xl
  },
  resultsOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
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
  emptyContainer: {
    padding: padding["2xl"],
    alignItems: "center",
    justifyContent: "center",
    flex: 1
  }
});
