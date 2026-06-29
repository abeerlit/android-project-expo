import { BridgeExtension } from "@10play/tentap-editor";
import { Link } from "@tiptap/extension-link";

declare module "@10play/tentap-editor" {
  interface EditorBridge {
    addLink: (link: string, title: string) => void;
  }
}

export enum LinkActionType {
  AddLink = "add-link"
}

export const LinkBridge = new BridgeExtension({
  tiptapExtension: Link.configure({
    HTMLAttributes: {
      class: "hover:underline cursor-pointer",
      style: "color: #3b82f6; text-decoration: underline;"
    },
    linkOnPaste: true,
    autolink: true,
    openOnClick: false
  }).extend({
    exitable: true,
    addAttributes() {
      return {
        ...this.parent?.(),
        addedLink: {
          default: false
        }
      };
    }
  }),
  onBridgeMessage: (editor, { type, payload }) => {
    if (type === LinkActionType.AddLink) {
      // cancelled
      if (payload === null) {
        return false;
      }
      const { link, title } = payload;
      // empty
      if (payload.link === "") {
        editor
          .chain()
          .focus()
          .extendMarkRange("link")
          .unsetLink()
          .setTextSelection(editor.state.selection.from)
          .run();

        return false;
      }

      // update link
      editor
        .chain()
        .focus()
        .deleteSelection()
        .setMark("link", {
          href: `https://${link}`,
          addedLink: true
        })
        .insertContent(title)
        .unsetMark("link")
        .run();
    }

    return false;
  },
  extendEditorInstance: (sendBridgeMessage) => {
    return {
      addLink: (link: string, title: string) => {
        sendBridgeMessage({
          type: LinkActionType.AddLink,
          payload: { link, title }
        });
      }
    };
  },
  extendEditorState: (editor) => {
    return {
      canSetLink: !editor.state.selection.empty,
      isLinkActive: editor.isActive("link"),
      activeLink: editor.getAttributes("link").href
    };
  }
});
