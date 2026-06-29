import React from "react";
import { View } from "react-native";
import { Text } from "shared/components/Text.tsx";
import { homeStyles } from "../styles/home-styles.ts";
import { fontSize } from "core/theme/theme.ts";

const SearchResultMessage: React.FC<{ children: React.ReactNode }> = ({
  children
}) => (
  <View style={homeStyles.centeredMessageContainer}>
    <Text
      size={fontSize.md}
      weight="regular"
      color="colors-text-text-secondary"
      style={homeStyles.centeredMessageText}
    >
      {children}
    </Text>
  </View>
);

export default SearchResultMessage;
