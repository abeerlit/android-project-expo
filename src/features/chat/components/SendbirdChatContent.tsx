// Sendbird Chat Content Component - Pure content, no header logic
import React, {
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useState
} from "react";
import {
  View,
  StyleSheet,
  AppState,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  InteractionManager
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import { Asset } from "react-native-image-picker";
import { toast } from "@backpackapp-io/react-native-toast";

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

// Type Imports
import { MentionType, MessageMetaArray } from "@sendbird/chat/message";
import { State } from "store/types.ts";
import { ChatMessage } from "features/chat/types.ts";
import { EditorMention } from "features/chat/rich-editor/types.ts";

// Component Imports
import { Logger } from "shared/utils/Logger.ts";
import { EdgeSwipeBackZone } from "shared/components/navigation/EdgeSwipeBackZone.tsx";
import { FlatList } from "shared/components/utils/Flatlist.tsx";
import { Message } from "features/chat/components/Message.tsx";
import { Editor } from "features/chat/rich-editor/AdvancedRichText.tsx";
import { MentionActionType } from "features/chat/rich-editor/mentions/MentionBridge.ts";
import { LinkBridge } from "features/chat/rich-editor/bridges/LinkBridge.ts";
import {
  createPasteImageBridge,
  PASTE_IMAGE_BRIDGE_NAME,
  PasteImageActionType
} from "features/chat/rich-editor/bridges/PasteImageBridge.ts";
import { pastedImagePayloadToAsset } from "features/chat/rich-editor/bridges/paste-image-attachment.ts";
import { editorHtml } from "features/chat/editor/build/editorHtml.ts";
import { fontSize, padding } from "core/theme/theme.ts";
import { useRichEditor } from "features/chat/rich-editor/context/RichEditorContext.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { useTheme } from "hooks/use-theme.ts";
import { Text } from "shared/components/Text.tsx";
import { ChannelInfoHeader } from "features/chat/components/ChannelInfoHeader.tsx";
import { useSoftphone } from "core/softphone/useSoftphone.ts";
import { useMeetingActive } from "features/meeting/MeetingActiveContext.tsx";
import { CHAT_DEV_LOG, chatDevWarn } from "features/chat/utils/chatDevLog.ts";
import { useChatKeyboardVerticalOffset } from "features/chat/utils/chatKeyboardOffset.ts";

const INITIAL_BATCH_SIZE = 20;
const MENTION_CHAR = "@";
const MAX_VALUE_LENGTH = 128;

const logger = new Logger("SendbirdChatContent");

interface SendbirdChatContentProps {
  channelUrl?: string;
  recipientNames: string;
  onSendMessage: () => void;
  scrollToMessageId?: string;
  /** Extra offset for keyboard (e.g. header height) so input is not hidden */
  keyboardOffsetExtra?: number;
  /** When user sends with no channel, parent can store this and pass back as initialPendingMessage after remount */
  onStorePendingMessage?: (payload: { message: string; mentionedUsers: string[] }) => void;
  /** Pending message from parent (survives remount when key changes from compose to channelUrl) */
  initialPendingMessage?: { message: string; mentionedUsers: string[] } | null;
  onPendingMessageConsumed?: () => void;
}

export const SendbirdChatContent: React.FC<SendbirdChatContentProps> = ({
  channelUrl,
  recipientNames,
  onSendMessage,
  scrollToMessageId,
  keyboardOffsetExtra = 0,
  onStorePendingMessage,
  initialPendingMessage,
  onPendingMessageConsumed
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const suppressNextEmptyMentionQueryRef = useRef(false);
  const {
    toggleMentionSuggestion,
    isEditing,
    editMessage,
    setEditing,
    setMentionQuery
  } = useRichEditor();

  const { user } = useSelector((state: State) => state.userReducer);
  const { directory } = useSelector((state: State) => state.directoryReducer);

  const { closeDrawer, isOpen: isDrawerOpen } = useDrawer();
  const {
    enterChannel,
    leaveChannel,
    currentChannel,
    messageCollection,
    messages,
    fetchMoreMessages,
    isFetchingMessages,
    sendUserMessage,
    sendFileMessage,
    sendMultipleFileMessage,
    editUserMessage,
    typingUsers,
    refreshCurrentChannelMessages
  } = useSendbirdContext();
  const { calls, activeCallId } = useSoftphone();
  const { meetingActiveGlobally } = useMeetingActive();

  // Hide replies in main chat: only show when channel matches and message has no parent
  const listMessages = useMemo(() => {
    const url = channelUrl || currentChannel?.url;
    if (!url) {
      chatDevWarn("[ReplyFilter] listMessages: no url, returning []");
      return [];
    }
    if (currentChannel?.url && url !== currentChannel.url) {
      chatDevWarn("[ReplyFilter] listMessages: channel mismatch, returning []", {
        url,
        currentUrl: currentChannel?.url
      });
      return [];
    }
    const filtered = messages.filter((m) => {
      const msg = m as {
        parentMessageId?: number;
        parent_message_id?: number;
        parentMessage?: unknown;
      };
      if (msg.parentMessage) return false;
      const pid = msg.parentMessageId ?? msg.parent_message_id;
      if (pid == null) return true;
      const n = Number(pid);
      return n === 0 || Number.isNaN(n);
    });
    const replyCount = messages.length - filtered.length;
    if (replyCount > 0) {
      chatDevWarn("[ReplyFilter] SendbirdChatContent listMessages filtered out replies:", {
        fromContext: messages.length,
        afterFilter: filtered.length,
        replyCount,
        replyIds: messages
          .filter((m) => {
            const msg = m as { parentMessageId?: number; parent_message_id?: number; parentMessage?: unknown };
            if (msg.parentMessage) return true;
            const pid = msg.parentMessageId ?? msg.parent_message_id;
            return pid != null && pid !== 0 && !Number.isNaN(Number(pid));
          })
          .map((r) => (r as { messageId: number }).messageId)
      });
    }
    return filtered;
  }, [messages, channelUrl, currentChannel?.url]);

  // Store pending message to send after channel creation
  const pendingMessageRef = useRef<{
    message: string;
    mentionedUsers: string[];
  } | null>(null);

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef<boolean>(false);
  const flatListRef = useRef<any>(null);
  const hasScrolledToMessage = useRef<boolean>(false);
  const initialChannelRefreshRef = useRef<string | null>(null);

  const componentMountTime = useRef(Date.now());
  const [listReady, setListReady] = useState(false);
  const [attachmentAssets, setAttachmentAssets] = useState<Asset[]>([]);
  const editorRef = useRef<any>(null);
  const suppressAutoFocusUntilRef = useRef(0);

  React.useEffect(() => {
    componentMountTime.current = Date.now();
    chatDevWarn("⏱️ [SendbirdChatContent] MOUNTED:", {
      channelUrl,
      timestamp: componentMountTime.current
    });
  }, []);

  // Show cached messages as soon as enterChannel applies them; short delay when empty (reply flash).
  React.useEffect(() => {
    const url = channelUrl || currentChannel?.url;
    if (!url) {
      setListReady(false);
      return;
    }
    if (currentChannel?.url && channelUrl && channelUrl !== currentChannel.url) {
      setListReady(false);
      return;
    }
    const canShowCached =
      !!channelUrl &&
      messages.length > 0 &&
      (!currentChannel?.url || currentChannel.url === channelUrl);
    const delayMs = canShowCached ? 0 : 80;
    const t = setTimeout(() => setListReady(true), delayMs);
    return () => clearTimeout(t);
  }, [channelUrl, currentChannel?.url, messages.length]);

  React.useEffect(() => {
    if (channelUrl) {
      initialChannelRefreshRef.current = null;
      chatDevWarn("⏱️ [SendbirdChatContent] Calling enterChannel:", {
        channelUrl,
        timeSinceMount: Date.now() - componentMountTime.current
      });
      logger.debug(
        "🚪 [SendbirdChatContent] Channel URL provided, entering channel:",
        channelUrl
      );
      enterChannel(channelUrl);
    }

    return () => {
      leaveChannel();
      closeDrawer();
      logger.debug(
        "🚪 [SendbirdChatContent] Channel URL changing or unmounting"
      );
    };
    // Note: enterChannel and leaveChannel are stable callbacks from context and don't need to be in deps
    // Including them would cause infinite loops if they're recreated
    // eslint-disable-next-line
  }, [channelUrl]);

  // Cold start / killed state: AppState may already be "active", so fetch messages
  // after the collection is ready (not only on background→foreground).
  useEffect(() => {
    if (!channelUrl || !currentChannel || currentChannel.url !== channelUrl) {
      return;
    }
    if (!messageCollection) {
      return;
    }
    if (initialChannelRefreshRef.current === channelUrl) {
      return;
    }
    initialChannelRefreshRef.current = channelUrl;
    void refreshCurrentChannelMessages();
  }, [
    channelUrl,
    currentChannel?.url,
    messageCollection,
    refreshCurrentChannelMessages
  ]);

  useEffect(() => {
    setAttachmentAssets([]);
  }, [channelUrl]);

  const lastMessageMeta = messages[messages.length - 1] as
    | { messageId?: number; createdAt?: number }
    | undefined;
  const messagesFingerprint = useMemo(() => {
    if (messages.length === 0) return "";
    return `${messages.length}:${lastMessageMeta?.messageId ?? 0}:${
      lastMessageMeta?.createdAt ?? 0
    }`;
  }, [
    messages.length,
    lastMessageMeta?.messageId,
    lastMessageMeta?.createdAt
  ]);

  // Dev-only: log when message list identity changes (not every context re-render)
  useEffect(() => {
    if (!CHAT_DEV_LOG || messages.length === 0) return;
    const replies = messages.filter((m) => {
      const msg = m as {
        parentMessageId?: number;
        parent_message_id?: number;
        parentMessage?: unknown;
      };
      if (msg.parentMessage) return true;
      const pid = msg.parentMessageId ?? msg.parent_message_id;
      return pid != null && pid !== 0 && !Number.isNaN(Number(pid));
    });
    chatDevWarn("[ReplyFilter] Messages from context:", {
      count: messages.length,
      replyCount: replies.length,
      listReady,
      listMessagesCount: listMessages.length,
      fingerprint: messagesFingerprint,
      timeSinceMount: Date.now() - componentMountTime.current
    });
  }, [messagesFingerprint, listReady, listMessages.length, messages.length]);

  // Sync parent's pending message into ref when we mount with channelUrl (after remount)
  useEffect(() => {
    if (initialPendingMessage && channelUrl) {
      logger.debug("[PendingMessage] READ from parent (survived remount)", {
        messageLength: initialPendingMessage.message?.length,
        mentionedCount: initialPendingMessage.mentionedUsers?.length
      });
      pendingMessageRef.current = initialPendingMessage;
    }
  }, [channelUrl, initialPendingMessage]);

  // Send pending message when channel becomes available (e.g. after creating a group)
  useEffect(() => {
    const toSend =
      pendingMessageRef.current != null
        ? pendingMessageRef.current
        : initialPendingMessage != null
          ? initialPendingMessage
          : null;
    if (!currentChannel || !toSend) return;
    const { message, mentionedUsers } = toSend;
    const source = pendingMessageRef.current ? "ref" : "initialPendingMessage";
    logger.debug("[PendingMessage] SEND: channel available, sending", {
      source,
      messageLength: message?.length,
      mentionedCount: mentionedUsers?.length
    });
    // Consume immediately to avoid double-send if effect re-runs before parent clears
    pendingMessageRef.current = null;
    onPendingMessageConsumed?.();
    try {
      sendUserMessage({
        message,
        mentionType: MentionType.USERS,
        mentionedUserIds: mentionedUsers.map((i) => i.toString())
      });
      onSendMessage();
      // Refresh message list so the sent message appears (onMessageReceived also adds it)
      const t = setTimeout(() => {
        refreshCurrentChannelMessages();
      }, 400);
      return () => clearTimeout(t);
    } catch (error) {
      logger.error("Failed to send pending message:", error);
      toast.error("Error sending message");
      pendingMessageRef.current = null;
      onPendingMessageConsumed?.();
    }
  }, [
    currentChannel,
    initialPendingMessage,
    sendUserMessage,
    onSendMessage,
    onPendingMessageConsumed,
    refreshCurrentChannelMessages
  ]);

  // Scroll to specific message when loaded (e.g., from reaction notification)
  const loadMoreAttemptsRef = useRef(0);
  const maxLoadAttempts = 5;

  useEffect(() => {
    if (
      !scrollToMessageId ||
      hasScrolledToMessage.current ||
      listMessages.length === 0
    )
      return;

    const messageIndex = listMessages.findIndex(
      (msg) => msg.messageId.toString() === scrollToMessageId
    );

    if (messageIndex !== -1 && flatListRef.current) {
      // Message found - scroll to it
      setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({
            index: messageIndex,
            animated: true,
            viewPosition: 0.5
          });
          hasScrolledToMessage.current = true;
          loadMoreAttemptsRef.current = 0;
          logger.debug(
            "📍 [SendbirdChatContent] Scrolled to message:",
            scrollToMessageId
          );
        } catch (error) {
          logger.debug(
            "⚠️ [SendbirdChatContent] Could not scroll to message:",
            error
          );
        }
      }, 500);
    } else if (
      loadMoreAttemptsRef.current < maxLoadAttempts &&
      !isFetchingMessages
    ) {
      // Message not found yet - load more messages
      loadMoreAttemptsRef.current += 1;
      logger.debug(
        "📥 [SendbirdChatContent] Message not found, loading more... attempt:",
        loadMoreAttemptsRef.current
      );
      fetchMoreMessages();
    } else if (loadMoreAttemptsRef.current >= maxLoadAttempts) {
      // Give up after max attempts
      logger.debug(
        "⚠️ [SendbirdChatContent] Could not find message after",
        maxLoadAttempts,
        "attempts"
      );
      hasScrolledToMessage.current = true; // Stop trying
    }
  }, [listMessages, scrollToMessageId, isFetchingMessages, fetchMoreMessages]);

  // Utility Methods
  const splitValue = useCallback((value: string): string[] => {
    if (value.length <= MAX_VALUE_LENGTH) {
      return [value];
    }

    const midpoint = Math.ceil(value.length / 2);
    const firstHalf = value.substring(0, midpoint);
    const secondHalf = value.substring(midpoint);

    return [...splitValue(firstHalf), ...splitValue(secondHalf)];
  }, []);

  const getGifMetaArrays = useCallback(
    (gif: {
      title: string;
      url: string;
      height: number;
      width: number;
    }): MessageMetaArray[] => {
      const metaArrays: MessageMetaArray[] = [];
      const { title, url, height, width } = gif;

      const metaItems = [
        { key: "title", value: title },
        { key: "url", value: url },
        { key: "height", value: String(height) },
        { key: "width", value: String(width) }
      ];

      metaItems.forEach(({ key, value }) => {
        if (value) {
          const splitValues = splitValue(value);
          metaArrays.push(new MessageMetaArray({ key, value: splitValues }));
        }
      });

      return metaArrays;
    },
    [splitValue]
  );

  // Message Handlers
  const handleLoadMore = useCallback(async () => {
    if (messageCollection?.hasPrevious && !isFetchingMessages) {
      try {
        await fetchMoreMessages();
      } catch (error) {
        logger.error("Failed to fetch more messages:", error);
      }
    }
  }, [fetchMoreMessages, messageCollection, isFetchingMessages]);

  // ✅ FIX: Fetch NEW messages when app comes from background to active mode
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState) => {
        if (nextAppState === "active") {
          // App came to foreground
          logger.debug(
            "🔄 [SendbirdChatContent] App came to foreground, refreshing messages",
            {
              channelUrl,
              hasCurrentChannel: !!currentChannel,
              hasMessageCollection: !!messageCollection,
              hasPrevious: messageCollection?.hasPrevious,
              isFetchingMessages
            }
          );

          // If we have a channel, fetch only NEW messages (not old ones)
          if (currentChannel) {
            logger.debug(
              "🔄 [SendbirdChatContent] Calling refreshCurrentChannelMessages on foreground"
            );
            try {
              await refreshCurrentChannelMessages();
            } catch (error) {
              logger.error(
                "❌ [SendbirdChatContent] Error refreshing messages on foreground:",
                error
              );
            }
          }

          // Also fetch older messages if available (original behavior)
          if (
            currentChannel &&
            messageCollection?.hasPrevious &&
            !isFetchingMessages
          ) {
            logger.debug(
              "🔄 [SendbirdChatContent] Calling fetchMoreMessages on foreground"
            );
            try {
              await fetchMoreMessages();
            } catch (error) {
              logger.error(
                "❌ [SendbirdChatContent] Error fetching messages on foreground:",
                error
              );
            }
          }
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [
    currentChannel,
    messageCollection,
    isFetchingMessages,
    fetchMoreMessages,
    refreshCurrentChannelMessages,
    channelUrl
  ]);

  const handleGifUpload = useCallback(
    async (value: {
      title: string;
      url: string;
      height: number;
      width: number;
    }) => {
      try {
        // If no channel exists, trigger channel creation first
        if (!currentChannel) {
          logger.debug(
            "No channel exists for GIF upload, triggering channel creation"
          );
          onSendMessage(); // Trigger channel creation
          toast.error("Please wait for chat to load, then try again");
          return;
        }

        const metaArrays = getGifMetaArrays(value);
        sendUserMessage({
          customType: "MESSAGE_GIF",
          message: "",
          metaArrays: metaArrays
        });
        onSendMessage();
      } catch (error) {
        logger.error("Failed to upload GIF:", error);
        toast.error("Error uploading GIF");
      }
    },
    [currentChannel, getGifMetaArrays, sendUserMessage, onSendMessage]
  );

  const handleFileUpload = useCallback(
    async (files: Asset[]) => {
      try {
        // If no channel exists, trigger channel creation first
        if (!currentChannel) {
          logger.debug(
            "No channel exists for file upload, triggering channel creation"
          );
          onSendMessage(); // Trigger channel creation
          toast.error("Please wait for chat to load, then try again");
          return;
        }

        if (files.length === 1) {
          const file = files[0];
          if (!file.uri) {
            logger.debug("File URI not found");
            toast.error("Error sending message");
            return;
          }

          sendFileMessage({
            file: {
              uri: file.uri,
              name: file.fileName || "",
              type: file.type || ""
            },
            fileSize: file.fileSize,
            fileName: file.fileName,
            mimeType: file.type
          });
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
          sendMultipleFileMessage({ fileInfoList: adaptedFiles });
        }
        onSendMessage();
      } catch (error) {
        logger.error("Failed to upload files:", error);
        toast.error("Error uploading files");
      }
    },
    [currentChannel, sendFileMessage, sendMultipleFileMessage, onSendMessage]
  );

  const handleSendMessage = useCallback(
    async ({
      message,
      mentionedUsers
    }: {
      message: string;
      mentionedUsers: string[];
    }) => {
      try {
        // If no channel exists, store the message and trigger channel creation
        // The message will be sent once the channel is created
        if (!currentChannel) {
          logger.debug(
            "[PendingMessage] STORE: no channel, storing and triggering creation",
            { messageLength: message?.length, mentionedCount: mentionedUsers?.length }
          );
          pendingMessageRef.current = { message, mentionedUsers };
          onStorePendingMessage?.({ message, mentionedUsers });
          onSendMessage(); // This will trigger channel creation in parent
          return;
        }

        logger.debug("[Chat Send] editMessage:", editMessage);
        logger.debug(
          "[Chat Send] editMessage?.messageId:",
          editMessage?.messageId
        );
        logger.debug("[Chat Send] isEditing:", isEditing);

        if (isEditing && editMessage?.messageId) {
          logger.debug("[Chat Send] Editing message:", editMessage.messageId);
          await editUserMessage(message, editMessage.messageId);
          setEditing(null);
        } else {
          logger.debug("[Chat Send] Creating new message");
          sendUserMessage({
            message,
            mentionType: MentionType.USERS,
            mentionedUserIds: mentionedUsers.map((i) => i.toString())
          });
        }
        onSendMessage();
      } catch (error) {
        logger.error("Failed to send message:", error);
        toast.error("Error sending message");
      }
    },
    [
      currentChannel,
      editMessage,
      isEditing,
      sendUserMessage,
      editUserMessage,
      setEditing,
      onSendMessage
    ]
  );

  const handlePastedImage = useCallback(
    async (payload: Parameters<typeof pastedImagePayloadToAsset>[0]) => {
      logger.warn("[PasteImage] RN handlePastedImage", {
        mimeType: payload.mimeType,
        fileName: payload.fileName,
        dataUrlLength: payload.dataUrl?.length ?? 0
      });
      try {
        const asset = await pastedImagePayloadToAsset(payload);
        logger.warn("[PasteImage] asset ready for pill", {
          uri: asset.uri,
          fileName: asset.fileName,
          fileSize: asset.fileSize
        });
        setAttachmentAssets((prev) => [...prev, asset]);
      } catch (error) {
        if (error instanceof Error && error.message === "FILE_TOO_LARGE") {
          toast.error("File should be less than 20 MB");
        } else {
          logger.error("Failed to add pasted image attachment:", error);
          toast.error("Failed to paste image");
        }
      }
    },
    []
  );

  const pasteImageBridge = useMemo(() => {
    logger.warn("[PasteImage] registering RN bridge", {
      bridgeName: PASTE_IMAGE_BRIDGE_NAME,
      actionType: PasteImageActionType.PasteImage
    });
    return createPasteImageBridge(handlePastedImage);
  }, [handlePastedImage]);

  // Bridge Configuration
  const createMentionBridge = useCallback(() => {
    const handleMentionQuery = (message: { payload: string; type: string }) => {
      const payload = message.payload ?? "";
      // After picking a user from RN, the WebView often sends mention-query with ""
      // before exit-mention — that re-opened the overlay and hid the formatting row (Android).
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
        placeholder: `Message ${recipientNames}...`
      }),
      createMentionBridge(),
      pasteImageBridge
    ],
    // iOS only: TenTap uses this to pad the WebView above the keyboard. On Android it
    // toggles ProseMirror paddingBottom when the keyboard shows/hides and causes visible jump.
    avoidIosKeyboard: Platform.OS === "ios",
    onChange: () => {
      if (
        !currentChannel ||
        typeof currentChannel.startTyping !== "function" ||
        (currentChannel as { _isCached?: boolean })._isCached
      ) {
        return;
      }

      if (!isTypingRef.current) {
        currentChannel.startTyping();
        isTypingRef.current = true;
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        if (typeof currentChannel?.endTyping === "function") {
          currentChannel.endTyping();
        }
        isTypingRef.current = false;
        typingTimeoutRef.current = null;
      }, 300);
    }
  });
  editorRef.current = editor;

  // Blur editor when drawer opens (dismisses WebView keyboard)
  useEffect(() => {
    if (isDrawerOpen && editorRef.current) {
      // Prevent queued focus timers from re-opening keyboard while opening drawer.
      suppressAutoFocusUntilRef.current = Date.now() + 1000;
      editorRef.current.blur();
    }
  }, [isDrawerOpen]);

  // Focus when we first enter this channel (navigate to channel).
  // Depends only on channelUrl so we don't refocus on drawer open, paste, etc.
  useEffect(() => {
    const url = channelUrl || currentChannel?.url;
    const isAutoFocusSuppressed = Date.now() < suppressAutoFocusUntilRef.current;
    if (!url || !listReady || isDrawerOpen || isAutoFocusSuppressed) return;

    const ed = editorRef.current;
    if (!ed) return;

    if (Platform.OS === "ios") {
      const timer = setTimeout(() => ed.focus(), 400);
      return () => clearTimeout(timer);
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let timer2: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      timer = setTimeout(() => {
        if (cancelled) return;
        ed.focus();
        timer2 = setTimeout(() => {
          if (!cancelled) ed.focus();
        }, 100);
      }, 500);
    });
    return () => {
      cancelled = true;
      task.cancel();
      if (timer) clearTimeout(timer);
      if (timer2) clearTimeout(timer2);
    };
  }, [channelUrl, currentChannel?.url, listReady, isDrawerOpen]);

  // Render Methods - Use messagesRef to avoid re-creating callback on every message update
  const messagesRef = useRef<ChatMessage[]>(listMessages);
  messagesRef.current = listMessages;

  const renderMessage = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      // Never show replies in main chat – hide if it has a parent
      const msg = item as { parentMessageId?: number; parent_message_id?: number };
      const pid = msg.parentMessageId ?? msg.parent_message_id;
      if (pid != null && pid !== 0) {
        return <View style={{ height: 0, overflow: "hidden" }} />;
      }
      const prevMessage =
        index < messagesRef.current.length - 1
          ? messagesRef.current[index + 1]
          : null;
      return (
        <Message
          message={item}
          prevMessage={prevMessage}
          editor={editor}
          mainChat
        />
      );
    },
    [editor]
  );

  const keyExtractor = useCallback(
    (item: ChatMessage) => item.messageId.toString(),
    []
  );

  const renderListHeader = useCallback(() => {
    if (!user || !currentChannel) return null;
    const hasFewMessages = listMessages.length <= INITIAL_BATCH_SIZE;
    const reachedBeginning = messageCollection?.hasPrevious === false;

    if (reachedBeginning || hasFewMessages) {
      return <ChannelInfoHeader channel={currentChannel} user={user} />;
    }
    return null;
  }, [messageCollection?.hasPrevious, user, currentChannel, listMessages.length]);

  // Typing Users
  const currentTypingUsers = useMemo(() => {
    if (!currentChannel || !user) return [];

    const channelTypingUsers = typingUsers[currentChannel.url] || [];
    return channelTypingUsers.filter(
      (typingUser) => parseInt(typingUser.userId) !== user.id
    );
  }, [typingUsers, currentChannel, user]);

  const [debouncedTypingText, setDebouncedTypingText] = useState<string | null>(
    null
  );

  const typingText = useMemo(() => {
    if (currentTypingUsers.length === 0) {
      return null;
    } else if (currentTypingUsers.length === 1) {
      const typingUser = currentTypingUsers[0];
      const contact = directory.find(
        (c) => c.userId?.toString() === typingUser.userId
      );
      const name = contact?.name?.trim() || typingUser.nickname || "Someone";
      return `${name} is typing...`;
    } else if (currentTypingUsers.length === 2) {
      const names = currentTypingUsers.map((typingUser) => {
        const contact = directory.find(
          (c) => c.userId?.toString() === typingUser.userId
        );
        return contact?.name?.trim() || typingUser.nickname || "Someone";
      });
      return `${names.join(" and ")} are typing...`;
    } else {
      return `${currentTypingUsers.length} people are typing...`;
    }
  }, [currentTypingUsers, directory]);

  useEffect(() => {
    if (typingText) {
      setDebouncedTypingText(typingText);
    } else {
      const timeout = setTimeout(() => {
        setDebouncedTypingText(null);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [typingText]);

  const renderTypingIndicator = useCallback(() => {
    return (
      <View style={styles.typingContainer}>
        {debouncedTypingText && (
          <Text
            align={"left"}
            size={fontSize.xs}
            weight={"medium"}
            style={[
              { color: theme.colors["color-colors-text-text-secondary"] }
            ]}
          >
            {debouncedTypingText}
          </Text>
        )}
      </View>
    );
  }, [debouncedTypingText, directory, theme]);

  const keyboardVerticalOffset = useChatKeyboardVerticalOffset(
    insets.top,
    calls,
    activeCallId,
    meetingActiveGlobally,
    keyboardOffsetExtra
  );

  const messageList = channelUrl || currentChannel ? (
    <FlatList
      key={channelUrl || currentChannel?.url}
      ref={flatListRef}
      data={listReady ? listMessages : []}
      ListHeaderComponent={listReady && listMessages.length > 1 ? renderListHeader() : <></>}
      renderItem={renderMessage}
      keyExtractor={keyExtractor}
      inverted
      removeClippedSubviews={true}
      keyboardDismissMode={"on-drag"}
      onScrollBeginDrag={Platform.OS === "android" ? () => {
        Keyboard.dismiss();
        editorRef.current?.blur();
      } : undefined}
      maxToRenderPerBatch={INITIAL_BATCH_SIZE}
      windowSize={5}
      updateCellsBatchingPeriod={50}
      initialNumToRender={INITIAL_BATCH_SIZE}
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.2}
      contentContainerStyle={styles.listContent}
      maintainVisibleContentPosition={{
        minIndexForVisible: 0,
        autoscrollToTopThreshold: 0
      }}
      onScrollToIndexFailed={(info) => {
        logger.debug(
          "⚠️ [SendbirdChatContent] scrollToIndex failed, trying fallback:",
          info
        );
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: true
          });
        }, 100);
      }}
    />
  ) : (
    <View style={styles.emptyContainer} />
  );

  const content = (
    <>
      <EdgeSwipeBackZone edges="content" style={styles.listSwipeZone}>
        {messageList}
      </EdgeSwipeBackZone>
      <View
        style={[
          styles.editorWrapper,
          isEditing && {
            backgroundColor:
              theme.colors["colors-background-bg-warning-secondary"]
          }
        ]}
      >
        <Editor
          editor={editor}
          handleGifUpload={handleGifUpload}
          sendMessage={handleSendMessage}
          handleFile={handleFileUpload}
          selectedFiles={attachmentAssets}
          onSelectedFilesChange={setAttachmentAssets}
        />
        {renderTypingIndicator()}
      </View>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {content}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  listSwipeZone: {
    flex: 1
  },
  listContent: {
    flexGrow: 1,
    paddingVertical: padding.md
  },
  editorWrapper: {
    marginTop: -padding.xs
  },
  typingContainer: {
    // marginTop: padding.xs,
    paddingHorizontal: padding.lg,
    height: 30,
    justifyContent: "center",
    marginBottom: -padding.xs
  },
  emptyContainer: {
    flex: 1
  }
});
