import React, { memo, useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  View,
  Image,
  type ImageResizeMode,
  type ImageStyle,
  TouchableOpacity,
  Platform,
  type StyleProp
} from "react-native";
import { toast } from "@backpackapp-io/react-native-toast";
import ReactNativeBlobUtil from "react-native-blob-util";
import { FileIcon } from "shared/components/FileIcon.tsx";
import { useTheme } from "hooks/use-theme.ts";
import { useSelector } from "react-redux";
import ImageModal from "react-native-image-modal";
import Video from "react-native-video";
import { Text } from "shared/components/Text.tsx";
import { Avatar } from "shared/components/Avatar.tsx";
import { CachedSmsImage } from "features/text/components/CachedSmsImage.tsx";
import { ImageModalHeader } from "shared/components/ImageModalHeader.tsx";
import {
  ensureSmsCached,
  getLocalSmsUriAsync,
  isSmsGifUrl
} from "features/text/utils/smsMediaCache.ts";
import { TextMessage as TextMessageType } from "shared/api/messaging/types.ts";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";
import { formatPreciseTime, getDateText } from "shared/utils/utils.ts";
import { State } from "store/types.ts";

interface TextMessageProps {
  message: TextMessageType;
  prevMessage: TextMessageType | null;
}

const DateSeparator = memo(
  ({
    message,
    prevMessage
  }: {
    message: TextMessageType;
    prevMessage: TextMessageType | null;
  }) => {
    const theme = useTheme();

    const shouldShowDateSeparator = useMemo(() => {
      return (
        new Date(message?.timestamp || 0).toDateString() !==
        new Date(prevMessage?.timestamp || 0).toDateString()
      );
    }, [message?.timestamp, prevMessage?.timestamp]);

    if (!shouldShowDateSeparator) return null;

    return (
      <View style={styles.dateSeparatorContainer}>
        <View
          style={[
            styles.dateSeparatorLine,
            {
              backgroundColor:
                theme.colors["color-colors-border-border-secondary"]
            }
          ]}
        />
        <Text
          size={fontSize.sm}
          weight="medium"
          color="color-colors-text-text-tertiary"
          style={styles.dateSeparatorText}
        >
          {getDateText(new Date(message.timestamp).getTime())}
        </Text>
        <View
          style={[
            styles.dateSeparatorLine,
            {
              backgroundColor:
                theme.colors["color-colors-border-border-secondary"]
            }
          ]}
        />
      </View>
    );
  }
);
DateSeparator.displayName = "DateSeparator";

const formatPhoneNumber = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(
      6
    )}`;
  }
  if (cleaned.length === 11) {
    return `+${cleaned.slice(0, 1)} (${cleaned.slice(1, 4)}) ${cleaned.slice(
      4,
      7
    )}-${cleaned.slice(7)}`;
  }
  return phone;
};

const isPhoneNumber = (text: string): boolean => {
  return /^[\d\s\-()+ ]+$/.test(text);
};

const SenderInfo = memo(
  ({
    phoneNumber,
    senderInfo
  }: {
    phoneNumber: string;
    senderInfo: { name?: string; avatarPath?: string | null } | null;
  }) => {
    const displayName = senderInfo?.name || formatPhoneNumber(phoneNumber);
    const shouldShowHash = isPhoneNumber(displayName);

    return (
      <Avatar
        size={40}
        source={senderInfo?.avatarPath || undefined}
        name={shouldShowHash ? undefined : displayName}
        customIcon={shouldShowHash ? "#" : undefined}
        borderRadius={borderRadius.md}
      />
    );
  }
);
SenderInfo.displayName = "SenderInfo";

// Helper function to check if URL is a document/file (not image or video)
const isDocumentUrl = (url: string): boolean => {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  const documentExtensions = [
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".csv",
    ".zip",
    ".rar"
  ];
  return documentExtensions.some((ext) => lowerUrl.includes(ext));
};

// Helper function to check if URL is a video
const isVideoUrl = (url: string): boolean => {
  if (!url) {
    return false;
  }
  const lowerUrl = url.toLowerCase();
  // Check for video file extensions
  const videoExtensions = [
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".m4v",
    ".webm",
    ".3gp"
  ];
  const hasVideoExtension = videoExtensions.some((ext) =>
    lowerUrl.includes(ext)
  );

  // Check for video in path
  const hasVideoInPath =
    lowerUrl.includes("video/") ||
    lowerUrl.includes("/video/") ||
    lowerUrl.includes("videos/");

  // Check for video MIME type in URL
  const hasVideoMimeType =
    lowerUrl.includes("video/mp4") ||
    lowerUrl.includes("video%2Fmp4") ||
    lowerUrl.includes("type=video");

  const isVideo = hasVideoExtension || hasVideoInPath || hasVideoMimeType;

  return isVideo;
};

type ImageModalRenderParams = {
  style?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  isModalOpen?: boolean;
};

function isSmsModalLayer(params: ImageModalRenderParams): boolean {
  return params.isModalOpen === true && params.resizeMode === "contain";
}

type SmsImageModalProps = {
  messageId: number;
  fileIndex: number;
  remoteUri: string;
};

const SmsImageModal = memo(
  ({ messageId, fileIndex, remoteUri }: SmsImageModalProps) => {
    const [modalUri, setModalUri] = useState(remoteUri);
    const modalOpenRef = useRef(false);

    const resolveModalUri = useCallback(async (): Promise<string> => {
      if (isSmsGifUrl(remoteUri) || !messageId || !remoteUri?.trim()) {
        return remoteUri;
      }
      const local = await getLocalSmsUriAsync(messageId, fileIndex, "full");
      if (local) {
        return local;
      }
      try {
        return await ensureSmsCached(
          remoteUri,
          messageId,
          fileIndex,
          "full"
        );
      } catch {
        return remoteUri;
      }
    }, [messageId, fileIndex, remoteUri]);

    useEffect(() => {
      setModalUri(remoteUri);
      if (!messageId || isSmsGifUrl(remoteUri)) return;
      void resolveModalUri().then((uri) => {
        if (!modalOpenRef.current) {
          setModalUri(uri);
        }
      });
    }, [messageId, fileIndex, remoteUri, resolveModalUri]);

    const handleModalOpen = useCallback(() => {
      modalOpenRef.current = true;
      void resolveModalUri().then((uri) => {
        setModalUri(uri);
      });
    }, [resolveModalUri]);

    const handleModalClose = useCallback(() => {
      modalOpenRef.current = false;
    }, []);

    const renderImageComponent = useCallback(
      (params: ImageModalRenderParams) => {
        if (isSmsModalLayer(params)) {
          return (
            <Image
              style={params.style}
              source={{ uri: modalUri }}
              resizeMode={params.resizeMode ?? "contain"}
            />
          );
        }

        if (!messageId || !remoteUri) {
          return (
            <Image
              style={params.style}
              source={{ uri: remoteUri }}
              resizeMode={params.resizeMode || "cover"}
            />
          );
        }

        return (
          <CachedSmsImage
            messageId={messageId}
            fileIndex={fileIndex}
            remoteUri={remoteUri}
            variant="full"
            style={(params.style ?? {}) as StyleProp<ImageStyle>}
            resizeMode="cover"
          />
        );
      },
      [messageId, fileIndex, remoteUri, modalUri]
    );

    return (
      <ImageModal
        resizeMode="cover"
        style={styles.mediaImage}
        source={{ uri: remoteUri }}
        modalImageStyle={{ backgroundColor: "black" }}
        modalImageResizeMode="contain"
        onOpen={handleModalOpen}
        onClose={handleModalClose}
        renderHeader={(onClose) => (
          <ImageModalHeader onClose={onClose} imageUrl={modalUri} />
        )}
        renderImageComponent={renderImageComponent}
      />
    );
  }
);
SmsImageModal.displayName = "SmsImageModal";

const MessageContent = memo(({ message }: { message: TextMessageType }) => {
  const theme = useTheme();
  const hasMedia = message.mediaUrls && message.mediaUrls.length > 0;
  const [videoErrors, setVideoErrors] = useState<Set<number>>(new Set());
  const [playingVideos, setPlayingVideos] = useState<Set<number>>(new Set());
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  // Log media URLs for debugging (commented out for now)
  useEffect(() => {
    if (hasMedia && message.mediaUrls) {
      // Media URLs logging can be enabled here if needed
    }
  }, [hasMedia, message.mediaUrls]);

  // Handle file open - iOS needs special handling to download and open files
  const handleOpenFile = useCallback(
    async (url: string, index: number) => {
      if (isLoadingFile) return;

      try {
        setIsLoadingFile(true);
        console.log("📁 [TextMessage] Opening file:", url.substring(0, 100));

        if (Platform.OS === "ios") {
          // iOS: Download file and open with native viewer
          const fileName = decodeURIComponent(
            url.split("/").pop()?.split("?")[0] || "document.pdf"
          );
          const fileExtension =
            fileName.split(".").pop()?.toLowerCase() || "pdf";
          const mimeType =
            fileExtension === "pdf"
              ? "application/pdf"
              : fileExtension === "doc" || fileExtension === "docx"
              ? "application/msword"
              : "application/octet-stream";

          console.log(
            "📁 [TextMessage] iOS: Downloading file:",
            fileName,
            mimeType,
            index
          );

          const { dirs } = ReactNativeBlobUtil.fs;
          const filePath = `${dirs.CacheDir}/${fileName}`;

          // Download the file
          const res = await ReactNativeBlobUtil.config({
            fileCache: true,
            path: filePath
          }).fetch("GET", url);

          const downloadedPath = res.path();
          console.log(
            "📁 [TextMessage] iOS: File downloaded to:",
            downloadedPath
          );

          // Open with iOS native viewer
          await ReactNativeBlobUtil.ios.openDocument(downloadedPath);
        } else {
          // Android: Download file and open with native viewer
          const fileName = decodeURIComponent(
            url.split("/").pop()?.split("?")[0] || "document.pdf"
          );
          const fileExtension =
            fileName.split(".").pop()?.toLowerCase() || "pdf";
          const mimeType =
            fileExtension === "pdf"
              ? "application/pdf"
              : fileExtension === "doc" || fileExtension === "docx"
              ? "application/msword"
              : fileExtension === "xls" || fileExtension === "xlsx"
              ? "application/vnd.ms-excel"
              : fileExtension === "ppt" || fileExtension === "pptx"
              ? "application/vnd.ms-powerpoint"
              : fileExtension === "txt"
              ? "text/plain"
              : "application/octet-stream";

          console.log(
            "📁 [TextMessage] Android: Downloading file:",
            fileName,
            mimeType
          );

          const { dirs } = ReactNativeBlobUtil.fs;
          const filePath = `${dirs.CacheDir}/${fileName}`;

          const res = await ReactNativeBlobUtil.config({
            fileCache: true,
            path: filePath
          }).fetch("GET", url);

          const downloadedPath = res.path();
          console.log(
            "📁 [TextMessage] Android: File downloaded to:",
            downloadedPath
          );

          // Open with Android native viewer.
          await ReactNativeBlobUtil.android.actionViewIntent(
            downloadedPath,
            mimeType
          );
        }
      } catch (error) {
        console.error("📁 [TextMessage] Error opening file:", error);
        toast.error("Failed to open file. Please try again.");
      } finally {
        setIsLoadingFile(false);
      }
    },
    [isLoadingFile]
  );

  const handleVideoError = (error: any, index: number) => {
    console.error("📹 [TextMessage] Video error:", {
      index,
      error: error?.error?.code || error,
      url: message.mediaUrls?.[index]?.substring(0, 100)
    });
    setVideoErrors((prev) => new Set(prev).add(index));
  };

  const handleVideoLoad = (data: any, index: number) => {
    console.warn("📹 [TextMessage] Video loaded:", {
      index,
      duration: data?.duration,
      naturalSize: data?.naturalSize
    });
  };

  const handleVideoPress = (index: number) => {
    setPlayingVideos((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  return (
    <View style={styles.messageContentContainer}>
      {message.text ? (
        <Text size={fontSize.md} align="left" style={styles.messageText}>
          {message.text}
        </Text>
      ) : null}

      {hasMedia && (
        <View
          style={[
            styles.mediaContainer,
            { marginTop: message.text ? padding.sm : 0 }
          ]}
        >
          {message.mediaUrls?.map((url, index) => {
            const isVideo = isVideoUrl(url);
            const hasError = videoErrors.has(index);
            const isPlaying = playingVideos.has(index);

            if (isVideo && !hasError) {
              return (
                <TouchableOpacity
                  key={index}
                  style={styles.videoContainer}
                  onPress={() => handleVideoPress(index)}
                  activeOpacity={0.9}
                >
                  <Video
                    source={{ uri: url }}
                    style={styles.mediaVideo}
                    resizeMode="contain"
                    controls={true}
                    paused={!isPlaying}
                    onError={(error) => handleVideoError(error, index)}
                    onLoad={(data) => handleVideoLoad(data, index)}
                    poster={undefined}
                    ignoreSilentSwitch="ignore"
                    playInBackground={false}
                    playWhenInactive={false}
                    repeat={false}
                  />
                </TouchableOpacity>
              );
            }

            // For documents (PDF, DOC, etc.), show file icon with tap to open
            if (isDocumentUrl(url)) {
              const fileName = decodeURIComponent(
                url.split("/").pop()?.split("?")[0] || "Document"
              );
              const fileExtension =
                fileName.split(".").pop()?.toLowerCase() || "";
              const mimeType =
                fileExtension === "pdf"
                  ? "application/pdf"
                  : fileExtension === "doc" || fileExtension === "docx"
                  ? "application/msword"
                  : fileExtension === "xls" || fileExtension === "xlsx"
                  ? "application/vnd.ms-excel"
                  : fileExtension === "ppt" || fileExtension === "pptx"
                  ? "application/vnd.ms-powerpoint"
                  : "application/octet-stream";

              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.fileContainer,
                    {
                      borderColor:
                        theme.colors["color-colors-border-border-secondary"]
                    }
                  ]}
                  onPress={() => handleOpenFile(url, index)}
                  activeOpacity={0.7}
                  disabled={isLoadingFile}
                >
                  <View style={styles.fileInfoContainer}>
                    <FileIcon
                      fileName={fileName}
                      fileUrl={url}
                      fileType={mimeType}
                      iconSize={32}
                    />
                    <View style={styles.fileDetails}>
                      <Text
                        size={fontSize.sm}
                        weight="medium"
                        numberOfLines={1}
                        style={styles.fileName}
                      >
                        {fileName}
                      </Text>
                      <Text
                        size={fontSize.sm}
                        weight="regular"
                        color="color-colors-text-text-tertiary"
                      >
                        {isLoadingFile ? "Loading..." : "File"}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }

            if (isSmsGifUrl(url)) {
              return (
                <CachedSmsImage
                  key={index}
                  messageId={message.id}
                  fileIndex={index}
                  remoteUri={url}
                  variant="full"
                  style={styles.mediaImage}
                  resizeMode="cover"
                />
              );
            }

            return (
              <SmsImageModal
                key={index}
                messageId={message.id}
                fileIndex={index}
                remoteUri={url}
              />
            );
          })}
        </View>
      )}

      {message.errorState === 1 && (
        <View style={styles.errorContainer}>
          <Text
            size={fontSize.xs}
            color="color-colors-foreground-fg-error-primary"
            style={styles.errorText}
          >
            {message.errorDescription || "Failed to send"}
          </Text>
        </View>
      )}
    </View>
  );
});
MessageContent.displayName = "MessageContent";

const TextMessageComponent: React.FC<TextMessageProps> = ({
  message,
  prevMessage
}) => {
  const theme = useTheme();
  const { directory } = useSelector(
    ({ directoryReducer }: State) => directoryReducer
  );
  const { user } = useSelector(({ userReducer }: State) => userReducer);

  const isCurrentUser = message.direction === "outbound";

  const senderPhone = useMemo(() => {
    return message.from || "";
  }, [message.from]);

  const senderInfo = useMemo(() => {
    if (!senderPhone) return null;

    if (isCurrentUser && user) {
      return {
        name: user.extName || "You",
        avatarPath: user.avatarPath
      };
    }

    const contact = directory.find((contact) => {
      const contactPhone = contact.number?.replace(/\D/g, "");
      const messagePhone = senderPhone.replace(/\D/g, "");
      return contactPhone === messagePhone;
    });

    return contact || null;
  }, [directory, senderPhone, isCurrentUser, user]);

  const timeDifference =
    new Date(message?.timestamp || 0).getTime() -
      new Date(prevMessage?.timestamp || 0).getTime() >
    120000;

  const differentSender = message?.from !== prevMessage?.from;
  const senderUndefined =
    message?.from === undefined || prevMessage?.from === undefined;

  const differentDate =
    new Date(message?.timestamp || 0).toDateString() !==
    new Date(prevMessage?.timestamp || 0).toDateString();

  const shouldShowSenderInfo =
    timeDifference || differentSender || senderUndefined || differentDate;

  const senderName =
    senderInfo?.name ||
    (senderPhone ? formatPhoneNumber(senderPhone) : "Unknown");

  return (
    <>
      <View
        style={[
          styles.container,
          message.errorState === 1 && {
            backgroundColor:
              theme.colors["colors-background-bg-error-secondary"],
            borderLeftWidth: borderRadius.md,
            borderLeftColor:
              theme.colors["color-colors-foreground-fg-error-primary"]
          }
        ]}
      >
        {shouldShowSenderInfo && senderPhone && (
          <SenderInfo phoneNumber={senderPhone} senderInfo={senderInfo} />
        )}

        <View
          style={[
            styles.messageContent,
            !shouldShowSenderInfo && styles.messageContentWithoutAvatar
          ]}
        >
          {shouldShowSenderInfo && (
            <View style={styles.senderName}>
              <Text size={fontSize.md} weight="semiBold">
                {senderName}
              </Text>
              <Text size={fontSize.sm} color="color-colors-text-text-tertiary">
                {formatPreciseTime(new Date(message.timestamp).getTime())}
              </Text>
            </View>
          )}

          <MessageContent message={message} />
        </View>
      </View>

      {/* Date Separator - Shows at the top when date changes (renders after for inverted list) */}
      <DateSeparator message={message} prevMessage={prevMessage} />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: padding.lg,
    paddingVertical: padding.md,
    gap: padding.lg
  },
  messageContent: {
    alignItems: "flex-start",
    flex: 1
  },
  messageContentWithoutAvatar: {
    marginLeft: padding.lg + 40 // Avatar width + gap
  },
  messageContentCurrentUser: {
    marginLeft: 0
  },
  senderName: {
    marginBottom: padding.sm,
    flexDirection: "row",
    gap: padding.sm,
    alignItems: "center"
  },
  dateSeparatorContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: padding.lg,
    paddingVertical: padding.md,
    gap: padding.md
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1
  },
  dateSeparatorText: {
    paddingHorizontal: padding.md
  },
  messageContentContainer: {
    width: "100%",
    alignItems: "flex-start"
  },
  messageText: {
    lineHeight: 20,
    textAlign: "left"
  },
  mediaContainer: {
    flexDirection: "column",
    gap: padding.sm
  },
  mediaImage: {
    width: 175,
    height: 175,
    borderRadius: borderRadius.md
  },
  videoContainer: {
    width: 175,
    height: 175,
    borderRadius: borderRadius.md,
    overflow: "hidden",
    backgroundColor: "black"
  },
  mediaVideo: {
    width: "100%",
    height: "100%"
  },
  fileContainer: {
    minWidth: 250,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: padding.xl,
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    height: 72
  },
  fileInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1
  },
  fileDetails: {
    flex: 1,
    alignItems: "flex-start"
  },
  fileName: {
    flex: 1
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: padding.xs,
    gap: padding.xs
  },
  errorText: {
    flex: 1
  }
});

export const TextMessage = memo(TextMessageComponent);
