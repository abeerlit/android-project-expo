import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageResizeMode,
  ImageStyle,
  Platform,
  StyleProp,
  StyleSheet,
  View
} from "react-native";
import FastImage from "@d11/react-native-fast-image";
import {
  ChatMediaVariant,
  ensureCached,
  getLocalUriAsync,
  invalidateCachedMedia
} from "features/chat/utils/chatMediaCache.ts";

type CachedChatImageProps = {
  messageId: number;
  fileIndex?: number;
  remoteUri: string;
  variant: ChatMediaVariant;
  style: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode | "cover" | "contain";
  authToken?: string;
  /** When true, prefer local disk cache (modal full-res). */
  preferLocal?: boolean;
  /**
   * List thumbnail: never load Sendbird HTTPS via FastImage (401 without session).
   * Only show disk file after blob download with auth.
   */
  forThumbnail?: boolean;
};

export function CachedChatImage({
  messageId,
  fileIndex = 0,
  remoteUri,
  variant,
  style,
  resizeMode = "cover",
  authToken,
  preferLocal = false,
  forThumbnail = false
}: CachedChatImageProps) {
  const [displayUri, setDisplayUri] = useState<string | null>(
    forThumbnail ? null : remoteUri
  );
  const [loading, setLoading] = useState(!!remoteUri);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (!remoteUri?.trim() || !messageId) {
      setDisplayUri(remoteUri || null);
      setLoading(false);
      return;
    }

    if (!forThumbnail) {
      setDisplayUri(remoteUri);
    } else {
      setDisplayUri(null);
    }
    setLoading(true);

    void (async () => {
      const local = await getLocalUriAsync(messageId, fileIndex, variant);
      if (cancelled) return;
      if (local) {
        setDisplayUri(local);
        setLoading(false);
        return;
      }

      try {
        const cached = await ensureCached(
          remoteUri,
          messageId,
          fileIndex,
          variant,
          authToken
        );
        if (cancelled) return;
        setDisplayUri(cached);
      } catch {
        if (cancelled) return;
        if (!forThumbnail) {
          setDisplayUri(remoteUri);
        } else {
          setDisplayUri(remoteUri);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    messageId,
    fileIndex,
    remoteUri,
    variant,
    authToken,
    forThumbnail,
    preferLocal,
    retryKey
  ]);

  const rm =
    resizeMode === "contain"
      ? FastImage.resizeMode.contain
      : FastImage.resizeMode.cover;

  const uri = displayUri || remoteUri || "";
  const isLocal = uri.startsWith("file://");
  const flatStyle = StyleSheet.flatten(style) ?? {};
  const imageResizeMode = (resizeMode as ImageResizeMode) || "cover";

  const handleLoadError = () => {
    if (isLocal && messageId) {
      void invalidateCachedMedia(messageId, fileIndex, variant).then(() => {
        setDisplayUri(forThumbnail ? null : remoteUri);
        setRetryKey((k) => k + 1);
      });
      return;
    }
    if (forThumbnail) {
      setDisplayUri(remoteUri);
    }
  };

  if (!uri) {
    if (loading) {
      return (
        <View style={[style, styles.placeholder]}>
          <ActivityIndicator size="small" color="#999" />
        </View>
      );
    }
    return <View style={[style, styles.placeholder]} />;
  }

  const useNativeImageForLocal = Platform.OS === "android" && isLocal;

  const imageNode = useNativeImageForLocal ? (
    <Image
      style={style}
      source={{ uri }}
      resizeMode={imageResizeMode}
      onError={handleLoadError}
    />
  ) : (
    <FastImage
      style={flatStyle as object}
      source={{
        uri,
        priority: FastImage.priority.normal,
        headers: authToken
          ? { Authorization: `Bearer ${authToken}` }
          : undefined,
        cache: isLocal
          ? FastImage.cacheControl.immutable
          : FastImage.cacheControl.web
      }}
      resizeMode={rm}
      transition={FastImage.transition.none}
      onError={handleLoadError}
    />
  );

  if (!loading) {
    return imageNode;
  }

  return (
    <View style={style}>
      {useNativeImageForLocal ? (
        <Image
          style={StyleSheet.absoluteFillObject}
          source={{ uri }}
          resizeMode={imageResizeMode}
          onError={handleLoadError}
        />
      ) : isLocal ? (
        <FastImage
          style={StyleSheet.absoluteFillObject}
          source={{
            uri,
            priority: FastImage.priority.normal,
            cache: FastImage.cacheControl.immutable
          }}
          resizeMode={rm}
          transition={FastImage.transition.none}
          onError={handleLoadError}
        />
      ) : uri ? (
        <FastImage
          style={StyleSheet.absoluteFillObject}
          source={{
            uri,
            priority: FastImage.priority.normal,
            headers: authToken
              ? { Authorization: `Bearer ${authToken}` }
              : undefined,
            cache: FastImage.cacheControl.web
          }}
          resizeMode={rm}
          transition={FastImage.transition.none}
          onError={handleLoadError}
        />
      ) : null}
      <View style={styles.loader} pointerEvents="none">
        <ActivityIndicator size="small" color="#999" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center"
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.35)"
  }
});
