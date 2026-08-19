// React Imports
import { useTheme } from "hooks/use-theme.ts";
import { borderRadius, fontSize } from "core/theme/theme.ts";

// Type Imports
import React, { useState } from "react";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { StyleSheet, View } from "react-native";
import { CachedImage } from "shared/components/CachedImage.tsx";

export function ContactDrawerAvatar({
  src,
  name = "Anonymous",
  size = 40
}: {
  src: string | null;
  name?: string;
  size?: number;
}) {
  // Hooks
  const theme = useTheme();
  const [imageError, setImageError] = useState(false);
  React.useEffect(() => {
    setImageError(false);
  }, [src]);

  if (!src || imageError) {
    return (
      <View
        style={[
          {
            height: size,
            width: size,
            borderColor:
              theme.colors[
                "color-component-colors-components-avatars-avatar-profile-photo-border"
              ],
            backgroundColor:
              theme.colors["component-colors-components-avatars-avatar-bg"]
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
          height: size,
          width: size,
          borderColor:
            theme.colors[
              "color-component-colors-components-avatars-avatar-profile-photo-border"
            ],
          backgroundColor:
            theme.colors["component-colors-components-avatars-avatar-bg"]
        },
        styles.avatarContainer
      ]}
    >
      <CachedImage
        uri={src}
        style={{
          width: "100%",
          height: "100%",
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
    borderWidth: 3,
    borderRadius: borderRadius.md
  },
  avatarContainer: {
    borderWidth: 3,
    borderRadius: borderRadius.md,
    overflow: "hidden"
  }
});
