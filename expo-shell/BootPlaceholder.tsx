import React from "react";
import { StyleSheet, View } from "react-native";

/** Blank boot screen — no spinner or step labels while deferred modules load. */
export function BootPlaceholder() {
  return <View style={styles.root} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF"
  }
});
