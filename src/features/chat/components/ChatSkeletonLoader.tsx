// React Imports
import React from "react";
import { View } from "react-native";
import { useTheme } from "hooks/use-theme.ts";

// Components
import SkeletonPlaceholder from "react-native-skeleton-placeholder";
import { Screen } from "shared/components/utils/Screen.tsx";
import { borderRadius, padding } from "core/theme/theme.ts";

export const ChatSkeletonLoader = () => {
  const theme = useTheme();

  return (
    <Screen>
      <SkeletonPlaceholder>
        <View>
          {/* Header - just the name/title */}
          <View
            style={{
              paddingHorizontal: padding["3xl"],
              paddingVertical: padding.lg,
              borderBottomWidth: 1,
              borderBottomColor:
                theme.colors["color-colors-border-border-secondary"]
            }}
          >
            <SkeletonPlaceholder.Item
              width="60%"
              height={20}
              borderRadius={borderRadius.sm}
              alignSelf="center"
            />
          </View>

          {/* Message list */}
          <SkeletonPlaceholder.Item marginTop={padding.lg}>
            {[...Array(12)].map((_, index) => (
              <SkeletonPlaceholder.Item
                key={index}
                flexDirection="row"
                alignItems="center"
                paddingHorizontal={padding.lg}
                paddingVertical={padding.sm}
              >
                {/* Avatar */}
                <SkeletonPlaceholder.Item
                  width={32}
                  height={32}
                  borderRadius={borderRadius.sm}
                />

                {/* Message content */}
                <SkeletonPlaceholder.Item marginLeft={padding.md} flex={1}>
                  <SkeletonPlaceholder.Item
                    width={`${60 + (index % 4) * 10}%`}
                    height={14}
                    borderRadius={borderRadius.sm}
                  />
                  {index % 3 === 0 && (
                    <SkeletonPlaceholder.Item
                      width={`${40 + (index % 3) * 15}%`}
                      height={12}
                      marginTop={6}
                      borderRadius={borderRadius.sm}
                    />
                  )}
                </SkeletonPlaceholder.Item>
              </SkeletonPlaceholder.Item>
            ))}
          </SkeletonPlaceholder.Item>

          {/* Input area */}
          <SkeletonPlaceholder.Item
            height={140}
            marginHorizontal={padding.lg}
            borderRadius={borderRadius.lg}
          />
        </View>
      </SkeletonPlaceholder>
    </Screen>
  );
};
