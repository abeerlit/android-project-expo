import { createMMKV } from "react-native-mmkv";
import { ChatMessage } from "../types";

const storage = createMMKV({
  id: "sendbird-message-cache",
  encryptionKey: "voxo-sendbird-messages"
});

const CACHE_PREFIX = "channel_messages_";
const THREAD_CACHE_PREFIX = "thread_";
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
/** Skip Sendbird loadPrevious when channel message cache is newer than this. */
export const CHANNEL_MESSAGES_FRESH_MS = 10 * 60 * 1000;
const MAX_THREAD_CACHE_SIZE = 50;

interface CachedMessages {
  messages: ChatMessage[];
  timestamp: number;
  channelUrl: string;
}

interface CachedThreadMessages {
  messages: ChatMessage[];
  timestamp: number;
  channelUrl: string;
  parentMessageId: number | string;
}

function restoreMessageMethods(msg: any): ChatMessage {
  return {
    ...msg,
    isUserMessage: () => msg.messageType === "user",
    isFileMessage: () => msg.messageType === "file",
    isAdminMessage: () => msg.messageType === "admin",
    isMultipleFilesMessage: () => msg.messageType === "multiple_files"
  } as ChatMessage;
}

export const MessageCache = {
  getCachedMessages(channelUrl: string): ChatMessage[] | null {
    try {
      const key = `${CACHE_PREFIX}${channelUrl}`;
      const cached = storage.getString(key);

      if (!cached) {
        return null;
      }

      const data: CachedMessages = JSON.parse(cached);

      // Check if cache is expired
      if (Date.now() - data.timestamp > CACHE_EXPIRY_MS) {
        storage.remove(key);
        return null;
      }

      // Restore Sendbird methods to cached messages
      return data.messages.map((msg: any) => restoreMessageMethods(msg));
    } catch (error) {
      console.error("[MessageCache] Error getting cached messages:", error);
      try {
        storage.remove(`${CACHE_PREFIX}${channelUrl}`);
      } catch (_removeErr) {
        /* ignore */
      }
      return null;
    }
  },

  getCacheTimestamp(channelUrl: string): number | null {
    try {
      const key = `${CACHE_PREFIX}${channelUrl}`;
      const cached = storage.getString(key);
      if (!cached) return null;
      const data: CachedMessages = JSON.parse(cached);
      if (Date.now() - data.timestamp > CACHE_EXPIRY_MS) {
        storage.remove(key);
        return null;
      }
      return data.timestamp;
    } catch {
      return null;
    }
  },

  setCachedMessages(channelUrl: string, messages: ChatMessage[]): void {
    try {
      const key = `${CACHE_PREFIX}${channelUrl}`;
      const data: CachedMessages = {
        messages,
        timestamp: Date.now(),
        channelUrl
      };

      storage.set(key, JSON.stringify(data));
    } catch (error) {
      console.error("[MessageCache] Error caching messages:", error);
    }
  },

  clearChannelCache(channelUrl: string): void {
    try {
      const key = `${CACHE_PREFIX}${channelUrl}`;
      storage.remove(key);
    } catch (error) {
      console.error("[MessageCache] Error clearing cache:", error);
    }
  },

  clearAllCache(): void {
    try {
      storage.clearAll();
    } catch (error) {
      console.error("[MessageCache] Error clearing all cache:", error);
    }
  },

  /** Remove one message from persisted channel cache (e.g. after delete). */
  removeMessageFromChannelCache(channelUrl: string, messageId: number): void {
    try {
      const existing = MessageCache.getCachedMessages(channelUrl);
      if (!existing?.length) return;
      const filtered = existing.filter((m) => (m as any).messageId !== messageId);
      if (filtered.length === existing.length) return;
      if (filtered.length === 0) {
        MessageCache.clearChannelCache(channelUrl);
      } else {
        MessageCache.setCachedMessages(channelUrl, filtered);
      }
    } catch (error) {
      console.error("[MessageCache] Error removing message from cache:", error);
    }
  }
};

export const ThreadCache = {
  getThreadMessages(
    channelUrl: string,
    parentMessageId: number | string
  ): ChatMessage[] | null {
    try {
      const key = `${THREAD_CACHE_PREFIX}${channelUrl}_${parentMessageId}`;
      const cached = storage.getString(key);

      if (!cached) {
        return null;
      }

      const data: CachedThreadMessages = JSON.parse(cached);

      if (Date.now() - data.timestamp > CACHE_EXPIRY_MS) {
        storage.remove(key);
        return null;
      }

      return data.messages.map((msg: any) => restoreMessageMethods(msg));
    } catch (error) {
      console.error("[ThreadCache] Error getting cached thread messages:", error);
      return null;
    }
  },

  setThreadMessages(
    channelUrl: string,
    parentMessageId: number | string,
    messages: ChatMessage[]
  ): void {
    try {
      const key = `${THREAD_CACHE_PREFIX}${channelUrl}_${parentMessageId}`;
      const capped = messages.slice(0, MAX_THREAD_CACHE_SIZE);
      const data: CachedThreadMessages = {
        messages: capped,
        timestamp: Date.now(),
        channelUrl,
        parentMessageId
      };
      storage.set(key, JSON.stringify(data));
    } catch (error) {
      console.error("[ThreadCache] Error caching thread messages:", error);
    }
  },

  addThreadMessage(
    channelUrl: string,
    parentMessageId: number | string,
    message: ChatMessage
  ): void {
    try {
      const existing =
        this.getThreadMessages(channelUrl, parentMessageId) || [];
      const exists = existing.some(
        (m) => (m as any).messageId === (message as any).messageId
      );
      if (exists) return;
      const updated = [message, ...existing].filter(
        (item, index, self) =>
          index ===
          self.findIndex((obj) => (obj as any).messageId === (item as any).messageId)
      );
      this.setThreadMessages(channelUrl, parentMessageId, updated);
    } catch (error) {
      console.error("[ThreadCache] Error adding thread message:", error);
    }
  },

  clearThreadCache(channelUrl: string, parentMessageId: number | string): void {
    try {
      const key = `${THREAD_CACHE_PREFIX}${channelUrl}_${parentMessageId}`;
      storage.remove(key);
    } catch (error) {
      console.error("[ThreadCache] Error clearing thread cache:", error);
    }
  },

  /** Remove one message from any thread cache entry for this channel (reply deletes). */
  removeMessageFromThreadCachesForChannel(
    channelUrl: string,
    messageId: number
  ): void {
    try {
      const keyPrefix = `${THREAD_CACHE_PREFIX}${channelUrl}_`;
      const keys = storage.getAllKeys().filter((k) => k.startsWith(keyPrefix));
      for (const key of keys) {
        const raw = storage.getString(key);
        if (!raw) continue;
        const data: CachedThreadMessages = JSON.parse(raw);
        if (Date.now() - data.timestamp > CACHE_EXPIRY_MS) {
          storage.remove(key);
          continue;
        }
        const filtered = data.messages.filter(
          (m: any) => m.messageId !== messageId
        );
        if (filtered.length === data.messages.length) continue;
        if (filtered.length === 0) {
          storage.remove(key);
        } else {
          storage.set(
            key,
            JSON.stringify({
              ...data,
              messages: filtered,
              timestamp: Date.now()
            })
          );
        }
      }
    } catch (error) {
      console.error(
        "[ThreadCache] Error removing message from thread caches:",
        error
      );
    }
  }
};
