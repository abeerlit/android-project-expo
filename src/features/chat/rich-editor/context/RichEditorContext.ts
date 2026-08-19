// app/contexts/RichEditorContext.ts
import { createContext, useContext } from "react";
import { BaseMessage } from "@sendbird/chat/message";
import {
  EditorMention,
  Metadata,
  ThumbnailObject
} from "features/chat/rich-editor/types.ts";

export interface RichEditorState {
  editor: null;
  expanded: boolean;
  isEditing: boolean;
  editMessage: BaseMessage | null;
  mentionSuggestion: boolean;
  mentionQuery: string;
  mentions: EditorMention[];
  files: File[];
  thumbnails: ThumbnailObject[];
  suggestionsOpen: boolean;
  previews: Metadata[];
  links: string[];
  gifs: any[];
}

interface RichEditorContextData extends RichEditorState {
  setEditor: (editor: any) => void;
  setExpanded: (expanded: boolean) => void;
  setItem: <K extends keyof RichEditorState>(
    name: K,
    payload: RichEditorState[K]
  ) => void;
  setEditing: (message: BaseMessage | null) => void;
  replaceMentions: (mentions: EditorMention[]) => void;
  clearEditing: () => void;
  toggleMentionSuggestion: (open: boolean) => void;
  setMentionQuery: (query: string) => void;
  addMention: (mention: EditorMention) => void;
  removeMention: (mention: string) => void;
  clearMentions: () => void;
  clearPreviews: () => void;
  addFiles: (files: File[], thumbnails: ThumbnailObject[]) => void;
  removeFile: (index: number) => void;
  clearFiles: () => void;
  clearMessageState: () => void;
}

export const RichEditorContext = createContext<RichEditorContextData>({
  editor: null,
  expanded: false,
  isEditing: false,
  editMessage: null,
  mentionSuggestion: false,
  mentionQuery: "",
  mentions: [],
  files: [],
  thumbnails: [],
  suggestionsOpen: false,
  previews: [],
  links: [],
  gifs: [],
  setEditor: () => {},
  setExpanded: () => {},
  setItem: () => {},
  setEditing: () => {},
  replaceMentions: () => {},
  clearEditing: () => {},
  toggleMentionSuggestion: () => {},
  setMentionQuery: () => {},
  addMention: () => {},
  removeMention: () => {},
  clearMentions: () => {},
  clearPreviews: () => {},
  addFiles: () => {},
  removeFile: () => {},
  clearFiles: () => {},
  clearMessageState: () => {}
});

export function useRichEditor() {
  return useContext(RichEditorContext);
}

export type RichEditorContextType = React.ContextType<typeof RichEditorContext>;
