// Text/SMS Chat Content Component - Pure content, no header logic
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  InteractionManager
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector, useDispatch } from "react-redux";
import { Asset } from "react-native-image-picker";
import { toast } from "@backpackapp-io/react-native-toast";
import { useSoftphone } from "core/softphone/useSoftphone.ts";
import { useMeetingActive } from "features/meeting/MeetingActiveContext.tsx";
import { useChatKeyboardVerticalOffset } from "features/chat/utils/chatKeyboardOffset.ts";

// Editor Imports
import {
  CoreBridge,
  HistoryBridge,
  PlaceholderBridge,
  useEditorBridge
} from "@10play/tentap-editor";

// Type Imports
import { State } from "store/types.ts";
import { TextMessage as TextMessageType } from "shared/api/messaging/types.ts";
import * as textActions from "store/text/actions.ts";

// Component Imports
import { Logger } from "shared/utils/Logger.ts";
import { EdgeSwipeBackZone } from "shared/components/navigation/EdgeSwipeBackZone.tsx";
import { FlatList } from "shared/components/utils/Flatlist.tsx";
import { TextMessage as TextMessageComponent } from "features/text/components/TextMessage.tsx";
import { SimplifiedRichText } from "features/text/components/SimplifiedRichText.tsx";
import { uploadMediaFiles } from "shared/api/messaging/methods.ts";
import { editorHtml } from "features/chat/editor/build/editorHtml.ts";
import { createPasteImageBridge } from "features/chat/rich-editor/bridges/PasteImageBridge.ts";
import { pastedImagePayloadToAsset } from "features/chat/rich-editor/bridges/paste-image-attachment.ts";
import { MAX_SMS_MMS_BYTES } from "features/chat/rich-editor/pasteImageUtils.ts";
import {
  preloadSmsMessageImages,
  runSmsMediaCacheMigration,
  sanitizeSmsMediaCache
} from "features/text/utils/smsMediaCache.ts";
import { padding } from "core/theme/theme.ts";
import { useTheme } from "hooks/use-theme.ts";

const INITIAL_BATCH_SIZE = 20;

const logger = new Logger("TextChatContent");

/** Pair mobile logs with backend using grep `[SMS_MMS_UPLOAD]`. */
const SMS_UPLOAD_TAG = "[SMS_MMS_UPLOAD]";

const summarizeUriForSmsLog = (uri: string) => {
  const m = uri.match(/^([^:]+):/);
  const scheme = m ? m[1] : "(no-scheme)";
  const lastSeg = uri.includes("/") ? (uri.split("/").pop() ?? uri) : uri;
  return {
    scheme,
    lengthChar: uri.length,
    lastSegment:
      lastSeg.length > 120 ? `${lastSeg.slice(0, 120)}…` : lastSeg
  };
};

interface TextChatContentProps {
  conversationId: number;
  recipientNames: string;
  recipientPhoneNumber?: string; // For new conversations without conversationId
  selectedRecipients?: any[]; // For group SMS - array of recipients
  onSendMessage: () => void;
  /** Extra offset for keyboard (e.g. header height) so input is not hidden */
  keyboardOffsetExtra?: number;
  /** When true, pause SMS message polling (e.g. during outgoing call) */
  pausePolling?: boolean;
}

export const TextChatContent: React.FC<TextChatContentProps> = ({
  conversationId,
  recipientNames,
  recipientPhoneNumber,
  selectedRecipients,
  onSendMessage,
  keyboardOffsetExtra = 0,
  pausePolling = false
}) => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const { calls, activeCallId } = useSoftphone();
  const { meetingActiveGlobally } = useMeetingActive();
  const flatListRef = useRef<any>(null);
  const [isUploading, setIsUploading] = useState(false);

  const {
    currentConversation,
    conversations,
    conversationMessages,
    selectedDidNumber
  } = useSelector((state: State) => state.textReducer);

  const { accessToken } = useSelector((state: State) => state.authReducer);

  // Sort messages in descending order (newest first) for inverted list
  const messages = useMemo(() => {
    const msgs = conversationMessages[conversationId] || [];
    return [...msgs].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [conversationMessages, conversationId]);

  const lastProcessedConversationIdRef = React.useRef<number | undefined>(
    undefined
  );
  const previousMessagesLengthRef = React.useRef<number>(0);
  const hasScrolledToFirstMessageRef = React.useRef<boolean>(false);
  const editorRef = React.useRef<any>(null);
  const [attachmentAssets, setAttachmentAssets] = useState<Asset[]>([]);

  React.useEffect(() => {
    void runSmsMediaCacheMigration().then(() => sanitizeSmsMediaCache());
  }, []);

  React.useEffect(() => {
    if (messages.length === 0) return;
    preloadSmsMessageImages(messages, "full");
  }, [messages]);

  const handlePastedImage = useCallback(
    async (payload: Parameters<typeof pastedImagePayloadToAsset>[0]) => {
      try {
        const asset = await pastedImagePayloadToAsset(payload, MAX_SMS_MMS_BYTES);
        setAttachmentAssets((prev) => [...prev, asset]);
      } catch (error) {
        if (error instanceof Error && error.message === "FILE_TOO_LARGE") {
          toast.error("File should be 3 MB or smaller");
        } else {
          logger.error("Failed to add pasted image attachment:", error);
          toast.error("Failed to paste image");
        }
      }
    },
    []
  );

  const pasteImageBridge = useMemo(
    () => createPasteImageBridge(handlePastedImage),
    [handlePastedImage]
  );

  const scrollToLatestMessage = useCallback(
    (animated: boolean = true, delay: number = 100) => {
      if (!flatListRef.current || messages.length === 0) return;

      setTimeout(() => {
        if (!flatListRef.current) return;

        try {
          flatListRef.current.scrollToIndex({
            index: 0,
            animated,
            viewPosition: 0
          });
          hasScrolledToFirstMessageRef.current = true;
          logger.debug(
            `📜 [TextChatContent] Scrolled to latest message (index 0)`
          );
        } catch (error) {
          logger.debug(
            `📜 [TextChatContent] scrollToIndex failed, trying scrollToOffset`,
            error
          );
          try {
            flatListRef.current.scrollToOffset({
              offset: 0,
              animated
            });
            hasScrolledToFirstMessageRef.current = true;
            logger.debug(
              `📜 [TextChatContent] Scrolled to latest message using offset`
            );
          } catch (offsetError) {
            logger.debug(
              `📜 [TextChatContent] scrollToOffset also failed`,
              offsetError
            );
          }
        }
      }, delay);
    },
    [messages.length]
  );

  React.useEffect(() => {
    if (lastProcessedConversationIdRef.current === conversationId) {
      return;
    }
    hasScrolledToFirstMessageRef.current = false;
    previousMessagesLengthRef.current = 0;

    if (conversationId > 0) {
      const conversation = conversations.find((c) => c.id === conversationId);
      if (conversation) {
        if (!currentConversation || currentConversation.id !== conversationId) {
          lastProcessedConversationIdRef.current = conversationId;
          dispatch(textActions.setCurrentConversation(conversation));
        } else {
          lastProcessedConversationIdRef.current = conversationId;
        }
      }
    } else {
      lastProcessedConversationIdRef.current = undefined;
    }
  }, [conversationId]);

  const isFirstMountRef = React.useRef(true);

  // Initial fetch only - new messages come via push notification (handleSMSPushNotification)
  React.useEffect(() => {
    if (conversationId <= 0) return;

    const forceRefresh = isFirstMountRef.current;
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
    }

    dispatch(
      textActions.fetchConversationMessages(conversationId, 1, forceRefresh)
    );

    return () => {
      if (conversationId > 0) {
        dispatch(textActions.markConversationRead(conversationId));
      }
      isFirstMountRef.current = true;
    };
  }, [conversationId, dispatch]);

  React.useEffect(() => {
    // Only mark as read for valid conversation IDs when component mounts
    if (conversationId > 0) {
      const conversation = conversations.find((c) => c.id === conversationId);
      // Only mark as read if there are actually unread messages
      if (conversation && (conversation.unreadCount || 0) > 0) {
        console.log(
          "🚀 [TextChatContent] Marking conversation as read:",
          conversationId,
          "unread:",
          conversation.unreadCount || 0
        );
        dispatch(textActions.markConversationRead(conversationId));
      }
    }
  }, [conversationId, dispatch, conversations]);

  // Scroll to latest message when messages change or component mounts
  React.useEffect(() => {
    const currentLength = messages.length;
    const previousLength = previousMessagesLengthRef.current;

    // Scroll to latest when:
    // 1. Component mounts with messages (previousLength === 0 and currentLength > 0)
    // 2. New messages arrive (currentLength > previousLength)
    if (currentLength > 0) {
      if (previousLength === 0 || currentLength > previousLength) {
        // First load or new messages arrived - scroll to latest
        scrollToLatestMessage(
          previousLength === 0 ? false : true,
          previousLength === 0 ? 200 : 100
        );
      }
    }

    previousMessagesLengthRef.current = currentLength;
  }, [messages.length, messages, scrollToLatestMessage]);

  const handleLoadMore = useCallback(() => {
    logger.debug("Load more messages");
  }, []);

  const handleGifUpload = useCallback(
    async (value: {
      title: string;
      url: string;
      height: number;
      width: number;
    }) => {
      if (isUploading) return;

      try {
        if (!selectedDidNumber || !accessToken) {
          logger.error(
            "📱 [TextChatContent] No DID number or access token for GIF upload"
          );
          toast.error("Please select a phone number to send from");
          return;
        }

        setIsUploading(true);

        let recipients: string[] = [];

        if (selectedRecipients && selectedRecipients.length > 0) {
          recipients = selectedRecipients
            .filter(
              (r) =>
                r.type === "phone" ||
                r.type === "personal" ||
                r.type === "phone-contact"
            )
            .map((r) => r.phoneNumber)
            .filter(Boolean)
            .map((p) => p.replace(/^1+/, ""));

          logger.debug("📱 [TextChatContent] GIF: Using selectedRecipients:", {
            count: recipients.length,
            recipients: recipients
          });
        } else if (currentConversation && currentConversation.participants) {
          recipients = currentConversation.participants
            .split(",")
            .filter((p) => p !== currentConversation.sourceDID)
            .map((p) => p.replace(/^1+/, ""));
        } else if (recipientPhoneNumber) {
          recipients = [recipientPhoneNumber.replace(/^1+/, "")];
          logger.debug(
            "📱 [TextChatContent] GIF: Using recipientPhoneNumber for new conversation:",
            recipients
          );
        } else {
          logger.error(
            "📱 [TextChatContent] GIF: No conversation and no recipient phone number"
          );
          toast.error("No recipient found. Please start a new message.");
          return;
        }

        if (recipients.length === 0) {
          logger.error("📱 [TextChatContent] GIF: No valid recipients found");
          toast.error("No valid recipient found");
          return;
        }

        const sender = selectedDidNumber.number.replace(/^1+/, "");

        logger.debug("📱 [TextChatContent] GIF: Uploading and sending:", {
          recipients: recipients,
          sender: sender
        });

        const gifFile = {
          uri: value.url,
          name: `gif_${Date.now()}.gif`,
          type: "image/gif"
        };

        logger.debug(`${SMS_UPLOAD_TAG} GIF path — same uploadMediaFiles as images`, {
          platform: Platform.OS,
          uriSummary: summarizeUriForSmsLog(gifFile.uri)
        });

        const uploadResponse = await uploadMediaFiles(accessToken, [gifFile]);

        if (uploadResponse && uploadResponse.length > 0) {
          if (recipients.length > 1 && conversationId <= 0) {
            logger.warn(
              "🔄 [TextChatContent] GIF: Clearing currentConversation before new group SMS send"
            );
            dispatch(textActions.setCurrentConversation(null));
          }

          dispatch(
            textActions.sendTextMessage(recipients, sender, "", uploadResponse)
          );
          onSendMessage();
        } else {
          throw new Error("Failed to get media URL from upload");
        }
      } catch (error) {
        logger.error("Failed to upload GIF:", error);
        toast.error("Error uploading GIF");
      } finally {
        setIsUploading(false);
      }
    },
    [
      currentConversation,
      selectedDidNumber,
      selectedRecipients,
      recipientPhoneNumber,
      conversationId,
      dispatch,
      accessToken,
      isUploading,
      onSendMessage
    ]
  );

  const handleFileUpload = useCallback(
    async (files: Asset[]) => {
      if (isUploading) return;

      try {
        if (!selectedDidNumber || !accessToken) {
          logger.error(
            "📱 [TextChatContent] No DID number or access token for file upload"
          );
          toast.error("Please select a phone number to send from");
          return;
        }

        setIsUploading(true);

        let recipients: string[] = [];

        if (selectedRecipients && selectedRecipients.length > 0) {
          recipients = selectedRecipients
            .filter(
              (r) =>
                r.type === "phone" ||
                r.type === "personal" ||
                r.type === "phone-contact"
            )
            .map((r) => r.phoneNumber)
            .filter(Boolean)
            .map((p) => p.replace(/^1+/, ""));

          logger.debug("📱 [TextChatContent] File: Using selectedRecipients:", {
            count: recipients.length,
            recipients: recipients
          });
        } else if (currentConversation && currentConversation.participants) {
          recipients = currentConversation.participants
            .split(",")
            .filter((p) => p !== currentConversation.sourceDID)
            .map((p) => p.replace(/^1+/, ""));
        } else if (recipientPhoneNumber) {
          recipients = [recipientPhoneNumber.replace(/^1+/, "")];
          logger.debug(
            "📱 [TextChatContent] File: Using recipientPhoneNumber for new conversation:",
            recipients
          );
        } else {
          logger.error(
            "📱 [TextChatContent] File: No conversation and no recipient phone number"
          );
          toast.error("No recipient found. Please start a new message.");
          return;
        }

        if (recipients.length === 0) {
          logger.error("📱 [TextChatContent] File: No valid recipients found");
          toast.error("No valid recipient found");
          return;
        }

        const sender = selectedDidNumber.number.replace(/^1+/, "");

        logger.debug("📱 [TextChatContent] File: Uploading and sending:", {
          recipients: recipients,
          sender: sender,
          fileCount: files.length
        });

        logger.debug(
          `${SMS_UPLOAD_TAG} TextChatContent — picker → uploadMediaFiles pipeline`,
          {
            platform: Platform.OS,
            pickerAssetCount: files.length
          }
        );

        files.forEach((file, index) => {
          logger.debug(
            `${SMS_UPLOAD_TAG} Picker asset ${index + 1}/${files.length}`,
            {
              fileName: file.fileName ?? null,
              type: file.type ?? null,
              fileSizeBytes: file.fileSize ?? null,
              width: file.width ?? null,
              height: file.height ?? null,
              uriSummary: file.uri
                ? summarizeUriForSmsLog(file.uri)
                : null
            }
          );
        });

        const filesToUpload = files
          .filter((file) => file.uri)
          .map((file) => ({
            uri: file.uri!,
            name: file.fileName || `file_${Date.now()}`,
            type: file.type || "image/jpeg"
          }));

        if (filesToUpload.length === 0) {
          throw new Error("No valid files to upload");
        }

        logger.debug(
          `${SMS_UPLOAD_TAG} Mapped filesToUpload (multipart field name = name)`,
          {
            count: filesToUpload.length,
            parts: filesToUpload.map((f) => ({
              multipartFieldName: f.name,
              type: f.type,
              uriSummary: summarizeUriForSmsLog(f.uri)
            }))
          }
        );

        logger.debug(
          `${SMS_UPLOAD_TAG} Calling shared/api/messaging uploadMediaFiles`
        );

        const uploadResponse = await uploadMediaFiles(
          accessToken,
          filesToUpload
        );

        if (uploadResponse && uploadResponse.length > 0) {
          logger.debug(`${SMS_UPLOAD_TAG} uploadMediaFiles success`, {
            returnedUrlCount: uploadResponse.length
          });
          if (recipients.length > 1 && conversationId <= 0) {
            logger.warn(
              "🔄 [TextChatContent] File: Clearing currentConversation before new group SMS send"
            );
            dispatch(textActions.setCurrentConversation(null));
          }

          dispatch(
            textActions.sendTextMessage(recipients, sender, "", uploadResponse)
          );
          onSendMessage();
        } else {
          throw new Error("Failed to get media URLs from upload");
        }
      } catch (error) {
        logger.error("Failed to upload files:", error);
        toast.error("Error uploading files");
      } finally {
        setIsUploading(false);
      }
    },
    [
      currentConversation,
      selectedDidNumber,
      selectedRecipients,
      recipientPhoneNumber,
      conversationId,
      dispatch,
      accessToken,
      isUploading,
      onSendMessage
    ]
  );

  const handleSendMessage = useCallback(
    async (message: string) => {
      try {
        logger.debug("📱 [TextChatContent] handleSendMessage called:", {
          hasConversation: !!currentConversation,
          conversationId: conversationId,
          hasDidNumber: !!selectedDidNumber,
          recipientPhoneNumber: recipientPhoneNumber,
          selectedRecipientsCount: selectedRecipients?.length || 0,
          selectedRecipients: selectedRecipients,
          messageLength: message.length
        });

        if (!selectedDidNumber) {
          logger.error("📱 [TextChatContent] No DID number selected");
          toast.error("Please select a phone number to send from");
          return;
        }

        let recipients: string[] = [];

        // ✅ PRIORITY: If we have selectedRecipients (for NEW group SMS), use all of them
        // This must come BEFORE checking currentConversation to allow creating new groups
        if (selectedRecipients && selectedRecipients.length > 0) {
          recipients = selectedRecipients
            .filter(
              (r) =>
                r.type === "phone" ||
                r.type === "personal" ||
                r.type === "phone-contact"
            )
            .map((r) => r.phoneNumber)
            .filter(Boolean)
            .map((p) => p.replace(/^1+/, ""));

          logger.debug(
            "📱 [TextChatContent] Using selectedRecipients for group SMS:",
            {
              count: recipients.length,
              recipients: recipients
            }
          );
        }
        // If we have a conversation, get recipients from it
        else if (currentConversation && currentConversation.participants) {
          recipients = currentConversation.participants
            .split(",")
            .filter((p) => p !== currentConversation.sourceDID)
            .map((p) => p.replace(/^1+/, ""));
        }
        // If no conversation but we have recipientPhoneNumber (new conversation)
        else if (recipientPhoneNumber) {
          recipients = [recipientPhoneNumber.replace(/^1+/, "")];
          logger.debug(
            "📱 [TextChatContent] Using recipientPhoneNumber for new conversation:",
            recipients
          );
        }
        // No conversation and no recipient phone number
        else {
          logger.error(
            "📱 [TextChatContent] No conversation and no recipient phone number"
          );
          toast.error("No recipient found. Please start a new message.");
          return;
        }

        if (recipients.length === 0) {
          logger.error("📱 [TextChatContent] No valid recipients found");
          toast.error("No valid recipient found");
          return;
        }

        const sender = selectedDidNumber.number.replace(/^1+/, "");

        logger.debug("📱 [TextChatContent] Sending message:", {
          recipients: recipients,
          sender: sender,
          messageLength: message.length,
          conversationId: conversationId > 0 ? conversationId : "NEW"
        });

        // Clear currentConversation only when starting a NEW group (no conversation yet).
        // For existing groups (conversationId > 0), keep it so UI stays stable and saga can refetch.
        if (recipients.length > 1 && conversationId <= 0) {
          logger.warn(
            "🔄 [TextChatContent] Clearing currentConversation before new group SMS send"
          );
          dispatch(textActions.setCurrentConversation(null));
        }

        dispatch(textActions.sendTextMessage(recipients, sender, message, []));

        try {
          editor.setContent("");
          logger.debug(
            "📝 [TextChatContent] Editor cleared after sending message"
          );
        } catch (error) {
          logger.debug("📝 [TextChatContent] Failed to clear editor", error);
        }

        // Scroll to latest message after sending
        scrollToLatestMessage(true, 100);
        scrollToLatestMessage(true, 300);
        scrollToLatestMessage(true, 500);

        onSendMessage();
      } catch (error: any) {
        logger.error("📱 [TextChatContent] Failed to send message:", {
          error: error,
          code: error?.code,
          message: error?.message,
          response: error?.response
        });
        const errorMessage = error?.message || "Error sending message";
        toast.error(errorMessage);
      }
    },
    [
      currentConversation,
      selectedDidNumber,
      recipientPhoneNumber,
      selectedRecipients,
      conversationId,
      dispatch,
      onSendMessage,
      scrollToLatestMessage
    ]
  );

  const themedEditor = useMemo(
    () =>
      editorHtml
        .replace(
          "{{theme-background}}",
          theme.colors["color-colors-background-bg-primary"]
        )
        .replace(
          "{{theme-color}}",
          theme.colors["color-colors-text-text-primary"]
        ),
    [theme.colors]
  );


  
  const editor = useEditorBridge({
    customSource: themedEditor,
    bridgeExtensions: [
      CoreBridge,
      HistoryBridge,
      PlaceholderBridge.configureExtension({
        placeholder: `Message ${recipientNames}...`
      }),
      pasteImageBridge
    ],
    avoidIosKeyboard: Platform.OS === "ios"
  });
  editorRef.current = editor;


  React.useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;

    if (Platform.OS === "ios") {
      const timer = setTimeout(() => ed.focus(), 300);
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
  }, [conversationId]);

  const renderMessage = useCallback(
    ({ item, index }: { item: TextMessageType; index: number }) => {
      const prevMessage =
        index < messages.length - 1 ? messages[index + 1] : null;
      return <TextMessageComponent message={item} prevMessage={prevMessage} />;
    },
    [messages]
  );

  const keyExtractor = useCallback(
    (item: TextMessageType) => item.id.toString(),
    []
  );

  const onFlatListLayout = useCallback(() => {
    // Scroll to latest message on layout if we haven't scrolled yet and have messages
    if (messages.length > 0 && !hasScrolledToFirstMessageRef.current) {
      scrollToLatestMessage(false, 100);
    }
  }, [messages.length, scrollToLatestMessage]);

  const onScrollToIndexFailed = useCallback(
    (info: {
      index: number;
      highestMeasuredFrameIndex: number;
      averageItemLength: number;
    }) => {
      logger.debug(
        "📜 [TextChatContent] scrollToIndex failed, retrying with offset",
        info
      );
      // Retry with offset when scrollToIndex fails
      setTimeout(() => {
        if (flatListRef.current) {
          try {
            flatListRef.current.scrollToOffset({
              offset: 0,
              animated: true
            });
            hasScrolledToFirstMessageRef.current = true;
          } catch (error) {
            logger.debug(
              "📜 [TextChatContent] scrollToOffset also failed",
              error
            );
          }
        }
      }, 100);
    },
    []
  );

  const onContentSizeChange = useCallback(
    (_contentWidth: number, _contentHeight: number) => {
      // Scroll to latest when content size changes (new messages rendered)
      if (messages.length > 0 && !hasScrolledToFirstMessageRef.current) {
        scrollToLatestMessage(false, 150);
      }
    },
    [messages.length, scrollToLatestMessage]
  );

  const keyboardVerticalOffset = useChatKeyboardVerticalOffset(
    insets.top,
    calls,
    activeCallId,
    meetingActiveGlobally,
    keyboardOffsetExtra
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <EdgeSwipeBackZone edges="content" style={styles.listSwipeZone}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          inverted
          removeClippedSubviews={false}
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
          onScrollToIndexFailed={onScrollToIndexFailed}
          onContentSizeChange={onContentSizeChange}
          onLayout={onFlatListLayout}
        />
      </EdgeSwipeBackZone>
      <View style={styles.editorWrapper}>
        <SimplifiedRichText
          editor={editor}
          handleGifUpload={handleGifUpload}
          sendMessage={handleSendMessage}
          handleFile={handleFileUpload}
          selectedFiles={attachmentAssets}
          onSelectedFilesChange={setAttachmentAssets}
        />
      </View>
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
  editorWrapper: {
    marginTop: -padding.xs,
    marginBottom: padding.xl
  },
  listContent: {
    flexGrow: 1,
    paddingTop: 48,
    paddingBottom: padding.md
  }
});
