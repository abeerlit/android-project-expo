// React Imports
import React from "react";
import { View } from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { fontSize } from "core/theme/theme.ts";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";

export const CallDrawer = () => {
  const theme = useTheme();

  return (
    <View style={{ paddingHorizontal: 20 }}>
      <WhiteSpace height={3} />
      <Text
        size={fontSize.lg}
        style={{
          fontWeight: "600",
          marginBottom: 20,
          color: theme.colors["color-colors-text-text-primary"],
          borderColor: theme.colors["color-colors-border-border-secondary"]
        }}
      >
        Call
      </Text>
      <WhiteSpace
        style={{
          borderStyle: "solid",
          borderWidth: 0.5,
          borderColor: theme.colors["color-colors-border-border-secondary"]
        }}
      />
    </View>
  );
};
