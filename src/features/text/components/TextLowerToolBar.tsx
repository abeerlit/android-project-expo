import React, { useEffect, useState } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View
} from "react-native";
import { type EditorBridge } from "@10play/tentap-editor";
import {
  GiphyDialog,
  GiphySDK,
  GiphyThemePreset
} from "@giphy/react-native-sdk";
import {
  Asset,
  ImageLibraryOptions,
  launchImageLibrary
} from "react-native-image-picker";
import Video from "react-native-video";
import { toast } from "@backpackapp-io/react-native-toast";
import { GIPHY_ANDROID_KEY, GIPHY_IOS_KEY } from "@env";

import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";
import { useTheme } from "hooks/use-theme.ts";
import {
  padding,
  borderRadius,
  fontSize,
  componentSize
} from "core/theme/theme.ts";
import { Button } from "shared/components/Button.tsx";
import { Logger } from "shared/utils/Logger.ts";

/** SMS/MMS media upload: server accepts max 3 MiB per file. */
export const MAX_SMS_MMS_BYTES = 3 * 1024 * 1024;

interface TextLowerToolBarProps {
  editor: EditorBridge;
  handleGifUpload: (media: {
    title: string;
    url: string;
    height: number;
    width: number;
  }) => Promise<void>;
  handleFile: (file: Asset[]) => Promise<void>;
  sendMessage: (message: string) => void;
  selectedFiles?: Asset[];
  onSelectedFilesChange?: React.Dispatch<React.SetStateAction<Asset[]>>;
}

export const TextLowerToolBar: React.FC<TextLowerToolBarProps> = ({
  editor,
  handleGifUpload,
  handleFile,
  sendMessage,
  selectedFiles: selectedFilesProp,
  onSelectedFilesChange
}) => {
  const logger = new Logger("TextLowerToolBar: ");
  const theme = useTheme();
  const [loader, setLoader] = useState(false);
  const [internalSelectedFiles, setInternalSelectedFiles] = useState<Asset[]>(
    []
  );
  const isFilesControlled =
    selectedFilesProp !== undefined && onSelectedFilesChange !== undefined;
  const selectedFiles = isFilesControlled
    ? selectedFilesProp!
    : internalSelectedFiles;
  const setSelectedFiles = isFilesControlled
    ? onSelectedFilesChange!
    : setInternalSelectedFiles;
  // Configure Giphy SDK
  useEffect(() => {
    GiphySDK.configure({
      apiKey: Platform.OS === "ios" ? GIPHY_IOS_KEY : GIPHY_ANDROID_KEY
    });
  }, []);

  const uploadFile = () => {
    const options: ImageLibraryOptions = {
      mediaType: "mixed",
      selectionLimit: 0
    };

    launchImageLibrary(options, (response) => {
      if (response.didCancel) {
        logger.debug("cancelled image upload");
      } else if (response.errorMessage) {
        toast.error("Error uploading file");
      } else if (response.assets) {
        if (
          response.assets[0].fileSize &&
          response.assets[0].fileSize > MAX_SMS_MMS_BYTES
        ) {
          toast.error("File should be 3 MB or smaller");
          return;
        }
        if (response.assets) {
          setSelectedFiles((prev) => [...response.assets!, ...prev]);
        }
      }
    }).catch((e) => {
      toast.error("Error uploading file");
      logger.error(e);
    });
  };

  const handleMediaSelect = async (param: {
    media: {
      data: {
        title?: string;
        images?: {
          original?: { height?: number; width?: number; url?: string };
        };
      };
    };
  }) => {
    const gifObject = {
      title: param?.media?.data?.title || "",
      height: param?.media?.data?.images?.original?.height || 0,
      width: param?.media?.data?.images?.original?.width || 0,
      url: param?.media?.data?.images?.original?.url || ""
    };

    // Hide dialog immediately
    GiphyDialog.hide();
    GiphyDialog.removeAllListeners("onMediaSelect");

    // Show loader and upload
    setLoader(true);
    try {
      await handleGifUpload(gifObject);
    } catch (error) {
      logger.error("Error uploading GIF:", error);
      toast.error("Error uploading GIF");
    } finally {
      setLoader(false);
    }
  };

  const removeFile = (fileName: string) => {
    setSelectedFiles((prev) =>
      prev.filter((item) => item?.fileName !== fileName)
    );
  };

  useEffect(() => {
    GiphyDialog.configure({
      mediaTypeConfig: ["gif"],
      theme: theme.dark ? GiphyThemePreset.Dark : GiphyThemePreset.Light
    });
  }, []);

  const [canSend, setCanSend] = useState(false);
  // use interval to check if the content is changed
  useEffect(() => {
    const interval = setInterval(() => {
      const getContent = async () => {
        const content = await editor.getText();
        setCanSend(content?.trim().length > 0);
      };
      getContent();
    }, 500);
    return () => clearInterval(interval);
  }, [editor]);

  useEffect(() => {
    GiphyDialog.addListener("onDismiss", () => {
      logger.debug("Removing media select");
      GiphyDialog.removeAllListeners("onMediaSelect");
    });
    return () => {
      logger.debug("Removing Giphy Listeners - Text Lower ToolBar");
      GiphyDialog.removeAllListeners("onDismiss");
    };
  }, []); // Empty deps - listener setup only needs to run once on mount

  const handleSubmit = async () => {
    setLoader(true);
    try {
      const text = await editor.getText();
      console.log("text....", text);
      const hasText = text && text.trim().length > 0;
      const hasFiles = selectedFiles?.length > 0;

      if (!hasText && !hasFiles) {
        return;
      }

      // If we have files, upload them first
      if (hasFiles) {
        await handleFile(selectedFiles);
        setSelectedFiles([]);
      }

      // If we have text (and no files, or separate from files), send it
      if (hasText && !hasFiles) {
        sendMessage(text);
        editor.setContent("");
      } else if (hasText && hasFiles) {
        // If we have both, clear the editor after file upload
        editor.setContent("");
      } else {
        // Only files, already handled above
        editor.setContent("");
      }
    } catch (error) {
      logger.error("Error in handleSubmit:", error);
      toast.error("Error sending message");
    } finally {
      setLoader(false);
    }
  };

  return (
    <View>
      {selectedFiles?.length > 0 && (
        <View style={styles.filesContainer}>
          {selectedFiles.map((file, index) => (
            <View
              key={file.uri ?? file.fileName ?? String(index)}
              style={styles.filePreviewWrap}
            >
              {file?.type?.startsWith("image/") || !file?.type ? (
                <Image source={{ uri: file?.uri }} style={styles.filePreview} />
              ) : (
                <Video
                  source={{ uri: file?.uri }}
                  style={styles.filePreview}
                  resizeMode="cover"
                  muted={true}
                  repeat={true}
                />
              )}
              {!loader && (
                <Icon
                  onPress={() => removeFile(file?.fileName || "")}
                  name="x-circle"
                  color="white"
                  size={componentSize.sm}
                  style={styles.removeIcon}
                />
              )}
            </View>
          ))}
        </View>
      )}
      <View style={styles.toolbarContainer}>
        <View style={styles.actionButtons}>
          <TouchableOpacity onPress={uploadFile} style={styles.actionButton}>
            <Icon name="file-attachment-01" size={20} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              GiphyDialog.addListener("onMediaSelect", handleMediaSelect);
              GiphyDialog.show();
            }}
            style={styles.actionButton}
          >
            <Text size={fontSize.md} weight={"semiBold"}>
              GIF
            </Text>
          </TouchableOpacity>
        </View>
        <Button
          onPress={handleSubmit}
          size={componentSize.sm}
          weight={"semiBold"}
          disabled={!canSend ? selectedFiles.length === 0 : loader}
        >
          {loader ? "Sending..." : "Send"}
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  filesContainer: {
    flexDirection: "row",
    marginVertical: padding.xs,
    flexWrap: "wrap",
    gap: padding.xs
  },
  filePreviewWrap: {
    width: 70,
    height: 70,
    position: "relative",
    overflow: "hidden",
    borderRadius: borderRadius.md
  },
  filePreview: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.md
  },
  removeIcon: {
    zIndex: 10,
    position: "absolute",
    right: padding.sm,
    top: padding.sm
  },
  toolbarContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  actionButtons: {
    flexDirection: "row"
  },
  actionButton: {
    paddingHorizontal: padding.sm,
    paddingVertical: padding.xs,
    borderRadius: borderRadius.sm,
    marginLeft: padding.xs,
    marginRight: padding.xs / 2
  }
});
