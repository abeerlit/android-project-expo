// React Imports
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, ListRenderItemInfo, Platform, Keyboard, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import { useParams } from "hooks/use-params.ts";
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
import { Routes } from "core/navigation/types/types.ts";
import { AuthParams } from "core/navigation/navigators/AuthenticatedStack.tsx";
import { State } from "store/types.ts";
import { ChatMessage } from "features/chat/types.ts";
import { EditorMention } from "features/chat/rich-editor/types.ts";
import { useSoftphone } from "core/softphone/useSoftphone.ts";
import { useMeetingActive } from "features/meeting/MeetingActiveContext.tsx";
import { useChatKeyboardVerticalOffset } from "features/chat/utils/chatKeyboardOffset.ts";

// Component Imports
import { Logger } from "shared/utils/Logger.ts";
import { EdgeSwipeBackZone } from "shared/components/navigation/EdgeSwipeBackZone.tsx";
import { Screen } from "shared/components/utils/Screen.tsx";
import { FlatList } from "shared/components/utils/Flatlist.tsx";
import { ChannelHeader } from "features/chat/components/ChannelHeader.tsx";
import { Message } from "features/chat/components/Message.tsx";
import { RichEditorProvider } from "features/chat/rich-editor/context/RichEditorProvider.tsx";
import { Editor } from "features/chat/rich-editor/AdvancedRichText.tsx";
import { MentionActionType } from "features/chat/rich-editor/mentions/MentionBridge.ts";
import { LinkBridge } from "features/chat/rich-editor/bridges/LinkBridge.ts";
import {
  createPasteImageBridge,
  PASTE_IMAGE_BRIDGE_NAME
} from "features/chat/rich-editor/bridges/PasteImageBridge.ts";
import { pastedImagePayloadToAsset } from "features/chat/rich-editor/bridges/paste-image-attachment.ts";
import { editorHtml } from "features/chat/editor/build/editorHtml.ts";
import { fontSize, padding } from "core/theme/theme.ts";
import { useRichEditor } from "features/chat/rich-editor/context/RichEditorContext.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { useTheme } from "hooks/use-theme.ts";
import { useDispatch } from "react-redux";
import * as sendbirdActions from "store/sendbird/actions.ts";
import { UnreadCountCache } from "features/chat/utils/unreadCountCache.ts";
import { ChatSkeletonLoader } from "features/chat/components/ChatSkeletonLoader.tsx";
import { Text } from "shared/components/Text.tsx";

const INITIAL_BATCH_SIZE = 20;
const MENTION_CHAR = "@";
const MAX_VALUE_LENGTH = 128;

const logger = new Logger("Threads");

const ThreadsChatComponent: React.FC = () => {
  // Navigation
  const { channelUrl, parentMessage, scrollToMessageId } =
    useParams<AuthParams[Routes.Threads]>();

  // Refs
  const flatListRef = useRef<any>(null);
  const hasScrolledToMessage = useRef(false);
  const suppressNextEmptyMentionQueryRef = useRef(false);
  const [attachmentAssets, setAttachmentAssets] = useState<Asset[]>([]);
  const [headerHeight, setHeaderHeight] = useState(0);

  // Hooks
  const insets = useSafeAreaInsets();
  const { calls, activeCallId } = useSoftphone();
  const { meetingActiveGlobally } = useMeetingActive();
  const theme = useTheme();
  const {
    toggleMentionSuggestion,
    isEditing,
    editMessage,
    setEditing,
    setMentionQuery
  } = useRichEditor();

  // Redux State
  const dispatch = useDispatch();
  const { user } = useSelector((state: State) => state.userReducer);
  const { directory } = useSelector((state: State) => state.directoryReducer);

  // Context
  const {
    currentChannel,
    sendUserMessage,
    sendFileMessage,
    sendMultipleFileMessage,
    editUserMessage,
    isConnected,
    activeParentMessage,
    threadMessages,
    setActiveThread,
    clearActiveThread,
    loadThreadFromCache,
    markChannelAsRead,
    fetchThreadMessages,
    isFetchingThread
  } = useSendbirdContext();

  // Thread-specific state (now using context)
  const messages = threadMessages;
  const loading = isFetchingThread;

  // Scroll to specific message when loaded (e.g., from reaction notification)
  useEffect(() => {
    if (
      !scrollToMessageId ||
      hasScrolledToMessage.current ||
      messages.length === 0
    )
      return;

    const messageIndex = messages.findIndex(
      (msg) => msg.messageId.toString() === scrollToMessageId
    );

    if (messageIndex !== -1 && flatListRef.current) {
      // Small delay to ensure list is rendered
      setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({
            index: messageIndex,
            animated: true,
            viewPosition: 0.5 // Center the message
          });
          hasScrolledToMessage.current = true;
          logger.debug("📍 [Threads] Scrolled to message:", scrollToMessageId);
        } catch (error) {
          logger.debug("⚠️ [Threads] Could not scroll to message:", error);
        }
      }, 300);
    }
  }, [messages, scrollToMessageId]);

  // Enter channel effect
  useEffect(() => {
    const enterChannel = async () => {
      if (channelUrl && currentChannel?.url !== channelUrl) {
        // This would typically be handled by the context
        logger.debug("Entering thread channel:", channelUrl);
      }
    };

    if (channelUrl) {
      void enterChannel();
    }
  }, [channelUrl, currentChannel]);

  // Set up active thread and fetch messages
  useEffect(() => {
    if (!parentMessage || !isConnected) return;

    // 1) Show cached replies immediately (sync, uses channelUrl from params)
    if (channelUrl) {
      loadThreadFromCache(channelUrl, parentMessage.messageId);
    }

    // 2) Set this thread as active and store the parent message
    setActiveThread(parentMessage.messageId, parentMessage);

    const setupThread = async () => {
      // 3) Mark channel as read (fire-and-forget, uses channelUrl from params)
      if (channelUrl) {
        void markChannelAsRead(channelUrl).then(() => {
          dispatch(sendbirdActions.resetChannelUnread(channelUrl));
          UnreadCountCache.setUnreadCount(channelUrl, 0);
        });
      }

      // 4) Sync from API (fetchThreadMessages accepts channelUrl - works even when currentChannel not set)
      await fetchThreadMessages(parentMessage, channelUrl);
    };

    void setupThread();

    // Cleanup: clear active thread when component unmounts
    return () => {
      clearActiveThread();
    };
  }, [
    parentMessage,
    isConnected,
    channelUrl,
    dispatch,
    setActiveThread,
    clearActiveThread,
    loadThreadFromCache,
    markChannelAsRead,
    fetchThreadMessages
  ]);

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

  // Channel Details
  const channelDetails = useMemo(() => {
    if (!currentChannel || !user) {
      return { isDm: false, name: "Thread" };
    }

    // Check if it's a DM channel
    const isDm = currentChannel.customType?.includes("dm") || false;

    // If it's a public channel, use the channel name
    if (!isDm) {
      return {
        isDm: false,
        name: currentChannel.name || "Thread"
      };
    }

    // For DM channels, filter out current user from channel members
    const otherMembers = currentChannel.members.filter(
      (member) => parseInt(member.userId) !== user.id
    );

    // If it's a group DM (more than 1 other person), use "group"
    if (otherMembers.length > 1) {
      return {
        isDm: true,
        name: "group"
      };
    }

    // If it's a 1-on-1 DM, get the other person's name
    if (otherMembers.length === 1) {
      const otherMember = otherMembers[0];
      const contact = directory.find(
        (contact) => contact.userId?.toString() === otherMember.userId
      );

      return {
        isDm: true,
        name: contact?.name?.trim() || otherMember.nickname || "Thread"
      };
    }

    // Fallback for empty DMs
    return {
      isDm: true,
      name: "Thread"
    };
  }, [currentChannel, user, directory]);

  // Message Handlers
  const handleLoadMore = useCallback(async () => {
    // For threads, we might implement pagination differently
    // This is a placeholder for now
    if (!isFetchingThread && parentMessage) {
      try {
        // Additional message loading logic could go here
        logger.debug("Loading more thread messages...");
      } catch (error) {
        logger.error("Failed to fetch more thread messages:", error);
      }
    }
  }, [isFetchingThread, parentMessage]);

  const handleGifUpload = useCallback(
    (value: { title: string; url: string; height: number; width: number }) => {
      try {
        const metaArrays = getGifMetaArrays(value);
        sendUserMessage({
          customType: "MESSAGE_GIF",
          message: "",
          metaArrays: metaArrays,
          parentMessageId: parentMessage?.messageId,
          isReplyToChannel: true
        });
      } catch (error) {
        logger.error("Failed to upload GIF:", error);
        toast.error("Error uploading GIF");
      }
    },
    [getGifMetaArrays, sendUserMessage, parentMessage]
  );

  const handleFileUpload = useCallback(
    (files: Asset[]) => {
      try {
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
            mimeType: file.type,
            parentMessageId: parentMessage?.messageId,
            isReplyToChannel: true
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
          sendMultipleFileMessage({
            fileInfoList: adaptedFiles,
            parentMessageId: parentMessage?.messageId,
            isReplyToChannel: true
          });
        }
      } catch (error) {
        logger.error("Failed to upload files:", error);
        toast.error("Error uploading files");
      }
    },
    [sendFileMessage, sendMultipleFileMessage, parentMessage]
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
        logger.debug("[Thread Send] editMessage:", editMessage);
        logger.debug(
          "[Thread Send] editMessage?.messageId:",
          editMessage?.messageId
        );
        logger.debug("[Thread Send] isEditing:", isEditing);

        if (isEditing && editMessage?.messageId) {
          logger.debug("[Thread Send] Editing message:", editMessage.messageId);
          await editUserMessage(message, editMessage.messageId);
          setEditing(null);
        } else {
          logger.debug(
            "[Thread Send] Creating new thread message with parentId:",
            parentMessage?.messageId
          );
          sendUserMessage({
            message,
            mentionType: MentionType.USERS,
            mentionedUserIds: mentionedUsers.map((i) => i.toString()),
            parentMessageId: parentMessage?.messageId,
            isReplyToChannel: true
          });
        }
      } catch (error) {
        logger.error("Failed to send message:", error);
        toast.error("Error sending message");
      }
    },
    [
      editMessage,
      isEditing,
      sendUserMessage,
      editUserMessage,
      setEditing,
      parentMessage
    ]
  );

  const handlePastedImage = useCallback(
    async (payload: Parameters<typeof pastedImagePayloadToAsset>[0]) => {
      logger.warn("[PasteImage] RN handlePastedImage (thread)", {
        mimeType: payload.mimeType,
        fileName: payload.fileName
      });
      try {
        const asset = await pastedImagePayloadToAsset(payload);
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
    logger.warn("[PasteImage] registering RN bridge (thread)", {
      bridgeName: PASTE_IMAGE_BRIDGE_NAME
    });
    return createPasteImageBridge(handlePastedImage);
  }, [handlePastedImage]);

  useEffect(() => {
    setAttachmentAssets([]);
  }, [channelUrl]);

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
        placeholder: `Reply to ${channelDetails.name}...`
      }),
      createMentionBridge(),
      pasteImageBridge
    ],
    avoidIosKeyboard: Platform.OS === "ios"
  });

  // Render Methods
  const renderMessage = useCallback(
    ({ item, index }: ListRenderItemInfo<ChatMessage>) => {
      const prevMessage =
        index < messages.length - 1 ? messages[index + 1] : null;
      return (
        <Message message={item} prevMessage={prevMessage} editor={editor} isInThread={true} />
      );
    },
    [messages, editor]
  );

  const keyExtractor = useCallback(
    (item: ChatMessage) => item.messageId.toString(),
    []
  );

  const renderListHeader = useCallback(() => {
    const displayMessage = activeParentMessage || parentMessage;
    if (displayMessage) {
      return (
        <View>
          <Message
            message={displayMessage as ChatMessage}
            prevMessage={null}
            threadsHeader={true}
            editor={editor}
            isInThread={true}
          />
          <View style={styles.threadDivider}>
            <Text
              weight={"medium"}
              size={fontSize.sm}
              style={{ paddingHorizontal: padding.sm }}
            >
              {displayMessage.threadInfo?.replyCount}{" "}
              {displayMessage.threadInfo?.replyCount === 1
                ? "reply"
                : "replies"}
            </Text>
            <View style={styles.threadLine} />
          </View>
        </View>
      );
    }
    return null;
  }, [activeParentMessage, parentMessage, editor]);

  if (!currentChannel && !parentMessage) {
    return <ChatSkeletonLoader />;
  }

  const keyboardVerticalOffset = useChatKeyboardVerticalOffset(
    insets.top,
    calls,
    activeCallId,
    meetingActiveGlobally,
    headerHeight
  );

  const threadContent = (
    <>
      <EdgeSwipeBackZone edges="content" style={styles.listSwipeZone}>
        <FlatList
          ref={flatListRef}
          data={messages}
          inverted={true}
          ListHeaderComponent={renderListHeader}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          removeClippedSubviews={true}
          keyboardDismissMode={"on-drag"}
          onScrollBeginDrag={Platform.OS === "android" ? () => {
            Keyboard.dismiss();
            editor?.blur();
          } : undefined}
          maxToRenderPerBatch={INITIAL_BATCH_SIZE}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          initialNumToRender={INITIAL_BATCH_SIZE}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.2}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps={"never"}
          onScrollToIndexFailed={(info) => {
            logger.debug(
              "⚠️ [Threads] scrollToIndex failed, trying fallback:",
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
      </EdgeSwipeBackZone>
      <View
        style={
          isEditing && {
            backgroundColor:
              theme.colors["colors-background-bg-warning-secondary"]
          }
        }
      >
        <Editor
          editor={editor}
          handleGifUpload={handleGifUpload}
          sendMessage={handleSendMessage}
          handleFile={handleFileUpload}
          selectedFiles={attachmentAssets}
          onSelectedFilesChange={setAttachmentAssets}
        />
      </View>
    </>
  );

  return (
    <Screen avoidKeyboard={false}>
      {currentChannel ? (
        <View
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
          style={{ width: "100%" }}
        >
          <ChannelHeader channel={currentChannel} />
        </View>
      ) : null}
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {threadContent}
      </KeyboardAvoidingView>
    </Screen>
  );
};

export const Threads: React.FC = () => {
  return (
    <RichEditorProvider>
      <ThreadsChatComponent />
    </RichEditorProvider>
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
  threadDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: padding.sm
  },
  threadLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e0e0e0"
  },
  threadText: {
    paddingHorizontal: padding.sm
  }
});
