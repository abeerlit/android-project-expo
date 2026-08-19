import React from "react";
import { EditorContent } from "@tiptap/react";
import {
  BlockquoteBridge,
  BoldBridge,
  BulletListBridge,
  CodeBridge,
  CoreBridge,
  HistoryBridge,
  ImageBridge,
  ItalicBridge,
  OrderedListBridge,
  PlaceholderBridge,
  StrikeBridge,
  // @ts-ignore it exports useTenTap but not sure why it's not in the type
  useTenTap
} from "@10play/tentap-editor";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { MentionBridge } from "../rich-editor/mentions/MentionBridge";
import { LinkBridge } from "../rich-editor/bridges/LinkBridge";
import { PasteImageBridge } from "../rich-editor/bridges/PasteImageBridge.ts";

/**
 * Here we control the web side of our custom editor
 */
export const AdvancedEditor = () => {
  const editor = useTenTap({
    bridges: [
      CoreBridge,
      PasteImageBridge,
      ImageBridge,
      HistoryBridge,
      BoldBridge,
      ItalicBridge,
      StrikeBridge,
      LinkBridge,
      CodeBridge,
      BlockquoteBridge,
      OrderedListBridge,
      BulletListBridge,
      PlaceholderBridge,
      MentionBridge
    ],
    tiptapOptions: {
      extensions: [Document, Paragraph, Text]
    }
  });
  return <EditorContent editor={editor} />;
};
