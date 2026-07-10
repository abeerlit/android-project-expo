// React Imports
import { useTheme } from "hooks/use-theme.ts";
import { borderRadius, fontSize } from "core/theme/theme.ts";

// Type Imports
import React, { useState, memo } from "react";

// Component Imports
import { StyleSheet, View } from "react-native";
import { Text } from "shared/components/Text.tsx";
import { CachedImage } from "shared/components/CachedImage.tsx";

export function UserAvatar({
  src,
  name = "Anonymous",
  size = 40
}: {
  src: string | null;
  name?: string;
  size?: number;
}) {
  const theme = useTheme();
  const [imageError, setImageError] = useState(false);
  const effectiveSrc = src && src.trim() ? src.trim() : null;

  // Reset error state when src changes.
  React.useEffect(() => {
    setImageError(false);
  }, [src]);

  if (!effectiveSrc || imageError) {
    return (
      <View
        style={[
          {
            borderColor:
              theme.colors[
                "component-colors-components-avatars-avatar-contrast-border"
              ],
            backgroundColor:
              theme.colors["component-colors-components-avatars-avatar-bg"],
            width: size,
            height: size
          },
          styles.defaultAvatarContainer
        ]}
      >
        <Text
          size={fontSize.lg}
          style={{
            color: theme.colors["color-colors-foreground-fg-quarterary"]
          }}
          weight={"semiBold"}
        >
          {getInitials(name)}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        {
          borderColor:
            theme.colors[
              "component-colors-components-avatars-avatar-contrast-border"
            ],
          width: size,
          height: size
        },
        styles.avatarContainer
      ]}
    >
      <CachedImage
        uri={effectiveSrc}
        style={{
          width: size,
          height: size,
          borderRadius: borderRadius.md
        }}
        resizeMode="cover"
        onError={() => setImageError(true)}
        onLoad={() => setImageError(false)}
      />
    </View>
  );
}

const getInitials = (name: string) => {
  if (!name) {
    return "#";
  }

  const initials = name
    .split(" ")
    .map((word) => word.charAt(0))
    .join("")
    .slice(0, 2);

  return initials;
};

const styles = StyleSheet.create({
  defaultAvatarContainer: {
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: borderRadius.md,
    overflow: "hidden"
  },
  avatarContainer: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    overflow: "hidden"
  }
});

// Memoize component to prevent unnecessary re-renders.
export const UserAvatarMemoized = memo(UserAvatar, (prevProps, nextProps) => {
  return (
    prevProps.src === nextProps.src &&
    prevProps.name === nextProps.name &&
    prevProps.size === nextProps.size
  );
});
