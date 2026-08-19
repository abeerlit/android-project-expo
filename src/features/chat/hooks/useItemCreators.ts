// Hook to create standardized item creators
import { useCallback } from "react";
import { useSelector } from "react-redux";
import {
  formatPhoneNumber,
  stripPhoneNumber
} from "shared/utils/formatters.ts";
import { NewMessageItem, ItemCreators } from "./types.ts";
import { State } from "store/types.ts";

export const useItemCreators = (): ItemCreators => {
  const { user } = useSelector((state: State) => state.userReducer);
  const createUserItem = useCallback(
    (contact: any): NewMessageItem => ({
      name: contact.name,
      avatarPath: contact.avatarThumbnailPath || undefined,
      userId: contact.userId?.toString(),
      type: "user"
    }),
    []
  );

  const createChannelItem = useCallback(
    (channel: any): NewMessageItem => ({
      name: channel.name,
      channelUrl: channel.url,
      type: "channel",
      public: channel.isPublic
    }),
    []
  );

  const createDMItem = useCallback(
    (dm: any): NewMessageItem => {
      // Get avatar - check if it's a valid non-empty string.
      let avatarPath =
        dm.avatar && typeof dm.avatar === "string" && dm.avatar.trim() !== ""
          ? dm.avatar
          : null;

      // For personal channels, use user's avatar.
      if (!avatarPath && dm.personal) {
        avatarPath = user?.avatarPath;
      }

      // Check if this is DM where user is the only member (personal channel not marked as such).
      if (
        !avatarPath &&
        dm.memberUserIds?.length === 1 &&
        dm.memberUserIds[0] === user?.id?.toString()
      ) {
        avatarPath = user?.avatarPath;
      }

      // Check if DM has no other members (only self) - memberUserIds might be empty if others filtered out.
      if (!avatarPath && (!dm.memberUserIds || dm.memberUserIds.length === 0)) {
        avatarPath = user?.avatarPath;
      }

      // If name matches user's name, it's a personal channel.
      if (!avatarPath && dm.name === user?.extName) {
        avatarPath = user?.avatarPath;
      }

      // Last resort: if name contains user's name and no avatar, use user's avatar.
      if (!avatarPath && user?.extName && dm.name?.includes(user.extName)) {
        avatarPath = user?.avatarPath;
      }

      return {
        name: dm.name,
        avatarPath: avatarPath || undefined,
        channelUrl: dm.url,
        type: "dm"
      };
    },
    [user?.avatarPath, user?.id, user?.extName]
  );

  const createPhoneItem = useCallback(
    (phoneNumber: string): NewMessageItem => ({
      name: formatPhoneNumber(phoneNumber),
      phoneNumber: stripPhoneNumber(phoneNumber),
      type: "phone"
    }),
    []
  );

  const createPersonalContactItem = useCallback(
    (contact: any): NewMessageItem => ({
      name: contact.name,
      avatarPath:
        contact.avatarThumbnailPath || contact.avatarPath || undefined,
      phoneNumber: stripPhoneNumber(contact.number),
      type: "personal"
    }),
    []
  );

  const createPhoneContactItem = useCallback(
    (contact: any, phoneNumber: string): NewMessageItem => ({
      name: contact.displayName,
      avatarPath: contact.thumbnailPath || undefined,
      phoneNumber: stripPhoneNumber(phoneNumber),
      recordID: contact.recordID,
      type: "phone-contact"
    }),
    []
  );

  const createConversationItem = useCallback(
    (conversation: any): NewMessageItem => ({
      name: conversation.name || conversation.conversationName || "Unknown",
      conversationId: conversation.id,
      type: "conversation"
    }),
    []
  );

  return {
    createUserItem,
    createChannelItem,
    createDMItem,
    createPhoneItem,
    createPersonalContactItem,
    createPhoneContactItem,
    createConversationItem
  };
};
