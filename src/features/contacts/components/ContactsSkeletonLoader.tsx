// React Imports
import React from "react";
import { useTheme } from "hooks/use-theme.ts";

// Components
import SkeletonPlaceholder from "react-native-skeleton-placeholder";

export const ContactsSkeletonLoader = () => {
  // Hooks
  const theme = useTheme();

  return (
    <SkeletonPlaceholder borderRadius={4}>
      <SkeletonPlaceholder.Item
        flexDirection="row"
        alignItems="center"
        padding={16}
        borderBottomWidth={1}
        borderBottomColor={theme.colors["color-colors-border-border-secondary"]}
      >
        {/* Avatar placeholder */}
        <SkeletonPlaceholder.Item
          width={40}
          height={40}
          justifyContent="center"
          alignItems="center"
        >
          <SkeletonPlaceholder.Item width={40} height={40} borderRadius={4} />
        </SkeletonPlaceholder.Item>

        {/* Content container */}
        <SkeletonPlaceholder.Item marginLeft={12} flex={1}>
          <SkeletonPlaceholder.Item width="60%" height={16} borderRadius={4} />
          <SkeletonPlaceholder.Item
            marginTop={8}
            width="40%"
            height={14}
            borderRadius={4}
          />
        </SkeletonPlaceholder.Item>
      </SkeletonPlaceholder.Item>
    </SkeletonPlaceholder>
  );
};
