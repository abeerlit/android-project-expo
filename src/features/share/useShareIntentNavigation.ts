import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useShareIntentContext } from "expo-share-intent";
import { toast } from "@backpackapp-io/react-native-toast";
import { SharedMediaItem } from "core/navigation/types/types.ts";
import { mapShareIntentToMedia } from "features/share/mapShareIntent.ts";
import {
  clearPendingShareMedia,
  getAndClearPendingShareMedia,
  peekPendingShareMedia,
  setPendingShareMedia
} from "features/share/PendingShareIntent.ts";

type Options = {
  /** True when Authenticated stack is mounted (`user !== null`). */
  isLoggedIn: boolean;
  rehydratePromise: Promise<unknown>;
  onShareMedia: (media: SharedMediaItem[]) => void;
};

/**
 * Routes inbound Android share intents to the share drawer after auth is ready.
 * Stashes media when logged out and resumes after login.
 */
export function useShareIntentNavigation({
  isLoggedIn,
  rehydratePromise,
  onShareMedia
}: Options): void {
  const { hasShareIntent, shareIntent, resetShareIntent, error } =
    useShareIntentContext();
  const handledKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (!error) return;
    toast.error("Could not receive shared content");
  }, [error]);

  // Inbound share from native module
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (!hasShareIntent) {
      handledKeyRef.current = null;
      return;
    }

    let cancelled = false;

    void (async () => {
      await rehydratePromise;
      if (cancelled) return;

      const media = mapShareIntentToMedia(shareIntent);
      const key = media.map((m) => m.uri).join("|") || "empty";

      if (handledKeyRef.current === key) return;
      handledKeyRef.current = key;

      if (media.length === 0) {
        toast.error("Unsupported or empty shared content");
        resetShareIntent(true);
        clearPendingShareMedia();
        return;
      }

      if (!isLoggedIn) {
        setPendingShareMedia(media);
        resetShareIntent(true);
        toast.success("Sign in to send shared media");
        return;
      }

      clearPendingShareMedia();
      setTimeout(() => onShareMedia(media), 100);
      resetShareIntent(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    hasShareIntent,
    shareIntent,
    isLoggedIn,
    rehydratePromise,
    resetShareIntent,
    onShareMedia
  ]);

  // Resume after login
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (!isLoggedIn) return;

    let cancelled = false;
    void (async () => {
      await rehydratePromise;
      if (cancelled) return;
      if (!peekPendingShareMedia()?.length) return;

      const media = getAndClearPendingShareMedia();
      if (!media?.length) return;
      setTimeout(() => onShareMedia(media), 100);
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, rehydratePromise, onShareMedia]);
}
