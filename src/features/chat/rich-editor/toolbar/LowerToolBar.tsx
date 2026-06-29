import React, { useEffect, useState } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View
} from "react-native";
import { type EditorBridge, useEditorContent } from "@10play/tentap-editor";
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
import { useRichEditor } from "features/chat/rich-editor/context/RichEditorContext.ts";
import { useTheme } from "hooks/use-theme.ts";
import {
  padding,
  borderRadius,
  fontSize,
  componentSize
} from "core/theme/theme.ts";
import { Button } from "shared/components/Button.tsx";
import { Logger } from "shared/utils/Logger.ts";

interface LowerToolBarProps {
  editor: EditorBridge;
  toggleToolbar: () => void;
  handleGifUpload: (media: {
    title: string;
    url: string;
    height: number;
    width: number;
  }) => void;
  handleFile: (file: Asset[]) => void;
  sendMessage: ({
    message,
    mentionedUsers
  }: {
    message: string;
    mentionedUsers: string[];
  }) => void;
  /** When set, attachment pills are controlled by the parent (e.g. paste-from-clipboard). */
  selectedFiles?: Asset[];
  onSelectedFilesChange?: React.Dispatch<React.SetStateAction<Asset[]>>;
}

export const LowerToolBar: React.FC<LowerToolBarProps> = ({
  editor,
  toggleToolbar,
  handleGifUpload,
  handleFile,
  sendMessage,
  selectedFiles: selectedFilesProp,
  onSelectedFilesChange
}) => {
  const logger = new Logger("LowerToolBar: ");

  const theme = useTheme();
  const { mentions } = useRichEditor();

  const [loader, setLoader] = useState(false);
  const [internalSelectedFiles, setInternalSelectedFiles] = useState<Asset[]>(
    []
  );
  const selectedFiles = selectedFilesProp ?? internalSelectedFiles;
  const setSelectedFiles = onSelectedFilesChange ?? setInternalSelectedFiles;
  const { isEditing, setEditing } = useRichEditor();

  const content = useEditorContent(editor, { type: "text" });

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
        const maxFileSize = 20 * 1024 * 1024;
        if (
          response.assets[0].fileSize &&
          response.assets[0].fileSize > maxFileSize
        ) {
          toast.error("File should be less than 20 MB");
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

  const handleMediaSelect = (param: {
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
    handleGifUpload(gifObject);
    GiphyDialog.hide();
    GiphyDialog.removeAllListeners("onMediaSelect");
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

  useEffect(() => {
    GiphyDialog.addListener("onDismiss", () => {
      GiphyDialog.removeAllListeners("onMediaSelect");
    });
    return () => {
      GiphyDialog.removeAllListeners("onDismiss");
    };
  }, []);

  const handleSubmit = async () => {
    setLoader(true);
    try {
      if (selectedFiles?.length) {
        handleFile(selectedFiles);
      }
      setSelectedFiles([]);

      const content = await editor.getHTML();
      const text = await editor.getText();

      if (!text) return;

      if (content) {
        sendMessage({
          message: content,
          mentionedUsers: mentions.map((i) => i.userId)
        });
      }
      editor.setContent("");
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
          <TouchableOpacity
            onPress={() => editor.insertMentionChar()}
            style={styles.actionButton}
          >
            <Icon name="at-sign" size={20} />
          </TouchableOpacity>

          <TouchableOpacity onPress={toggleToolbar} style={styles.actionButton}>
            <Icon name="type-square" size={20} />
          </TouchableOpacity>

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
        <View style={styles.submitButtons}>
          {isEditing && Platform.OS !== "android" && (
            <Button
              onPress={() => setEditing(null)}
              type={"outline"}
              size={componentSize.sm}
              weight={"semiBold"}
              style={styles.compactButton}
            >
              Cancel
            </Button>
          )}
          <Button
            onPress={handleSubmit}
            size={componentSize.sm}
            weight={"semiBold"}
            disabled={!content?.length && !selectedFiles.length}
            style={styles.compactButton}
          >
            {loader ? "Sending..." : "Send"}
          </Button>
        </View>
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
    flexDirection: "row",
    flex: 1,
    flexShrink: 1
  },
  submitButtons: {
    flexDirection: "row",
    flexShrink: 0,
    gap: padding.sm
  },
  compactButton: {
    paddingHorizontal: padding.lg,
    paddingVertical: padding.md
  },
  actionButton: {
    paddingHorizontal: padding.sm,
    paddingVertical: padding.xs,
    borderRadius: borderRadius.sm,
    marginLeft: padding.xs,
    marginRight: padding.xs / 2
  },
  sendButton: {
    paddingHorizontal: padding.md,
    paddingVertical: padding.md,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center"
  }
});
