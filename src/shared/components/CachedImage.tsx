import React from "react";
import FastImage from "@d11/react-native-fast-image";
import type { FastImageProps } from "@d11/react-native-fast-image";

export type CachedImageProps = {
  uri: string;
  style?: FastImageProps["style"];
  resizeMode?: keyof typeof FastImage.resizeMode;
  /** Default `normal`. Use `high` for top-bar / focal avatars. */
  imagePriority?: keyof typeof FastImage.priority;
  onLoad?: () => void;
  onError?: () => void;
};

/**
 * Network images with disk/memory caching (SDWebImage / Glide).
 * Prefer this over RN Image for list avatars and chat media so revisiting a tab does not refetch.
 */
export function CachedImage({
  uri,
  style,
  resizeMode = "cover",
  imagePriority = "normal",
  onLoad,
  onError
}: CachedImageProps) {
  return (
    <FastImage
      style={style}
      source={{
        uri,
        priority: FastImage.priority[imagePriority],
        cache: FastImage.cacheControl.immutable
      }}
      resizeMode={
        resizeMode in FastImage.resizeMode
          ? FastImage.resizeMode[
              resizeMode as keyof typeof FastImage.resizeMode
            ]
          : FastImage.resizeMode.cover
      }
      onLoad={onLoad}
      onError={onError}
      transition={FastImage.transition.none}
    />
  );
}

/** Warm the disk cache for a list of avatar URLs (e.g. contacts tab). */
export function preloadImageUris(uris: string[]): void {
  const sources = uris
    .filter((u) => !!u?.trim())
    .map((uri) => ({
      uri: uri.trim(),
      priority: FastImage.priority.low,
      cache: FastImage.cacheControl.immutable
    }));
  if (sources.length > 0) {
    FastImage.preload(sources);
  }
}
