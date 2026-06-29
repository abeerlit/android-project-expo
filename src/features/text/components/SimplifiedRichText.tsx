import React, { useRef } from "react";
import { StyleSheet, View, Platform } from "react-native";
import { RichText, EditorBridge } from "@10play/tentap-editor";
import { Asset } from "react-native-image-picker";

import { useTheme } from "hooks/use-theme.ts";
import { padding, borderRadius, Theme } from "core/theme/theme.ts";
import { TextLowerToolBar } from "./TextLowerToolBar.tsx";

interface SimplifiedRichTextProps {
  editor: EditorBridge;
  handleGifUpload: (gif: {
    title: string;
    url: string;
    height: number;
    width: number;
  }) => Promise<void>;
  handleFile: (files: Asset[]) => Promise<void>;
  sendMessage: (message: string) => void;
  selectedFiles?: Asset[];
  onSelectedFilesChange?: React.Dispatch<React.SetStateAction<Asset[]>>;
}

export const SimplifiedRichText: React.FC<SimplifiedRichTextProps> = ({
  editor,
  handleGifUpload,
  handleFile,
  sendMessage,
  selectedFiles,
  onSelectedFilesChange
}) => {
  const theme = useTheme();
  const tapRef = useRef(null);

  const dynamicStyles = getStyles(theme.colors);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors["color-colors-background-bg-primary"] },
        dynamicStyles.container
      ]}
      ref={tapRef}
    >
      <View style={styles.editorContainer}>
        <RichText
          editor={editor}
          scrollEnabled={Platform.OS === "android"}
          nestedScrollEnabled={Platform.OS === "android"}
        />
      </View>

      <TextLowerToolBar
        editor={editor}
        handleGifUpload={handleGifUpload}
        handleFile={handleFile}
        sendMessage={sendMessage}
        selectedFiles={selectedFiles}
        onSelectedFilesChange={onSelectedFilesChange}
      />
    </View>
  );
};

const getStyles = (colors: Theme["colors"]) => ({
  container: {
    borderColor: colors["colors-border-border-primary"]
  }
});

const styles = StyleSheet.create({
  container: {
    padding: padding.lg,
    marginVertical: padding.sm,
    borderWidth: 0.25,
    borderRadius: borderRadius.xl,
    marginHorizontal: padding.lg
  },
  editorContainer: {
    minHeight: 70,
    maxHeight: 150
  }
});
