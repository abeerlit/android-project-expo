import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageResizeMode,
  ImageStyle,
  StyleProp,
  StyleSheet,
  View
} from "react-native";
import {
  SmsMediaVariant,
  ensureSmsCached,
  getLocalSmsUriAsync,
  invalidateCachedSmsMedia,
  isSmsGifUrl
} from "features/text/utils/smsMediaCache.ts";

type CachedSmsImageProps = {
  messageId: number;
  fileIndex?: number;
  remoteUri: string;
  variant: SmsMediaVariant;
  style: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode | "cover" | "contain";
};

/**
 * SMS/MMS list thumbnail: show remote immediately, warm disk cache in background.
 * GIFs keep the remote URI to avoid animation restarts when cache lands.
 */
export function CachedSmsImage({
  messageId,
  fileIndex = 0,
  remoteUri,
  variant,
  style,
  resizeMode = "cover"
}: CachedSmsImageProps) {
  const isGif = isSmsGifUrl(remoteUri);
  const [displayUri, setDisplayUri] = useState(remoteUri);
  const [caching, setCaching] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!remoteUri?.trim()) {
      setDisplayUri("");
      setCaching(false);
      return;
    }

    if (!messageId) {
      setDisplayUri(remoteUri);
      setCaching(false);
      return;
    }

    let cancelled = false;
    setDisplayUri(remoteUri);

    void (async () => {
      const local = await getLocalSmsUriAsync(messageId, fileIndex, variant);
      if (cancelled) return;
      if (local) {
        if (!isGif) {
          setDisplayUri(local);
        }
        return;
      }

      if (!isGif) {
        setCaching(true);
      }
      try {
        const cached = await ensureSmsCached(
          remoteUri,
          messageId,
          fileIndex,
          variant
        );
        if (!cancelled && !isGif) {
          setDisplayUri(cached);
        }
      } catch {
        if (!cancelled) setDisplayUri(remoteUri);
      } finally {
        if (!cancelled) setCaching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [messageId, fileIndex, remoteUri, variant, isGif, retryKey]);

  const imageResizeMode = (resizeMode as ImageResizeMode) || "cover";
  const uri = displayUri || remoteUri;
  const isLocal = uri.startsWith("file://");

  const handleLoadError = () => {
    if (isLocal && messageId) {
      void invalidateCachedSmsMedia(messageId, fileIndex, variant).then(() => {
        setDisplayUri(remoteUri);
        setRetryKey((k) => k + 1);
      });
      return;
    }
    setDisplayUri(remoteUri);
  };

  if (!uri) {
    return (
      <View style={[style, styles.placeholder]}>
        {caching ? <ActivityIndicator size="small" color="#999" /> : null}
      </View>
    );
  }

  return (
    <View style={style}>
      <Image
        style={StyleSheet.absoluteFillObject}
        source={{ uri }}
        resizeMode={imageResizeMode}
        onError={handleLoadError}
      />
      {caching && !isGif ? (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator size="small" color="#999" />
        </View>
      ) : null}
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
    backgroundColor: "rgba(255,255,255,0.25)"
  }
});
