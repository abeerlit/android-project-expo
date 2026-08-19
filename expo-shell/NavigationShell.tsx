import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BootPlaceholder } from "./BootPlaceholder.tsx";

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Minimal entry so `require("./NavigationShell.tsx")` registers a default export
 * before any heavy shared-src graph loads (avoids Hermes stack overflow).
 */
export default function NavigationShell() {
  const [Impl, setImpl] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await tick();
        await tick();
        const mod = require("./NavigationShellImpl.tsx") as {
          default?: React.ComponentType;
        };
        const Loaded = mod?.default;
        if (typeof Loaded !== "function") {
          throw new Error("NavigationShellImpl.tsx has no default export");
        }
        if (!cancelled) {
          setImpl(() => Loaded);
          console.warn("[NavigationShell] impl loaded");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          console.error("[NavigationShell] impl load failed", e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <View style={styles.root}>
        <Text style={styles.errorTitle}>Navigation failed to load</Text>
        <Text style={styles.errorMsg}>{error}</Text>
      </View>
    );
  }

  if (!Impl) {
    return <BootPlaceholder />;
  }

  return <Impl />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 24
  },
  errorTitle: { fontSize: 18, fontWeight: "600", color: "#B91C1C" },
  errorMsg: { fontSize: 13, color: "#52525B", marginTop: 8 }
});
