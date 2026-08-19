// @ts-ignore sendMessage is exported, it just says its not
import { BridgeExtension, sendMessage } from "@10play/tentap-editor";
import { Mention } from "@tiptap/extension-mention";

declare module "@10play/tentap-editor" {
  interface EditorBridge {
    insertMention: (item: any) => void;
    insertMentionChar: () => void;
    mentionQuery: (message: { query: string; type: string }) => void;
    exitMention: () => void;
  }
}

export enum MentionActionType {
  MentionQuery = "mention-query",
  MentionUpdateQuery = "mention-update-query",
  ExitMention = "exit-mention",
  InsertMention = "insert-mention",
  InsertMentionChar = "insert-mention-char"
}

export const MentionBridge = new BridgeExtension({
  tiptapExtension: Mention.configure({
    HTMLAttributes: {
      class:
        "bg-component-colors-utility-brand-utility-brand-50 hover:bg-component-colors-utility-brand-utility-brand-100 transition duration-100 border border-component-colors-utility-brand-utility-brand-200 text-component-colors-utility-brand-utility-brand-700 rounded-md p-0.5 cursor-pointer",
      style:
        "background-color: #e6f0ff; color: #0066cc; padding: 2px 5px; border-radius: 4px;"
    },
    renderText({ options, node }) {
      return `${options.suggestion.char}${node.attrs.label ?? node.attrs.id}`;
    },
    deleteTriggerWithBackspace: true,
    suggestion: {
      char: "@",
      allowedPrefixes: [" "],
      allowSpaces: false,
      items: ({ query }) => {
        // Instead of filtering items here, send the query to React Native
        sendMessage({ type: MentionActionType.MentionQuery, payload: query });

        // Return an empty array because the filtering happens on RN side
        return [];
      },
      render: () => {
        // Don't render anything here, since RN handles rendering
        return {
          onStart: () => {},
          onUpdate: (_) => {},
          onKeyDown: () => false,
          onExit: () => {
            sendMessage({ type: MentionActionType.ExitMention });
          }
        };
      }
    }
  }),
  onBridgeMessage: (editor, message) => {
    const { type, payload } = message;
    if (type === MentionActionType.InsertMentionChar) {
      editor.chain().focus().insertContent("@").run();
      return true;
    } else if (type === MentionActionType.InsertMention) {
      const state = editor.view.state;
      const { selection } = state;
      const textBefore = state.doc.textBetween(
        Math.max(0, selection.from - 10),
        selection.from,
        "\n",
        ""
      ); // Look back up to 10 chars

      const atIndex = textBefore.lastIndexOf("@"); // Find the last "@"
      const from =
        atIndex !== -1
          ? selection.from - (textBefore.length - atIndex)
          : selection.from - 1;
      const to = selection.to; // Keep the end position

      editor
        .chain()
        .focus()
        .insertContentAt(
          { from, to }, // Ensure the correct range is replaced
          [
            {
              type: "mention",
              attrs: {
                id: payload.userId,
                label: payload.name,
                avatar: payload.avatarPath
              }
            },
            {
              type: "text",
              text: " " // Adding a space after the mention
            }
          ]
        )
        .run();

      // @ts-ignore This can be ignored as widow will exist on the web side
      window.getSelection()?.collapseToEnd();
      return true;
    }
    return false;
  },
  extendEditorInstance: (sendBridgeMessage) => {
    return {
      mentionQuery: (_: any) => {},
      insertMention: (item: any) => {
        sendBridgeMessage({
          type: MentionActionType.InsertMention,
          payload: item
        });
      },
      updateMention: (_: any) => {},
      insertMentionChar: () => {
        sendBridgeMessage({ type: MentionActionType.InsertMentionChar });
      },
      exitMention: () => {}
    };
  }
});
