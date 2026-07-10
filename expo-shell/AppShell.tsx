import React, { useEffect, useState } from "react";
import { appShellErrorMessage } from "shared/branding/appBrand.ts";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View
} from "react-native";

/**
 * Minimal entry — no store/navigation imports at module scope (avoids Hermes stack overflow on require).
 */
export default function AppShell() {
  const [Inner, setInner] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const mod = require("./AppShellInner.tsx") as {
        default?: React.ComponentType;
      };
      const Component = mod?.default;
      if (typeof Component !== "function") {
        throw new Error("AppShellInner has no default export");
      }
      setInner(() => Component);
      console.warn("[AppShell] AppShellInner loaded");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      console.error("[AppShell] failed to load AppShellInner", e);
    }
  }, []);

  if (error) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>{appShellErrorMessage()}</Text>
        <Text style={styles.msg}>{error}</Text>
      </View>
    );
  }

  if (!Inner) {
    return (
      <View style={styles.root}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.label}>Preparing app shell…</Text>
      </View>
    );
  }

  return <Inner />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#03171F",
    padding: 24
  },
  title: { fontSize: 18, fontWeight: "600", color: "#fff", marginBottom: 8 },
  label: { marginTop: 12, fontSize: 16, color: "#E4E4E7" },
  msg: { fontSize: 14, color: "#FCA5A5", textAlign: "center" }
});
