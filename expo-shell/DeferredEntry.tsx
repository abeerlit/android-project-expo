import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { BootPlaceholder } from "./BootPlaceholder.tsx";
import { BootStoreContext, type BootStoreBundle } from "./BootStoreContext";
import { loadGlobalStorePiecemeal } from "./loadGlobalStore";
import { appCouldNotStartMessage } from "shared/branding/appBrand.ts";

void SplashScreen.preventAutoHideAsync().catch(() => {});

function clearPersistIfRequested() {
  if (process.env.EXPO_PUBLIC_CLEAR_PERSIST !== "1") return;
  try {
    const { MMKV } = require("react-native-mmkv");
    new MMKV().delete("persist:root");
    console.warn("[DeferredEntry] Cleared persist:root");
  } catch (e) {
    console.warn("[DeferredEntry] clear persist failed", e);
  }
}

/** Yield so Hermes gets a fresh native stack before the next synchronous require. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Loads the same tree as bare ios-project (src/Entrypoint.tsx) after first paint.
 * Avoids Maximum call stack size exceeded from one huge synchronous require chain at startup.
 */
export default function DeferredEntry() {
  const [App, setApp] = useState<React.ComponentType | null>(null);
  const [storeBundle, setStoreBundle] = useState<BootStoreBundle | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [step, setStep] = useState("waiting");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setStep("persist");
        clearPersistIfRequested();
        await tick();

        setStep("store");
        const bundle = await loadGlobalStorePiecemeal();
        setGlobalStoreBridge(bundle);
        setStoreBundle(bundle);
        await tick();
        await tick();

        setStep("navigation-shell");
        await tick();
        await tick();
        const mod = require("./NavigationShell.tsx") as {
          default?: React.ComponentType;
        };
        const Shell = mod?.default;
        if (typeof Shell !== "function") {
          throw new Error(
            "NavigationShell.tsx has no default export (Hermes stack overflow during module load?)"
          );
        }

        if (cancelled) return;
        setApp(() => Shell);
        setStep("ready");
      } catch (e) {
        if (cancelled) return;
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        setStep("error");
        void SplashScreen.hideAsync();
        console.error("[DeferredEntry] boot failed", e);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>{appCouldNotStartMessage()}</Text>
        <Text style={styles.step}>Failed at: {step}</Text>
        <ScrollView style={styles.scroll}>
          <Text style={styles.message}>{error.message}</Text>
          {error.stack ? <Text style={styles.stack}>{error.stack}</Text> : null}
        </ScrollView>
      </View>
    );
  }

  if (!App || !storeBundle) {
    return <BootPlaceholder />;
  }

  return (
    <BootStoreContext.Provider value={storeBundle}>
      <App />
    </BootStoreContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 24
  },
  title: { fontSize: 18, fontWeight: "600", color: "#111", marginBottom: 8 },
  step: { fontSize: 13, color: "#71717A", marginTop: 8 },
  scroll: { flex: 1, alignSelf: "stretch" },
  message: { fontSize: 14, color: "#FCA5A5", marginBottom: 8 },
  stack: { fontSize: 11, color: "#D4D4D8", fontFamily: "Menlo" }
});
