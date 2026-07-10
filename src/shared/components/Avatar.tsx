// React Imports
import React, { useEffect, useState } from "react";
import { useTheme } from "hooks/use-theme.ts";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { CachedImage } from "shared/components/CachedImage.tsx";

interface AvatarProps {
  source?: string;
  name?: string;
  size?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  status?: "online" | "offline" | "away" | "busy" | "none";
  statusSize?: number;
  statusStyle?: StyleProp<ViewStyle>;
  customIcon?: string;
}

const getInitials = (name: string | undefined): string => {
  if (!name?.trim()) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

function uriResourcePath(uri: string): string {
  const q = uri.indexOf("?");
  return q === -1 ? uri : uri.slice(0, q);
}

/** See ios-project Avatar — avoid initials flash on every new Avatar for the same URI (e.g. tab switches). */
const avatarUriLoadedThisSession = new Set<string>();

export const Avatar = ({
  source,
  name,
  size = 40,
  borderRadius = 20,
  style,
  status,
  statusSize,
  statusStyle,
  customIcon
}: AvatarProps) => {
  const theme = useTheme();
  const effectiveSource = source?.trim() || undefined;
  const [loadError, setLoadError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(() => {
    const s = source?.trim();
    if (!s) return false;
    return avatarUriLoadedThisSession.has(uriResourcePath(s));
  });

  useEffect(() => {
    if (!effectiveSource) {
      setLoadError(false);
      setImageLoaded(false);
      return;
    }
    setLoadError(false);
    const key = uriResourcePath(effectiveSource);
    if (avatarUriLoadedThisSession.has(key)) {
      setImageLoaded(true);
    } else {
      setImageLoaded(false);
    }
  }, [effectiveSource]);

  const hasSource = !!effectiveSource && !loadError;
  const showPhoto = hasSource && imageLoaded;
  const initials = (name && getInitials(name)) || customIcon || "";
  const showPlaceholderText =
    !showPhoto && !!initials && (!hasSource || !imageLoaded || loadError);

  const containerStyle = {
    width: size,
    height: size,
    borderRadius: borderRadius
  };

  const textSize = size * 0.4;
  const statusIndicatorSize = statusSize || Math.max(size * 0.25, 8);

  const getStatusColor = () => {
    switch (status) {
      case "online":
        return theme.colors.success;
      case "offline":
        return theme.colors["color-colors-border-border-disabled-subtle"];
      case "busy":
        return theme.colors.danger;
      default:
        return "transparent";
    }
  };

  return (
    <View style={[styles.wrapper]}>
      <View
        style={[
          styles.container,
          containerStyle,
          style,
          {
            backgroundColor: showPhoto
              ? "transparent"
              : theme.colors["colors-background-bg-secondary"]
          }
        ]}
      >
        {hasSource ? (
          <CachedImage
            uri={effectiveSource!}
            style={[styles.image, containerStyle, !showPhoto && styles.imageHidden]}
            resizeMode="cover"
            imagePriority="high"
            onLoad={() => {
              avatarUriLoadedThisSession.add(uriResourcePath(effectiveSource!));
              setImageLoaded(true);
            }}
            onError={() => setLoadError(true)}
          />
        ) : null}
        {showPlaceholderText ? (
          <Text
            style={[
              styles.initialsText,
              styles.initialsLayer,
              {
                fontSize: textSize,
                color: theme.colors["colors-foreground-fg-tertiary"]
              }
            ]}
          >
            {initials}
          </Text>
        ) : null}
      </View>

      {status && status !== "none" && (
        <View
          style={[
            styles.statusIndicator,
            {
              width: statusIndicatorSize,
              height: statusIndicatorSize,
              borderRadius: statusIndicatorSize / 2,
              backgroundColor: getStatusColor(),
              borderColor: theme.colors["color-colors-background-bg-primary"]
            },
            statusStyle
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center"
  },
  container: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden"
  },
  image: {
    width: "100%",
    height: "100%"
  },
  imageHidden: {
    opacity: 0,
    position: "absolute"
  },
  initialsLayer: {
    position: "absolute"
  },
  initialsText: {
    fontWeight: "500"
  },
  statusIndicator: {
    position: "absolute",
    bottom: 0,
    right: -1,
    borderWidth: 2,
    zIndex: 1
  }
});
