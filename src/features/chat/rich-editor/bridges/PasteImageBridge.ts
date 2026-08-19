// @ts-ignore sendMessage is exported, it just says its not
import { BridgeExtension, sendMessage } from "@10play/tentap-editor";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { PastedImagePayload } from "features/chat/rich-editor/bridges/paste-image-attachment.ts";

/** Must match on RN bridgeExtensions so window.bridgeExtensionConfigMap includes this key. */
export const PASTE_IMAGE_BRIDGE_NAME = "pasteImageAttachment";

export enum PasteImageActionType {
  PasteImage = "paste-image"
}

const log = (step: string, detail?: Record<string, unknown>) => {
  const msg = `[PasteImageBridge] ${step}${detail ? ` ${JSON.stringify(detail)}` : ""}`;
  if (typeof console !== "undefined") {
    console.warn(msg);
  }
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

type ClipboardPasteEvent = {
  preventDefault: () => void;
  clipboardData: {
    getData: (type: string) => string;
    items: {
      length: number;
      [index: number]: {
        type: string;
        getAsFile: () => File | null;
      };
    };
  } | null;
};

const extractImageFromHtml = (html: string): PastedImagePayload | null => {
  const srcMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (!srcMatch?.[1]) return null;
  const src = srcMatch[1];
  if (!src.startsWith("data:image/")) return null;
  const mimeMatch = src.match(/^data:(image\/[^;]+);/i);
  return {
    dataUrl: src,
    mimeType: mimeMatch?.[1] || "image/jpeg",
    fileName: `pasted-image-${Date.now()}.jpg`
  };
};

const sendPastePayload = (payload: PastedImagePayload, source: string) => {
  log("sendMessage", {
    source,
    mimeType: payload.mimeType,
    fileName: payload.fileName,
    dataUrlLength: payload.dataUrl?.length ?? 0
  });
  sendMessage({
    type: PasteImageActionType.PasteImage,
    payload
  });
};

const pasteImagePlugin = new Plugin({
  key: new PluginKey(PASTE_IMAGE_BRIDGE_NAME),
  props: {
    handlePaste(_view, event) {
      const pasteEvent = event as unknown as ClipboardPasteEvent;
      const clipboardData = pasteEvent.clipboardData;

      if (!clipboardData) {
        log("handlePaste: no clipboardData");
        return false;
      }

      const itemTypes: string[] = [];
      for (let i = 0; i < clipboardData.items.length; i++) {
        itemTypes.push(clipboardData.items[i].type);
      }

      log("handlePaste: clipboard items", {
        itemCount: clipboardData.items.length,
        itemTypes,
        hasHtml: !!clipboardData.getData("text/html"),
        hasText: !!clipboardData.getData("text/plain")
      });

      const imageItems: Array<{
        type: string;
        getAsFile: () => File | null;
      }> = [];
      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i];
        if (item.type.startsWith("image/")) {
          imageItems.push(item);
        }
      }

      if (imageItems.length > 0) {
        pasteEvent.preventDefault();
        log("handlePaste: intercepted image/* items", {
          count: imageItems.length
        });

        void (async () => {
          for (const item of imageItems) {
            const file = item.getAsFile();
            if (!file) {
              log("handlePaste: getAsFile returned null", { type: item.type });
              continue;
            }
            try {
              const dataUrl = await readFileAsDataUrl(file);
              sendPastePayload(
                {
                  dataUrl,
                  mimeType: file.type || item.type || "image/jpeg",
                  fileName: file.name || `pasted-image-${Date.now()}.jpg`,
                  fileSize: file.size
                },
                "clipboard-file"
              );
            } catch (err) {
              log("handlePaste: read file failed", {
                error: String(err)
              });
            }
          }
        })();

        return true;
      }

      const html = clipboardData.getData("text/html");
      if (html) {
        const fromHtml = extractImageFromHtml(html);
        if (fromHtml) {
          pasteEvent.preventDefault();
          log("handlePaste: intercepted img in text/html");
          sendPastePayload(fromHtml, "text/html");
          return true;
        }
      }

      const plain = clipboardData.getData("text/plain");
      if (plain?.startsWith("data:image/")) {
        pasteEvent.preventDefault();
        log("handlePaste: intercepted data URL in text/plain");
        const mimeMatch = plain.match(/^data:(image\/[^;]+);/i);
        sendPastePayload(
          {
            dataUrl: plain,
            mimeType: mimeMatch?.[1] || "image/jpeg",
            fileName: `pasted-image-${Date.now()}.jpg`
          },
          "text/plain"
        );
        return true;
      }

      log("handlePaste: not an image paste, allowing default");
      return false;
    }
  }
});

/** Web bundle: intercept image paste and notify React Native (no inline <img>). */
export const PasteImageBridge = new BridgeExtension({
  forceName: PASTE_IMAGE_BRIDGE_NAME,
  tiptapExtension: Extension.create({
    name: PASTE_IMAGE_BRIDGE_NAME,
    priority: 1000,
    addProseMirrorPlugins() {
      log("addProseMirrorPlugins: paste handler registered");
      return [pasteImagePlugin];
    }
  }),
  onBridgeMessage: () => false,
  extendEditorInstance: () => ({}),
  extendEditorState: () => ({})
});

/** Native: receive paste-image from WebView and add attachment pill. */
export const createPasteImageBridge = (
  onPasteImage: (payload: PastedImagePayload) => void
) =>
  new BridgeExtension({
    forceName: PASTE_IMAGE_BRIDGE_NAME,
    tiptapExtension: Extension.create({
      name: PASTE_IMAGE_BRIDGE_NAME
    }),
    onEditorMessage: (message) => {
      if (
        __DEV__ &&
        message.type === PasteImageActionType.PasteImage
      ) {
        log("onEditorMessage (RN)", {
          type: message.type,
          hasPayload: !!message.payload
        });
      }
      if (
        message.type === PasteImageActionType.PasteImage &&
        message.payload
      ) {
        onPasteImage(message.payload as PastedImagePayload);
        return true;
      }
      return false;
    },
    extendEditorInstance: () => ({}),
    extendEditorState: () => ({})
  });
