import React from "react";
import { getAppDisplayName } from "shared/branding/appBrand.ts";
import { Text, View, StyleSheet } from "react-native";

/** Shown when EXPO_PUBLIC_MINIMAL_BOOT=1 to verify native + Metro without full app tree. */
export default function BootProbe() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{getAppDisplayName()} Expo</Text>
      <Text style={styles.sub}>Boot probe OK — Metro connected</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff"
  },
  title: { fontSize: 22, fontWeight: "600" },
  sub: { marginTop: 8, fontSize: 14, color: "#666" }
});
