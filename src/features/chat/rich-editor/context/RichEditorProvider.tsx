import React, { useState } from "react";
import { BaseMessage } from "@sendbird/chat/message";
import { RichEditorContext } from "features/chat/rich-editor/context/RichEditorContext.ts";
import {
  EditorMention,
  Metadata,
  ThumbnailObject
} from "features/chat/rich-editor/types.ts";

export const RichEditorProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  // =========== State Management ===========
  // Editor States
  const [editor, setEditor] = useState<any>(null);
  const [expanded, setExpanded] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editMessage, setEditMessage] = useState<BaseMessage | null>(null);

  // Mention States
  const [mentionSuggestion, setMentionSuggestion] = useState<boolean>(false);
  const [mentionQuery, setMentionQuery] = useState<string>("");
  const [mentions, setMentions] = useState<EditorMention[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState<boolean>(false);

  // File States
  const [files, setFiles] = useState<File[]>([]);
  const [thumbnails, setThumbnails] = useState<ThumbnailObject[]>([]);

  // Content States
  const [previews, setPreviews] = useState<Metadata[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [gifs, setGifs] = useState<any[]>([]);

  // =========== Utility Functions ===========
  const setItem = <K extends keyof typeof stateSetters>(
    name: K,
    payload: any
  ) => {
    const stateSetters = {
      editor: setEditor,
      isEditing: setIsEditing,
      editMessage: setEditMessage,
      mentionSuggestion: setMentionSuggestion,
      mentionQuery: setMentionQuery,
      mentions: setMentions,
      files: setFiles,
      thumbnails: setThumbnails,
      suggestionsOpen: setSuggestionsOpen,
      previews: setPreviews,
      links: setLinks,
      gifs: setGifs
    };

    stateSetters[name]?.(payload);
  };

  // =========== Edit Management ===========
  const setEditing = (message: BaseMessage | null) => {
    setIsEditing(!!message);
    setEditMessage(message);
  };

  const clearEditing = () => {
    setIsEditing(false);
    setEditMessage(null);
  };

  // =========== Mention Management ===========
  const toggleMentionSuggestion = (open: boolean) => {
    setMentionSuggestion(open);
  };

  const updateMentionQuery = (query: string) => {
    setMentionQuery(query);
  };

  const addMention = (mention: EditorMention) => {
    setMentions((prev) => [...prev, mention]);
  };

  const removeMention = (mentionUserId: string) => {
    setMentions((prev) => prev.filter((m) => m.userId !== mentionUserId));
  };

  const replaceMentions = (newMentions: EditorMention[]) => {
    setMentions(newMentions);
  };

  const clearMentions = () => {
    setMentions([]);
  };

  // =========== Content Management ===========
  const clearPreviews = () => {
    setPreviews([]);
  };

  // =========== File Management ===========
  const addFiles = (newFiles: File[], newThumbnails: ThumbnailObject[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
    setThumbnails((prev) => [...prev, ...newThumbnails]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setThumbnails((prev) => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setFiles([]);
    setThumbnails([]);
  };

  // =========== Reset Functions ===========
  const clearMessageState = () => {
    setEditor(null);
    setIsEditing(false);
    setEditMessage(null);
    setMentionSuggestion(false);
    setMentionQuery("");
    setMentions([]);
    setFiles([]);
    setThumbnails([]);
    setSuggestionsOpen(false);
    setPreviews([]);
    setLinks([]);
    setGifs([]);
  };

  // =========== Context Provider ===========
  return (
    <RichEditorContext.Provider
      value={{
        editor,
        expanded,
        isEditing,
        editMessage,
        mentionSuggestion,
        mentionQuery,
        mentions,
        files,
        thumbnails,
        suggestionsOpen,
        previews,
        links,
        gifs,
        setEditor,
        setExpanded,
        setItem,
        setEditing,
        clearEditing,
        toggleMentionSuggestion,
        setMentionQuery: updateMentionQuery,
        addMention,
        removeMention,
        replaceMentions,
        clearMentions,
        clearPreviews,
        addFiles,
        removeFile,
        clearFiles,
        clearMessageState
      }}
    >
      {children}
    </RichEditorContext.Provider>
  );
};
