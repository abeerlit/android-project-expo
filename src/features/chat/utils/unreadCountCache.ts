import { createMMKV } from "react-native-mmkv";

const storage = createMMKV({
  id: "sendbird-unread-cache",
  encryptionKey: "voxo-sendbird-unread"
});

const UNREAD_COUNT_KEY = "channel_unread_counts";
const SENDBIRD_UNREAD_DEDUPE_IDS_KEY = "sendbird_unread_counted_message_ids";
const MAX_SENDBIRD_DEDUPE_IDS = 400;

interface UnreadCountMap {
  [channelUrl: string]: number;
}

export const UnreadCountCache = {
  /**
   * Get all cached unread counts
   */
  getAllUnreadCounts(): UnreadCountMap {
    try {
      const cached = storage.getString(UNREAD_COUNT_KEY);
      if (!cached) {
        return {};
      }
      return JSON.parse(cached) as UnreadCountMap;
    } catch (error) {
      console.error("[UnreadCountCache] Error getting unread counts:", error);
      return {};
    }
  },

  /**
   * Get unread count for a specific channel
   */
  getUnreadCount(channelUrl: string): number {
    try {
      const allCounts = this.getAllUnreadCounts();
      return allCounts[channelUrl] || 0;
    } catch (error) {
      console.error("[UnreadCountCache] Error getting unread count:", error);
      return 0;
    }
  },

  /**
   * Save unread count for a specific channel
   */
  setUnreadCount(channelUrl: string, count: number): void {
    try {
      const allCounts = this.getAllUnreadCounts();
      if (count > 0) {
        allCounts[channelUrl] = count;
      } else {
        // Remove entry if count is 0
        delete allCounts[channelUrl];
      }
      storage.set(UNREAD_COUNT_KEY, JSON.stringify(allCounts));
    } catch (error) {
      console.error("[UnreadCountCache] Error setting unread count:", error);
    }
  },

  /**
   * Save multiple unread counts at once
   */
  setAllUnreadCounts(counts: UnreadCountMap): void {
    try {
      // Filter out zero counts
      const filteredCounts: UnreadCountMap = {};
      Object.entries(counts).forEach(([url, count]) => {
        if (count > 0) {
          filteredCounts[url] = count;
        }
      });
      storage.set(UNREAD_COUNT_KEY, JSON.stringify(filteredCounts));
    } catch (error) {
      console.error(
        "[UnreadCountCache] Error setting all unread counts:",
        error
      );
    }
  },

  /**
   * Clear unread count for a specific channel
   */
  clearUnreadCount(channelUrl: string): void {
    try {
      const allCounts = this.getAllUnreadCounts();
      delete allCounts[channelUrl];
      storage.set(UNREAD_COUNT_KEY, JSON.stringify(allCounts));
    } catch (error) {
      console.error("[UnreadCountCache] Error clearing unread count:", error);
    }
  },

  /**
   * Clear all unread counts (use on logout if needed)
   */
  clearAllUnreadCounts(): void {
    try {
      storage.remove(UNREAD_COUNT_KEY);
    } catch (error) {
      console.error(
        "[UnreadCountCache] Error clearing all unread counts:",
        error
      );
    }
  },

  /**
   * FCM background handler and Sendbird `onMessageReceived` both used to increment unread for the
   * same message when the app was backgrounded. First caller wins; second must skip Redux + cache bump.
   */
  tryConsumeSendbirdUnreadMessageDedupe(
    messageId: string | number | undefined | null
  ): boolean {
    if (messageId === undefined || messageId === null) {
      return true;
    }
    const id = String(messageId);
    try {
      const raw = storage.getString(SENDBIRD_UNREAD_DEDUPE_IDS_KEY);
      const arr: string[] = raw ? JSON.parse(raw) : [];
      if (arr.includes(id)) {
        return false;
      }
      arr.push(id);
      const trimmed =
        arr.length > MAX_SENDBIRD_DEDUPE_IDS
          ? arr.slice(-MAX_SENDBIRD_DEDUPE_IDS)
          : arr;
      storage.set(SENDBIRD_UNREAD_DEDUPE_IDS_KEY, JSON.stringify(trimmed));
      return true;
    } catch (error) {
      console.error("[UnreadCountCache] Dedupe error:", error);
      return true;
    }
  }
};
