import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View, Platform, Pressable } from "react-native";
import {
  RichText,
  useEditorContent,
  EditorBridge
} from "@10play/tentap-editor";
import { Asset } from "react-native-image-picker";

import { useTheme } from "hooks/use-theme.ts";
import { padding, borderRadius, Theme } from "core/theme/theme.ts";
import { useRichEditor } from "features/chat/rich-editor/context/RichEditorContext.ts";
import { CustomToolbar } from "features/chat/rich-editor/toolbar/CustomToolbar.tsx";
import { LowerToolBar } from "features/chat/rich-editor/toolbar/LowerToolBar.tsx";

interface AdvancedRichTextProps {
  editor: EditorBridge;
  handleGifUpload: (gif: {
    title: string;
    url: string;
    height: number;
    width: number;
  }) => void;
  handleFile: (files: Asset[]) => void;
  sendMessage: (params: { message: string; mentionedUsers: string[] }) => void;
  selectedFiles?: Asset[];
  onSelectedFilesChange?: React.Dispatch<React.SetStateAction<Asset[]>>;
}

export const AdvancedRichText: React.FC<AdvancedRichTextProps> = ({
  editor,
  handleGifUpload,
  handleFile,
  sendMessage,
  selectedFiles,
  onSelectedFilesChange
}) => {
  const theme = useTheme();
  const tapRef = useRef(null);
  const content = useEditorContent(editor, { type: "json" });

  const [toggleToolbar, setToggleToolbar] = useState(false);

  const { replaceMentions, expanded, editMessage } = useRichEditor();

  // Track previous mentions to prevent unnecessary updates
  const previousMentionsRef = useRef<string>("");

  // Define types for the JSON content
  interface EditorNode {
    type: string;
    attrs?: {
      id?: string;
      label?: string;
      [key: string]: any;
    };
    content?: EditorNode[];

    [key: string]: any;
  }

  const extractMentions = useCallback((json: EditorNode) => {
    const mentions: { userId: string; label: string }[] = [];

    function traverse(node: EditorNode) {
      if (!node) return;

      // If the node is a mention, extract its attributes
      if (node.type === "mention" && node.attrs) {
        mentions.push({
          userId: node.attrs.id || "",
          label: node.attrs.label || ""
        });
      }

      // If the node has children (content), recursively traverse them
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach(traverse);
      }
    }

    traverse(json); // Start traversing from the root
    return mentions;
  }, []);

  // Extract mentions from content and update context
  useEffect(() => {
    if (content) {
      const mentions = extractMentions(content as EditorNode);
      const mentionsString = JSON.stringify(mentions);

      // Only call replaceMentions if mentions actually changed
      if (mentionsString !== previousMentionsRef.current) {
        previousMentionsRef.current = mentionsString;
        replaceMentions(mentions);
      }
    }
  }, [content, extractMentions, replaceMentions]);

  // Set content when editing a message; clear when exiting edit mode (after send or cancel)
  const prevEditMessageRef = useRef(editMessage);
  useEffect(() => {
    if (editMessage) {
      // @ts-ignore - Editor type issue with setContent
      editor.setContent(editMessage.message);
    } else if (prevEditMessageRef.current) {
      // Just exited edit mode - clear the input bar
      // @ts-ignore - Editor type issue with setContent
      editor.setContent("");
    }
    prevEditMessageRef.current = editMessage;
  }, [editMessage, editor]);

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
      {!toggleToolbar && <CustomToolbar editor={editor} />}

      <Pressable
        style={[
          styles.editorContainer,
          Platform.OS === "android" && styles.editorContainerAndroid,
          {
            minHeight: expanded ? 230 : Platform.OS === "android" ? 78 : 55,
            maxHeight: expanded ? 230 : 150
          }
        ]}
        onPress={() => {
          editor.focus();
        }}
      >
        <RichText editor={editor} scrollEnabled={Platform.OS === "android"} nestedScrollEnabled={Platform.OS === "android"} />
      </Pressable>

      <LowerToolBar
        editor={editor}
        toggleToolbar={() => setToggleToolbar(!toggleToolbar)}
        handleGifUpload={handleGifUpload}
        handleFile={handleFile}
        sendMessage={sendMessage}
        selectedFiles={selectedFiles}
        onSelectedFilesChange={onSelectedFilesChange}
      />
    </View>
  );
};

// Alias for backwards compatibility
export const Editor = AdvancedRichText;

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
    marginLeft: padding.lg
  },
  editorContainerAndroid: {
    paddingTop: padding.sm,
    marginTop: padding.xs
  }
});
