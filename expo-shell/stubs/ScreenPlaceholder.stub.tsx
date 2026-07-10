import React from "react";
import { StyleSheet, Text, View } from "react-native";

export function ScreenPlaceholder({ title }: { title: string }) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>Not loaded in Expo dev shell. Enable the matching EXPO_PUBLIC_* flag and rebuild.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#fff"
  },
  title: { fontSize: 18, fontWeight: "600", color: "#18181B" },
  hint: { fontSize: 13, color: "#71717A", marginTop: 8, textAlign: "center" }
});
