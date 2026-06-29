// React Imports
import React, { memo, useCallback, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTheme } from "hooks/use-theme.ts";
import { useDrawer } from "core/drawer/DrawerContext.tsx";

// Type Imports
import {
  ActivityIndicator,
  Dimensions,
  Image,
  type ImageResizeMode,
  type ImageSourcePropType,
  type ImageStyle,
  Platform,
  StatusBar,
  StyleSheet,
  type StyleProp,
  TouchableOpacity,
  View
} from "react-native";
import FastImage from "@d11/react-native-fast-image";
import Clipboard from "@react-native-clipboard/clipboard";
import { toast } from "@backpackapp-io/react-native-toast";
import {
  isAndroidClipboardImageSupported,
  setAndroidClipboardImageFromFile
} from "shared/utils/voxo-clipboard-android.ts";
import ImageModal from "react-native-image-modal";
import { CachedChatImage } from "features/chat/components/CachedChatImage.tsx";
import ReactNativeBlobUtil from "react-native-blob-util";
import {
  FileMessage as SendbirdFileMessage,
  MultipleFilesMessage,
  SendingStatus,
  UserMessage
} from "@sendbird/chat/message";

// Component Imports
import { Avatar } from "shared/components/Avatar.tsx";
import { Button } from "shared/components/Button.tsx";
import { FileIcon } from "shared/components/FileIcon.tsx";
import Icon from "shared/components/Icon.tsx";
import { Text } from "shared/components/Text.tsx";
import { Parser } from "features/chat/components/Parser.tsx";
import { MessageReactions } from "features/chat/components/MessageReactions.tsx";
import { MessageOptionsDrawer } from "./drawers/MessageOptionsDrawer.tsx";

// Utils & Constants
import {
  borderRadius,
  fontSize,
  padding,
  componentSize
} from "core/theme/theme.ts";
import { State } from "store/types.ts";
import {
  ChatMessage,
  ThreadInfoProps,
  ThreadsNavigationProp
} from "features/chat/types.ts";
import {
  formatPreciseTime,
  getDateText,
  getFileSize
} from "shared/utils/utils.ts";
import { CameraRoll } from "@react-native-camera-roll/camera-roll";
import { useRichEditor } from "features/chat/rich-editor/context/RichEditorContext.ts";
import { useNavigation } from "@react-navigation/core";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Routes } from "core/navigation/types/types.ts";
import { AuthParams } from "core/navigation/navigators/AuthenticatedStack.tsx";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import {
  appendAvatarCacheBust,
  avatarMediaCacheKey
} from "shared/utils/avatarCache.ts";

// Types
interface MessageProps {
  message: ChatMessage;
  prevMessage: ChatMessage | null;
  threads?: boolean;
  editor?: any;
  threadsHeader?: boolean;
  /** When true (main channel list), never render thread replies – hide them. */
  mainChat?: boolean;
  /** When true, hides "Reply in thread" option in long-press menu. */
  isInThread?: boolean;
}

// Helper functions
const getMetaValue = (
  message: UserMessage,
  key: string
): string | undefined => {
  return message?.metaArrays?.find((item) => item.key === key)?.value[0];
};

const isUnauthorizedAttachmentError = (error: unknown): boolean => {
  const text = String((error as any)?.message || error || "").toLowerCase();
  return (
    text.includes("unauthorized") ||
    text.includes("access denied") ||
    text.includes("403") ||
    text.includes("401")
  );
};

const buildAuthHeaders = (authToken?: string): Record<string, string> => {
  if (!authToken) return {};
  return {
    Authorization: `Bearer ${authToken}`
  };
};

const sanitizeFileName = (fileName: string): string =>
  fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

const getMimeExtension = (mimeType?: string): string | undefined => {
  const mime = (mimeType || "").toLowerCase();
  if (!mime) return undefined;
  if (mime.includes("pdf")) return ".pdf";
  if (mime.includes("msword")) return ".doc";
  if (mime.includes("officedocument.wordprocessingml.document")) return ".docx";
  if (mime.includes("vnd.ms-excel")) return ".xls";
  if (mime.includes("officedocument.spreadsheetml.sheet")) return ".xlsx";
  if (mime.includes("vnd.ms-powerpoint")) return ".ppt";
  if (mime.includes("officedocument.presentationml.presentation")) return ".pptx";
  if (mime.includes("zip")) return ".zip";
  if (mime.includes("plain")) return ".txt";
  return undefined;
};

const getUrlExtension = (url?: string): string | undefined => {
  if (!url) return undefined;
  try {
    const withoutQuery = url.split("?")[0] || "";
    const match = withoutQuery.match(/(\.[a-z0-9]{2,8})$/i);
    return match?.[1]?.toLowerCase();
  } catch {
    return undefined;
  }
};

const ensureFileNameExtension = (
  fileName: string,
  mimeType?: string,
  url?: string
): string => {
  if (/\.[a-z0-9]{2,8}$/i.test(fileName)) return fileName;
  return `${fileName}${getMimeExtension(mimeType) || getUrlExtension(url) || ""}`;
};

/** Cached network image for chat thumbnails (remote URL + auth headers). */
const ChatFastImage = ({
  source,
  resizeMode,
  style,
  authToken
}: {
  source: { uri: string };
  resizeMode?: string;
  style: object;
  authToken?: string;
}) => {
  const rm =
    resizeMode === "contain"
      ? FastImage.resizeMode.contain
      : FastImage.resizeMode.cover;
  const headers = buildAuthHeaders(authToken);

  return (
    <FastImage
      style={style}
      source={{
        uri: source.uri,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        priority: FastImage.priority.normal,
        cache: FastImage.cacheControl.web
      }}
      resizeMode={rm}
      transition={FastImage.transition.none}
    />
  );
};

/**
 * Android: FastImage/Glide can reuse a small bitmap from the in-list thumbnail when opening
 * the lightbox, so fullscreen looks soft. For the open modal only, use RN Image (Fresco) for a
 * fresh decode. Thumbnail and iOS still use ChatFastImage.
 */
const renderImageForImageModal = ({
  source,
  resizeMode,
  style,
  isModalOpen,
  authToken
}: {
  source: ImageSourcePropType;
  resizeMode?: ImageResizeMode;
  style?: StyleProp<ImageStyle>;
  isModalOpen: boolean;
  authToken?: string;
}) => {
  const uri =
    typeof source === "object" &&
    source !== null &&
    "uri" in source &&
    typeof (source as { uri?: string }).uri === "string"
      ? (source as { uri: string }).uri
      : undefined;

  if (Platform.OS === "android" && isModalOpen && uri) {
    return (
      <Image
        style={style}
        source={{ uri }}
        resizeMode={resizeMode ?? "contain"}
      />
    );
  }

  if (uri) {
    return (
      <ChatFastImage
        style={(style ?? {}) as object}
        source={{ uri }}
        resizeMode={(resizeMode as string) || "cover"}
        authToken={authToken}
      />
    );
  }

  return (
    <Image
      style={style}
      source={source}
      resizeMode={resizeMode ?? "contain"}
    />
  );
};

type ImageModalRenderParams = {
  style?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  isModalOpen?: boolean;
};

const renderCachedChatImageModal = ({
  params,
  messageId,
  fileIndex,
  remoteUri,
  authToken
}: {
  params: ImageModalRenderParams;
  messageId: number;
  fileIndex: number;
  remoteUri: string;
  authToken?: string;
}) => {
  const isModal = !!params.isModalOpen;

  // List thumbnail: disk cache only — Sendbird HTTPS returns 401 on FastImage even with Bearer.
  if (!isModal) {
    if (!messageId || !remoteUri) {
      return renderImageForImageModal({
        source: { uri: remoteUri },
        resizeMode: params.resizeMode,
        style: params.style,
        isModalOpen: false,
        authToken
      });
    }
    return (
      <CachedChatImage
        messageId={messageId}
        fileIndex={fileIndex}
        remoteUri={remoteUri}
        variant="full"
        style={(params.style ?? {}) as StyleProp<ImageStyle>}
        resizeMode={params.resizeMode || "cover"}
        authToken={authToken}
        forThumbnail
      />
    );
  }

  if (!messageId || !remoteUri) {
    return renderImageForImageModal({
      source: { uri: remoteUri },
      resizeMode: params.resizeMode,
      style: params.style,
      isModalOpen: true,
      authToken
    });
  }

  return (
    <CachedChatImage
      messageId={messageId}
      fileIndex={fileIndex}
      remoteUri={remoteUri}
      variant="full"
      style={(params.style ?? {}) as StyleProp<ImageStyle>}
      resizeMode="contain"
      authToken={authToken}
      preferLocal
    />
  );
};

const isInvalidDocumentContentType = (contentType: string): boolean => {
  const normalized = (contentType || "").toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("text/html") ||
    normalized.includes("application/json") ||
    normalized.includes("text/plain") ||
    normalized.includes("application/xml") ||
    normalized.includes("text/xml")
  );
};

// Helper functions for image operations
const ANDROID_CLIPBOARD_IMAGE_PATH = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/voxo_clipboard_image.jpg`;

const copyImageToClipboard = async (imagePath: string, authToken?: string) => {
  const localFilePath =
    Platform.OS === "android"
      ? ANDROID_CLIPBOARD_IMAGE_PATH
      : `${ReactNativeBlobUtil.fs.dirs.CacheDir}/clipboard_image_${Date.now()}.jpg`;
  try {
    const headers = buildAuthHeaders(authToken);

    await ReactNativeBlobUtil.config({
      fileCache: true,
      path: localFilePath
    }).fetch("GET", imagePath, headers);

    if (Platform.OS === "android") {
      if (!isAndroidClipboardImageSupported()) {
        toast.error("Image copy is not available on this device");
        return;
      }
      // Clipboard holds a content URI to this file — keep it until the next copy.
      await setAndroidClipboardImageFromFile(localFilePath);
    } else {
      const base64String = await ReactNativeBlobUtil.fs.readFile(
        localFilePath,
        "base64"
      );
      Clipboard.setImage(base64String);
      try {
        await ReactNativeBlobUtil.fs.unlink(localFilePath);
      } catch {
        // Best-effort cleanup
      }
    }

    toast.success("Image copied to clipboard!");
  } catch (error) {
    console.error("Error copying image to clipboard:", error);
    toast.error("Failed to copy image to clipboard");
  }
};

const saveImageToCameraRoll = async (imageUrl: string, authToken?: string) => {
  try {
    const localFilePath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/tempImage.jpg`;
    const headers = buildAuthHeaders(authToken);
    await ReactNativeBlobUtil.config({
      fileCache: true,
      path: localFilePath
    }).fetch("GET", imageUrl, headers);

    await CameraRoll.saveToCameraRoll(localFilePath, "photo");
    toast.success("Image saved to camera roll!");
  } catch (e) {
    console.error(e);
    toast.error("Failed to save image to camera roll");
  }
};

// Render header for image modal
const renderImageHeader = (
  onClose: () => void,
  imageUrl: string,
  authToken?: string
) => {
  return (
    <View
      style={{
        marginTop: padding.lg,
        marginHorizontal: padding.md,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between"
      }}
    >
      <View style={styles.imageModalHeaderLeftRow}>
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.imageModalHeaderTapTarget, styles.imageModalHeaderIconBox]}
          onPress={() => {
            onClose();
            void saveImageToCameraRoll(imageUrl, authToken);
          }}
        >
          <Icon name="download-cloud-02" size={25} color="white" />
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.imageModalHeaderTapTarget, styles.imageModalHeaderIconBox]}
          onPress={() => {
            onClose();
            void copyImageToClipboard(imageUrl, authToken);
          }}
        >
          <Icon name="copy-01" size={24} color="white" />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.imageModalHeaderTapTarget, styles.imageModalHeaderIconBox]}
        onPress={onClose}
      >
        <Text
          size={fontSize["2xl"]}
          weight={"bold"}
          style={styles.crossIconImage}
        >
          ×
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// Memoized message type components
const TextMessage = memo(({ message }: { message: UserMessage }) => (
  <Parser html={message.message} />
));

TextMessage.displayName = "TextMessage";

// Helper to open file with native viewer
const openFileWithNativeViewer = async (
  url: string,
  fileName: string,
  mimeType: string,
  authToken?: string
) => {
  if (!url || typeof url !== "string") {
    throw new Error("Attachment URL is missing");
  }

  const headers = buildAuthHeaders(authToken);
  const safeFileName = sanitizeFileName(
    ensureFileNameExtension(fileName || "document", mimeType, url)
  );
  const { dirs } = ReactNativeBlobUtil.fs;
  const filePath = `${dirs.CacheDir}/${safeFileName}`;

  const res = await ReactNativeBlobUtil.config({
    fileCache: true,
    path: filePath
  }).fetch("GET", url, headers);
  const responseInfo = (res.info?.() || {}) as {
    status?: number;
    headers?: Record<string, string | undefined>;
  };
  const statusCode = Number(responseInfo.status || 0);
  if (statusCode >= 400) {
    throw new Error(`Attachment download failed with status ${statusCode}`);
  }

  const stat = await ReactNativeBlobUtil.fs.stat(res.path());
  if (!stat?.size || Number(stat.size) <= 0) {
    throw new Error("Downloaded attachment is empty");
  }

  if (Platform.OS === "ios") {
    const responseHeaders = responseInfo.headers || {};
    const contentType =
      responseHeaders["content-type"] ||
      responseHeaders["Content-Type"] ||
      "";
    if (isInvalidDocumentContentType(contentType)) {
      throw new Error(
        `Downloaded attachment is not a file (content-type: ${contentType})`
      );
    }

    await ReactNativeBlobUtil.ios.openDocument(res.path());
    return;
  }

  // Android: Download and open with native viewer
  const downloadedPath = res.path();
  await ReactNativeBlobUtil.android.actionViewIntent(downloadedPath, mimeType);
};

const MultipleFileMessage = memo(
  ({
    message,
    authToken,
    resolveLatestAttachmentUrl
  }: {
    message: MultipleFilesMessage;
    authToken?: string;
    resolveLatestAttachmentUrl: (
      messageId: number,
      fileIndex?: number
    ) => Promise<string | undefined>;
  }) => {
    // Hooks

    const theme = useTheme();
    const [openingFileIndex, setOpeningFileIndex] = useState<number | null>(
      null
    );
    const isPendingSend =
      message.sendingStatus === SendingStatus.PENDING;

    // Constants
    const IMAGE_SIZE = 150;

    const handleFilePress = async (
      fileInfo: {
      url?: string;
      plainUrl?: string;
      fileName?: string;
      mimeType?: string;
    },
      fileIndex: number
    ) => {
      if (openingFileIndex !== null) return;
      setOpeningFileIndex(fileIndex);

      const fileName = fileInfo.fileName || "document";
      const mimeType = fileInfo.mimeType || "application/octet-stream";
      let resolvedUrl = fileInfo.url || fileInfo.plainUrl;
      try {
        if (!resolvedUrl) {
          resolvedUrl = await resolveLatestAttachmentUrl(
            message.messageId,
            fileIndex
          );
        }
        if (!resolvedUrl) {
          toast.error("Attachment is still loading. Try again.");
          return;
        }

        await openFileWithNativeViewer(
          resolvedUrl,
          fileName,
          mimeType,
          authToken
        );
      } catch (error) {
        if (!isUnauthorizedAttachmentError(error)) {
          console.error("Error opening file:", error);
          toast.error("Failed to open file");
          return;
        }

        // URL likely stale/expired in cached message - refresh once from Sendbird.
        const freshUrl = await resolveLatestAttachmentUrl(
          message.messageId,
          fileIndex
        );
        if (!freshUrl) {
          console.error("Error opening file:", error);
          toast.error("Failed to open file");
          return;
        }

        try {
          await openFileWithNativeViewer(
            freshUrl,
            fileName,
            mimeType,
            authToken
          );
        } catch (retryError) {
          console.error("Error opening file:", retryError);
          toast.error("Failed to open file");
        }
      } finally {
        setOpeningFileIndex((current) =>
          current === fileIndex ? null : current
        );
      }
    };

    return (
      <View style={styles.multipleFileSendingRoot}>
        <View style={styles.multipleFileContainer}>
        {message.data && <Parser html={message.data} />}
        {message.fileInfoList.map((fileInfo, index) => {
          const isImage = fileInfo.mimeType?.startsWith("image/") || false;
          const isLastItem = index === message.fileInfoList.length - 1;

          if (isImage) {
            const imageUri =
              fileInfo.url || fileInfo.plainUrl || "";
            return (
              <ImageModal
                key={index}
                resizeMode="cover"
                // Android: default true blurs full-screen image (HW texture). iOS ignores.
                renderToHardwareTextureAndroid={Platform.OS !== "android"}
                style={[
                  styles.imageFile,
                  {
                    width: IMAGE_SIZE,
                    height: IMAGE_SIZE,
                    marginBottom: isLastItem ? 0 : padding.sm
                  }
                ]}
                source={{ uri: imageUri }}
                modalImageStyle={{ backgroundColor: "black" }}
                modalImageResizeMode="contain"
                renderHeader={(onClose) =>
                  renderImageHeader(onClose, imageUri, authToken)
                }
                renderImageComponent={(params) =>
                  renderCachedChatImageModal({
                    params,
                    messageId: message.messageId,
                    fileIndex: index,
                    remoteUri: imageUri,
                    authToken
                  })
                }
              />
            );
          }

          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.fileContainer,
                {
                  borderColor:
                    theme.colors["color-colors-border-border-secondary"],
                  marginBottom: isLastItem ? 0 : padding.sm
                }
              ]}
              disabled={openingFileIndex === index}
              onPress={() =>
                handleFilePress({
                  url: fileInfo.url || fileInfo?.plainUrl || undefined,
                  plainUrl: fileInfo?.plainUrl || undefined,
                  fileName: fileInfo.fileName || undefined,
                  mimeType: fileInfo.mimeType || undefined
                }, index)
              }
            >
              <View style={styles.fileInfoContainer}>
                {openingFileIndex === index ? (
                  <View style={styles.fileIconLoader}>
                    <ActivityIndicator
                      size="small"
                      color={theme.colors["color-colors-text-text-tertiary"]}
                    />
                  </View>
                ) : (
                  <FileIcon
                    fileName={fileInfo.fileName || undefined}
                    fileUrl={fileInfo.url || undefined}
                    fileType={fileInfo.mimeType || undefined}
                    iconSize={32}
                  />
                )}
                <View style={styles.fileDetails}>
                  <Text
                    size={fontSize.sm}
                    weight="medium"
                    numberOfLines={1}
                    style={styles.fileName}
                  >
                    {fileInfo.fileName}
                  </Text>
                  <Text
                    size={fontSize.sm}
                    weight="regular"
                    color="color-colors-text-text-tertiary"
                  >
                    {openingFileIndex === index
                      ? "Opening..."
                      : getFileSize(fileInfo.fileSize)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
        </View>
        {isPendingSend ? (
          <View style={styles.multipleFileSendingOverlay}>
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        ) : null}
      </View>
    );
  }
);

MultipleFileMessage.displayName = "MultipleFileMessage";

const FileMessage = memo(
  ({
    message,
    authToken,
    resolveLatestAttachmentUrl
  }: {
    message: SendbirdFileMessage;
    authToken?: string;
    resolveLatestAttachmentUrl: (
      messageId: number,
      fileIndex?: number
    ) => Promise<string | undefined>;
  }) => {
  // Hooks
  const theme = useTheme();
  const [isOpeningFile, setIsOpeningFile] = useState(false);

  // Constants
  const IMAGE_SIZE = 175;
  const isPendingSend =
    message.sendingStatus === SendingStatus.PENDING;
  const imagePreviewUri = message.url || message.plainUrl || "";

  const handleFilePress = async () => {
    if (isOpeningFile) return;
    setIsOpeningFile(true);

    const fileName = message.name || "document";
    const mimeType = message.type || "application/octet-stream";
    let url = message.url || message.plainUrl || "";
    try {
      if (!url) {
        url = (await resolveLatestAttachmentUrl(message.messageId)) || "";
      }
      if (!url) {
        toast.error("Attachment is still loading. Try again.");
        return;
      }

      await openFileWithNativeViewer(url, fileName, mimeType, authToken);
    } catch (error) {
      if (!isUnauthorizedAttachmentError(error)) {
        console.error("Error opening file:", error);
        toast.error("Failed to open file");
        return;
      }

      // URL likely stale/expired in cached message - refresh once from Sendbird.
      const freshUrl =
        (await resolveLatestAttachmentUrl(message.messageId)) || "";
      if (!freshUrl) {
        console.error("Error opening file:", error);
        toast.error("Failed to open file");
        return;
      }

      try {
        await openFileWithNativeViewer(
          freshUrl,
          fileName,
          mimeType,
          authToken
        );
      } catch (retryError) {
        console.error("Error opening file:", retryError);
        toast.error("Failed to open file");
      }
    } finally {
      setIsOpeningFile(false);
    }
  };

  // Handle Image Files
  if (
    message.type &&
    typeof message.type === "string" &&
    message.type.startsWith("image/")
  ) {
    return (
      <View>
        {message.data && <Parser html={message.data} />}
        <View style={styles.imageSendingWrap}>
          <ImageModal
            resizeMode="cover"
            renderToHardwareTextureAndroid={Platform.OS !== "android"}
            style={[
              styles.singleImageFile,
              {
                width: IMAGE_SIZE,
                height: IMAGE_SIZE
              }
            ]}
            source={{ uri: imagePreviewUri }}
            modalImageStyle={{ backgroundColor: "black" }}
            modalImageResizeMode="contain"
            renderHeader={(onClose) =>
              renderImageHeader(onClose, imagePreviewUri, authToken)
            }
            renderImageComponent={(params) =>
              renderCachedChatImageModal({
                params,
                messageId: message.messageId,
                fileIndex: 0,
                remoteUri: imagePreviewUri,
                authToken
              })
            }
          />
          {isPendingSend ? (
            <View style={styles.imageSendingOverlay}>
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View>
      {message.data && <Parser html={message.data} />}
      <TouchableOpacity
        style={[
          styles.fileContainer,
          {
            borderColor: theme.colors["color-colors-border-border-secondary"]
          }
        ]}
        disabled={isOpeningFile || isPendingSend}
        onPress={() => {
          handleFilePress();
        }}
      >
        <View style={styles.fileInfoContainer}>
          {isOpeningFile || isPendingSend ? (
            <View style={styles.fileIconLoader}>
              <ActivityIndicator
                size="small"
                color={theme.colors["color-colors-text-text-tertiary"]}
              />
            </View>
          ) : (
            <FileIcon
              fileName={message.name}
              fileUrl={message.url}
              fileType={message.type}
              iconSize={32}
            />
          )}
          <View style={styles.fileDetails}>
            <Text
              size={fontSize.sm}
              weight="medium"
              numberOfLines={1}
              style={styles.fileName}
            >
              {message.name}
            </Text>
            <Text
              size={fontSize.sm}
              weight="regular"
              color="color-colors-text-text-tertiary"
            >
              {isPendingSend
                ? "Sending…"
                : isOpeningFile
                  ? "Opening..."
                  : getFileSize(message.size)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
});

FileMessage.displayName = "FileMessage";

const GifMessage = memo(({ message }: { message: UserMessage }) => {
  // Extract GIF Data
  const gifUrl = getMetaValue(message, "url");
  const originalWidth = Number(getMetaValue(message, "width")) / 2;
  const originalHeight = Number(getMetaValue(message, "height")) / 2;
  const title = getMetaValue(message, "title");

  // Calculate Dimensions
  const calculateDimensions = () => {
    const maxWidth = Dimensions.get("window").width;
    const calcWidth = Math.min(originalWidth, maxWidth);
    const aspectRatio = originalHeight / originalWidth;
    const calcHeight = calcWidth * aspectRatio;

    return {
      width: isNaN(calcWidth) ? 200 : calcWidth,
      height: isNaN(calcHeight) ? 150 : calcHeight
    };
  };

  const { width, height } = calculateDimensions();

  if (!gifUrl) return null;

  return (
    <View style={styles.gifContainer}>
      {/* GIF Image */}
      <FastImage
        source={{
          uri: gifUrl,
          priority: FastImage.priority.normal,
          cache: FastImage.cacheControl.web
        }}
        style={[styles.gifImage, { width, height }]}
        resizeMode={FastImage.resizeMode.cover}
        transition={FastImage.transition.none}
      />
      {/* GIPHY Attribution */}
      <View style={styles.giphyFooter}>
        <FastImage
          source={{
            uri: "https://global-app.s3.amazonaws.com/omnia-assets/Giphy+S3/GIPHY+Icon+DarkBackgrounds+36+dark.png",
            priority: FastImage.priority.low,
            cache: FastImage.cacheControl.immutable
          }}
          style={styles.giphyIcon}
          resizeMode={FastImage.resizeMode.contain}
          transition={FastImage.transition.none}
        />
        <Text size={fontSize.xs} color="color-colors-text-text-tertiary">
          {title || "Powered by GIPHY"}
        </Text>
      </View>
    </View>
  );
});

GifMessage.displayName = "GifMessage";

const MeetMessage = memo(({ message }: { message: UserMessage }) => {
  // Hooks
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AuthParams>>();

  // Extract Meeting Data
  const meetURL = getMetaValue(message, "meetURL");
  const dialInNum = getMetaValue(message, "dialInNum");

  // Event Handlers
  const handleJoinMeeting = () => {
    if (meetURL) {
      navigation.navigate(Routes.Meetings, { meetURL });
    }
  };

  const handleCopyMeetingLink = () => {
    if (meetURL) {
      Clipboard.setString(meetURL);
      toast.success("Meeting link copied to clipboard");
    }
  };

  return (
    <View
      style={[
        styles.meetContainer,
        {
          borderColor: theme.colors["color-colors-border-border-secondary"]
        }
      ]}
    >
      {/* Meeting Header */}
      <View
        style={[
          styles.meetHeader,
          {
            borderBottomColor:
              theme.colors["color-colors-border-border-secondary"]
          }
        ]}
      >
        <Icon
          name="video-recorder"
          size={20}
          color={theme.colors["color-colors-border-border-secondary"]}
        />
        <Text
          size={fontSize.md}
          weight="semiBold"
          color="color-colors-text-text-secondary"
        >
          Started a meeting
        </Text>
      </View>

      {/* Meeting Details */}
      <View style={styles.meetDetails}>
        <View style={styles.meetDetailsHeader}>
          <Icon
            name="users-01"
            size={22}
            color={theme.colors["color-colors-border-border-secondary"]}
          />
          <Text
            size={fontSize.md}
            weight="medium"
            color="color-colors-text-text-secondary"
          >
            Meeting Details
          </Text>
        </View>

        {/* Meeting URL */}
        {meetURL && (
          <TouchableOpacity
            style={styles.meetDetailRow}
            onPress={handleCopyMeetingLink}
            accessibilityRole="button"
          >
            <Icon
              name="copy-01"
              size={15}
              color={theme.colors["color-colors-border-border-secondary"]}
            />
            <Text
              size={fontSize.xs}
              color="color-colors-text-text-secondary"
              numberOfLines={1}
              style={styles.meetDetailText}
            >
              {meetURL}
            </Text>
          </TouchableOpacity>
        )}

        {/* Dial-in Number */}
        {dialInNum && (
          <View style={styles.meetDetailRow}>
            <Text
              size={fontSize.md}
              color="color-colors-border-border-secondary"
              style={styles.hashSymbol}
            >
              #
            </Text>
            <Text
              size={fontSize.xs}
              align="left"
              color="color-colors-text-text-secondary"
              style={styles.meetDetailText}
            >
              {dialInNum}
            </Text>
          </View>
        )}

        {/* Join Meeting Button */}
        {meetURL && (
          <Button
            type="text"
            onPress={handleJoinMeeting}
            size={fontSize.md}
            weight="semiBold"
            textStyle={{
              color: theme.colors["colors-text-text-secondary"]
            }}
          >
            Join Meeting
          </Button>
        )}
      </View>
    </View>
  );
});

MeetMessage.displayName = "MeetMessage";

const DateSeparator = memo(
  ({
    message,
    prevMessage
  }: {
    message: ChatMessage;
    prevMessage: ChatMessage | null;
  }) => {
    // Hooks
    const theme = useTheme();

    const shouldShowDateSeparator = useMemo(() => {
      return (
        new Date(message?.createdAt || 0).toDateString() !==
        new Date(prevMessage?.createdAt || 0).toDateString()
      );
    }, [message?.createdAt, prevMessage?.createdAt]);

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
          {getDateText(message.createdAt)}
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

const SenderInfo = memo(
  ({ senderInfo, isAdmin }: { senderInfo: any; isAdmin: boolean }) => (
    <Avatar
      size={40}
      source={
        isAdmin ? null : (senderInfo?.avatarSource ?? senderInfo?.avatarThumbnailPath ?? senderInfo?.avatarPath)
      }
      name={isAdmin ? "Channel Admin" : senderInfo?.name}
      borderRadius={borderRadius.md}
    />
  )
);

SenderInfo.displayName = "SenderInfo";

// Thread Info Component
const ThreadInfo = memo<ThreadInfoProps>(({ threadInfo }: ThreadInfoProps) => {
  const theme = useTheme();
  const { currentChannel: channel } = useSendbirdContext();
  const navigation = useNavigation<ThreadsNavigationProp>();

  const { companyContacts, personalContacts } = useSelector(
    ({ directoryReducer }: State) => directoryReducer
  );
  const contacts = useMemo(
    () => [...(companyContacts || []), ...(personalContacts || [])],
    [companyContacts, personalContacts]
  );

  const { replyCount, mostRepliedUsers } = threadInfo;

  const getUserInfo = (
    userId: string,
    fallbackNickname: string,
    fallbackProfileUrl?: string
  ) => {
    const c = contacts.find(
      (contact) => contact.userId?.toString() === userId
    );
    const base =
      (c as any)?.avatarThumbnailPath ||
      (c as any)?.avatarPath ||
      fallbackProfileUrl;
    const cacheKey = c
      ? avatarMediaCacheKey(
          (c as any)?.avatarThumbnailPath,
          (c as any)?.avatarPath
        )
      : avatarMediaCacheKey(fallbackProfileUrl, null);
    return {
      name: (c as any)?.name || fallbackNickname,
      avatarPath: base ? appendAvatarCacheBust(base, cacheKey) : undefined
    };
  };

  const navigateToThreads = () => {
    navigation.navigate(Routes.Threads, {
      parentMessage: threadInfo.message,
      channelUrl: channel?.url,
      offset: 10
    });
  };

  if (replyCount == 0) return null;

  return (
    <TouchableOpacity
      style={[
        styles.threadInfoContainer,
        {
          backgroundColor:
            theme.colors["component-colors-components-avatars-avatar-bg"],
          marginRight: padding["3xl"]
        }
      ]}
      onPress={navigateToThreads}
    >
      {/* Avatar Stack */}
      <View style={styles.avatarStack}>
        {mostRepliedUsers.slice(0, 3).map((user) => {
          const userInfo = getUserInfo(
            user.userId,
            user.nickname,
            user.plainProfileUrl
          );

          return (
            <View key={user.userId} style={styles.avatarWrapper}>
              <Avatar
                size={componentSize.xs}
                source={userInfo.avatarPath}
                name={userInfo.name}
                borderRadius={borderRadius.sm}
              />
            </View>
          );
        })}
      </View>

      {/* Reply Text */}
      <Text
        size={fontSize.sm}
        weight="medium"
        color="colors-text-text-brand-primary"
        style={styles.replyText}
      >
        {replyCount} {replyCount === 1 ? "reply" : "replies"}
      </Text>

      {/* View Thread Text */}
      <Text
        size={fontSize.sm}
        weight="medium"
        color="colors-text-text-brand-primary"
      >
        View thread
      </Text>
    </TouchableOpacity>
  );
});
ThreadInfo.displayName = "ThreadInfo";

// Main Component
const MessageComponent: React.FC<MessageProps> = ({
  message,
  prevMessage,
  threadsHeader,
  editor,
  mainChat = false,
  isInThread = false
}) => {
  // In main chat, never show thread replies – hide at the component level (last line of defense)
  if (mainChat) {
    const m = message as {
      parentMessageId?: number;
      parent_message_id?: number;
      parentMessage?: unknown;
      messageId?: number;
    };
    const pid = m.parentMessageId ?? m.parent_message_id;
    const hasParentMsg = !!m.parentMessage;
    const hasParentId = pid != null && pid !== 0 && !Number.isNaN(Number(pid));
    const isReply = hasParentMsg || hasParentId;
    if (isReply) {
      console.warn("[ReplyFilter] Message HIDDEN (mainChat reply):", {
        messageId: m.messageId,
        reason: hasParentMsg ? "parentMessage" : "parentMessageId/parent_message_id",
        parentMessageId: m.parentMessageId,
        parent_message_id: m.parent_message_id
      });
      return <View style={{ height: 0, overflow: "hidden" }} />;
    }
  }

  // Hooks
  const theme = useTheme();
  const { openDrawer } = useDrawer();
  const { editMessage, setEditing } = useRichEditor();
  const { sendbirdInstance, currentChannel } = useSendbirdContext();
  const accessToken = useSelector(
    ({ authReducer }: State) => authReducer.accessToken
  );

  const resolveLatestAttachmentUrl = useCallback(
    async (messageId: number, fileIndex?: number): Promise<string | undefined> => {
      if (!sendbirdInstance || !currentChannel || !messageId) return undefined;
      try {
        const fetchedMessage = await sendbirdInstance.message.getMessage({
          messageId,
          channelUrl: currentChannel.url,
          channelType: currentChannel.channelType,
          includeMetaArray: true,
          includeReactions: true,
          includeThreadInfo: true
        });

        const asAny = fetchedMessage as any;

        if (Array.isArray(asAny?.fileInfoList)) {
          if (
            typeof fileIndex === "number" &&
            fileIndex >= 0 &&
            fileIndex < asAny.fileInfoList.length
          ) {
            const f = asAny.fileInfoList[fileIndex];
            return f?.url || f?.plainUrl || undefined;
          }
          const first = asAny.fileInfoList.find((f: any) => f?.url || f?.plainUrl);
          return first?.url || first?.plainUrl || undefined;
        }

        return asAny?.url || asAny?.plainUrl || undefined;
      } catch {
        return undefined;
      }
    },
    [sendbirdInstance, currentChannel]
  );

  const { companyContacts, personalContacts } = useSelector(
    ({ directoryReducer }: State) => directoryReducer
  );
  const contacts = useMemo(
    () => [...(companyContacts || []), ...(personalContacts || [])],
    [companyContacts, personalContacts]
  );

  const senderInfo = useMemo(() => {
    const c = contacts.find(
      (contact) => contact.userId?.toString() === message.sender?.userId
    );
    const base = c
      ? (c as any)?.avatarThumbnailPath || (c as any)?.avatarPath
      : (message.sender as any)?.plainProfileUrl;
    const name =
      (c as any)?.name ?? (message.sender as any)?.nickname ?? "Unknown";
    const cacheKey = c
      ? avatarMediaCacheKey(
          (c as any)?.avatarThumbnailPath,
          (c as any)?.avatarPath
        )
      : avatarMediaCacheKey((message.sender as any)?.plainProfileUrl, null);
    return {
      ...(c || {}),
      avatarSource: base ? appendAvatarCacheBust(base, cacheKey) : undefined,
      name
    };
  }, [contacts, message.sender?.userId, message.sender]);

  // Calculating if to show the sender info
  const timeDifference =
    (message?.createdAt ?? 0) - (prevMessage?.createdAt ?? 0) > 120000;
  const differentSender =
    message?.sender?.userId !== prevMessage?.sender?.userId;
  const senderUndefined =
    message?.sender?.userId === undefined ||
    prevMessage?.sender?.userId === undefined;

  // Check if date changed (date separator was shown)
  const differentDate =
    new Date(message?.createdAt || 0).toDateString() !==
    new Date(prevMessage?.createdAt || 0).toDateString();

  const shouldShowSenderInfo =
    timeDifference || differentSender || senderUndefined || differentDate;

  // Methods
  const handleMessageLongPress = () => {
    editor?.blur();
    openDrawer(
      <MessageOptionsDrawer
        message={message}
        setEditing={setEditing}
        editor={editor}
        isInThread={isInThread}
      />,
      0.4
    );
  };


  const messageContent = useMemo(() => {
    if (message.customType === "MEETING_INVITE") {
      return <MeetMessage message={message as UserMessage} />;
    }
    if (message.customType === "MESSAGE_GIF") {
      return <GifMessage message={message as UserMessage} />;
    }
    if (message.isUserMessage() || message.isAdminMessage()) {
      return <TextMessage message={message as UserMessage} />;
    }
    if (message.isFileMessage()) {
      return (
        <FileMessage
          message={message as SendbirdFileMessage}
          authToken={accessToken}
          resolveLatestAttachmentUrl={resolveLatestAttachmentUrl}
        />
      );
    }
    if (message.isMultipleFilesMessage()) {
      return (
        <MultipleFileMessage
          message={message as MultipleFilesMessage}
          authToken={accessToken}
          resolveLatestAttachmentUrl={resolveLatestAttachmentUrl}
        />
      );
    }
    return null;
  }, [message, resolveLatestAttachmentUrl, accessToken]);

  const isAdmin = message.messageType === "admin";
  const senderName = isAdmin
    ? "Channel Admin"
    : senderInfo?.name || message.sender?.nickname || "Unknown";

  return (
    <>
      <View
        style={[
          styles.container,
          editMessage?.messageId === message.messageId && {
            backgroundColor:
              theme.colors["colors-background-bg-warning-secondary"],
            borderLeftWidth: borderRadius.md,
            borderLeftColor:
              theme.colors["colors-foreground-fg-warning-secondary"]
          }
        ]}
      >
        {/* Sender Avatar */}
        {shouldShowSenderInfo && (
          <SenderInfo senderInfo={senderInfo} isAdmin={isAdmin} />
        )}

        {/* Message Content */}
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
              <Text>{formatPreciseTime(message.createdAt)}</Text>
            </View>
          )}

          {!message.isAdminMessage() ? (
            <TouchableOpacity
              style={{ flex: 1, width: "100%" }}
              onLongPress={handleMessageLongPress}
            >
              <View>{messageContent}</View>
            </TouchableOpacity>
          ) : (
            <View>{messageContent}</View>
          )}
          {message.updatedAt !== 0 && (
            <Text
              color={"color-colors-text-text-tertiary"}
              size={fontSize.xs}
              weight={"semiBold"}
            >
              {"(edited)"}
            </Text>
          )}
          {/* Message Reactions */}
          <MessageReactions
            message={message}
            reactions={message.reactions || []}
            editor={editor}
          />
          {message.threadInfo && !threadsHeader && (
            <ThreadInfo threadInfo={{ ...message.threadInfo, message }} />
          )}
        </View>
      </View>

      {/* Date Separator - Shows at the top when date changes (renders after for inverted list) */}
      {!threadsHeader && (
        <DateSeparator message={message} prevMessage={prevMessage} />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  // Main Container
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
  senderName: {
    marginBottom: padding.sm,
    display: "flex",
    flexDirection: "row",
    gap: padding.sm,
    alignItems: "center"
  },
  // Date Separator
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

  // Multiple Files
  multipleFileContainer: {
    gap: padding.md,
    flexDirection: "row",
    flexWrap: "wrap"
  },

  // File Components
  fileContainer: {
    minWidth: 150,
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
  fileIconLoader: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center"
  },
  fileDetails: {
    flex: 1,
    alignItems: "flex-start"
  },
  fileName: {
    flex: 1
  },

  // Image Files
  imageFile: {
    borderRadius: borderRadius.md
  },
  singleImageFile: {
    borderRadius: borderRadius.md
  },
  imageSendingWrap: {
    position: "relative",
    alignSelf: "flex-start"
  },
  imageSendingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.md
  },
  multipleFileSendingRoot: {
    position: "relative",
    alignSelf: "flex-start"
  },
  multipleFileSendingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.md
  },

  // GIF Components
  gifContainer: {},
  gifImage: {
    borderRadius: borderRadius.md
  },
  giphyFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: padding.xs
  },
  giphyIcon: {
    width: 15,
    height: 20,
    marginRight: padding.xs
  },

  // Meeting Components
  meetContainer: {
    width: "100%",
    borderWidth: 1,
    borderRadius: borderRadius.md,
    flex: 1,
    overflow: "hidden"
  },
  meetHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: padding.lg,
    borderBottomWidth: 0.5,
    gap: padding.md
  },
  meetDetails: {
    paddingVertical: padding.md,
    paddingHorizontal: padding.lg
  },
  meetDetailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: padding.sm,
    marginBottom: padding.sm
  },
  meetDetailRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    marginLeft: padding.lg + padding.sm,
    marginBottom: padding.xs,
    gap: padding.sm
  },
  meetDetailText: {
    flex: 1
  },
  hashSymbol: {
    minWidth: 15
  },

  // Legacy Styles (for compatibility)
  joinButton: {
    marginTop: padding.sm,
    paddingVertical: padding.sm
  },
  joinButtonText: {
    textAlign: "center"
  },

  // Image modal header
  crossIconImage: {
    color: "white",
    textAlign: "center",
    lineHeight: fontSize["2xl"] + 4
  },
  imageModalHeaderLeftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: padding.md
  },
  imageModalHeaderTapTarget: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center"
  },
  imageModalHeaderIconBox: {
    backgroundColor: "#000000",
    borderRadius: borderRadius.md,
    overflow: "hidden"
  },

  // Thread Info Styles
  threadInfoContainer: {
    flexDirection: "row",
    width: "95%",
    marginRight: padding["3xl"],
    alignItems: "center",
    paddingVertical: padding.xs,
    paddingHorizontal: padding.sm,
    borderRadius: borderRadius.md,
    marginTop: padding.xs,
    gap: padding.sm
  },
  avatarStack: {
    flexDirection: "row",
    alignItems: "center"
  },
  avatarWrapper: {
    position: "relative",
    marginRight: padding.xxs
  },
  replyText: {
    marginRight: padding.xs,
    textDecorationLine: "underline"
  }
});

export const Message = memo(MessageComponent);
