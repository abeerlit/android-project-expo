import React from "react";
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle
} from "react-native";

import { Text } from "./Text.tsx";

interface Props {
  showText?: boolean;
  size?: "small" | "large" | number;
  style?: StyleProp<ViewStyle>;
}

export function LoadingContainer({
  showText = false,
  style,
  size = "small"
}: Props) {
  return (
    <View style={[styles.loadingContainer, style]}>
      <ActivityIndicator style={style} size={size} />
      {showText ? <Text color="secondary">Loading...</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column"
  }
});
