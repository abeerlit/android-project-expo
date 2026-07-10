import SkeletonPlaceholder from "react-native-skeleton-placeholder";
import { borderRadius, componentSize, padding } from "core/theme/theme.ts";
import React from "react";

export const RowSkeletionLoader = () => {
  return (
    <SkeletonPlaceholder>
      <SkeletonPlaceholder.Item
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal={padding["3xl"]}
        paddingVertical={padding.md}
      >
        {/* Left: Icon + Text */}
        <SkeletonPlaceholder.Item
          flexDirection="row"
          gap={padding.lg}
          alignItems="center"
        >
          {/* Icon */}
          <SkeletonPlaceholder.Item
            width={componentSize.xs}
            height={componentSize.xs}
            borderRadius={borderRadius.sm}
          />

          {/* Channel name */}
          <SkeletonPlaceholder.Item width={150} height={16} borderRadius={4} />
        </SkeletonPlaceholder.Item>
      </SkeletonPlaceholder.Item>
    </SkeletonPlaceholder>
  );
};
