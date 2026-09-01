import React, { useCallback } from "react";
import { Platform } from "react-native";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { SharedMediaItem } from "core/navigation/types/types.ts";
import { ShareMediaDrawer } from "features/share/components/ShareMediaDrawer.tsx";
import { useShareIntentNavigation } from "features/share/useShareIntentNavigation.ts";

type Props = {
  isLoggedIn: boolean;
  rehydratePromise: Promise<unknown>;
};

export function ShareIntentDrawerHost({ isLoggedIn, rehydratePromise }: Props) {
  const { openDrawer, closeDrawer } = useDrawer();

  const openShareDrawer = useCallback(
    (media: SharedMediaItem[]) => {
      openDrawer(
        <ShareMediaDrawer media={media} onClose={closeDrawer} />,
        0.9
      );
    },
    [openDrawer, closeDrawer]
  );

  useShareIntentNavigation({
    isLoggedIn,
    rehydratePromise,
    onShareMedia: openShareDrawer
  });

  if (Platform.OS !== "android") return null;
  return null;
}
