import React, { useMemo, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useBridgeState } from "@10play/tentap-editor";
import { useSelector } from "react-redux";

import { State } from "store/types.ts";
import { useRichEditor } from "features/chat/rich-editor/context/RichEditorContext.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { padding } from "core/theme/theme.ts";
import { useTheme } from "hooks/use-theme.ts";
import Icon from "shared/components/Icon.tsx";

// Components
import { ToolbarButton } from "./ToolbarButton.tsx";
import { LinkDialog } from "./LinkDialog.tsx";
import { MentionSuggestions } from "./MentionSuggestions.tsx";

// Types
import { CustomToolbarProps, LinkDialogState } from "../types.ts";

// Utils
import { buildMentionList } from "../utils/mentionUtils.ts";

export const CustomToolbar: React.FC<CustomToolbarProps> = ({ editor }) => {
  const theme = useTheme();
  const editorState = useBridgeState(editor);
  const {
    expanded,
    mentionQuery,
    mentionSuggestion,
    mentions,
    setExpanded,
    toggleMentionSuggestion,
    setMentionQuery
  } = useRichEditor();
  const { user } = useSelector(({ userReducer }: State) => userReducer);
  const directoryReducer = useSelector(
    ({ directoryReducer }: State) => directoryReducer
  );
  const { currentChannel } = useSendbirdContext();

  const [linkDialog, setLinkDialog] = useState<LinkDialogState>({
    visible: false,
    link: "",
    title: ""
  });

  const handleLinkSave = (link: string, title: string) => {
    editor.addLink(link, title);
  };

  const mentionList = useMemo(() => {
    return buildMentionList(
      mentionQuery,
      mentions,
      user,
      currentChannel,
      directoryReducer
    );
  }, [mentionQuery, mentions, user, currentChannel, directoryReducer]);

  const handleToolbarAction = (action: () => void) => {
    try {
      action();
    } catch (e) {
      console.log("Toolbar action error:", e);
    }
  };

  const handleMentionPress = (item: any) => {
    editor.insertMention(item);
    // Android WebView often omits exit-mention; clear RN mention UI so the formatting
    // row is not covered / icons stay visible (matches SendbirdChatContent handleExitMention).
    toggleMentionSuggestion(false);
    setMentionQuery("");
  };

  return (
    <View>
      <LinkDialog
        state={linkDialog}
        onStateChange={setLinkDialog}
        onSave={handleLinkSave}
      />

      <View style={styles.toolbarContainer}>
        <View style={styles.formattingButtons}>
          <ToolbarButton
            onPress={() => handleToolbarAction(() => editor.toggleBold())}
            isActive={editorState.isBoldActive}
            iconName="bold"
          />
          <ToolbarButton
            onPress={() => handleToolbarAction(() => editor.toggleItalic())}
            isActive={editorState.isItalicActive}
            iconName="italic"
          />
          <ToolbarButton
            onPress={() => handleToolbarAction(() => editor.toggleStrike())}
            isActive={editorState.isStrikeActive}
            iconName="strikethrough-01"
          />
          <ToolbarButton
            onPress={() => handleToolbarAction(() => editor.toggleBlockquote())}
            isActive={editorState.isBlockquoteActive}
            iconName="quote"
          />
          <ToolbarButton
            onPress={() => setLinkDialog({ ...linkDialog, visible: true })}
            iconName="link"
          />
          <ToolbarButton
            onPress={() => handleToolbarAction(() => editor.toggleBulletList())}
            isActive={editorState.isBulletListActive}
            iconName="bullet-list"
          />
          <ToolbarButton
            onPress={() =>
              handleToolbarAction(() => editor.toggleOrderedList())
            }
            isActive={editorState.isOrderedListActive}
            iconName="ordered-list"
          />
        </View>

        <TouchableOpacity
          onPress={() => {
            setExpanded(!expanded);
          }}
          style={styles.expandButton}
        >
          <Icon
            size={12}
            name={expanded ? "minimize-01" : "maximize-01"}
            color={theme.colors["color-colors-text-text-primary"]}
          />
        </TouchableOpacity>
      </View>

      {mentionSuggestion && (
        <MentionSuggestions
          mentionList={mentionList}
          onMentionPress={handleMentionPress}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  toolbarContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: padding.lg,
    marginBottom: padding.xs
  },
  formattingButtons: {
    flexDirection: "row"
  },
  expandButton: {
    width: 32,
    height: 32,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end"
  }
});
