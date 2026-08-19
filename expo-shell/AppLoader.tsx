import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import * as SplashScreen from "expo-splash-screen";
import {
  appCouldNotStartMessage,
  appStartingMessage
} from "shared/branding/appBrand.ts";

void SplashScreen.preventAutoHideAsync().catch(() => {});

type Phase = "starting" | "ready" | "error";

function clearPersistIfRequested() {
  if (process.env.EXPO_PUBLIC_CLEAR_PERSIST !== "1") return;
  try {
    const { createMMKV } = require("./shims/mmkv.shim.ts");
    const mmkv = createMMKV();
    mmkv.remove("persist:root");
    console.warn("[AppLoader] Cleared persist:root (EXPO_PUBLIC_CLEAR_PERSIST=1)");
  } catch (e) {
    console.warn("[AppLoader] Could not clear persist", e);
  }
}

/**
 * Loads store + navigation in phases so a single bad import does not leave a blank root.
 */
export default function AppLoader() {
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<Error | null>(null);
  const [bootStep, setBootStep] = useState("init");
  const [App, setApp] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    let cancelled = false;
    let currentStep = "init";

    const fail = (step: string, e: unknown) => {
      if (cancelled) return;
      const err = e instanceof Error ? e : new Error(String(e));
      err.message = `[${step}] ${err.message}`;
      setError(err);
      setBootStep(step);
      setPhase("error");
      void SplashScreen.hideAsync();
      console.error("[AppLoader] boot failed at", step, e);
    };

    const run = (step: string, fn: () => void) => {
      if (cancelled) return;
      currentStep = step;
      setBootStep(step);
      fn();
    };

    try {
      run("clear-persist", () => clearPersistIfRequested());
      run("redux-store", () => require("store/global-store.ts"));
      run("app-shell", () => {
        const mod = require("./AppShell.tsx") as {
          default?: React.ComponentType;
          __esModule?: boolean;
        };
        const Root = mod?.default ?? (mod as unknown as React.ComponentType);
        if (typeof Root !== "function") {
          throw new Error(
            "AppShell has no default export (module may have thrown during load)"
          );
        }
        if (!cancelled) {
          setApp(() => Root);
          setPhase("ready");
          setBootStep("ready");
          void SplashScreen.hideAsync();
          console.warn("[AppLoader] boot complete — AppShell registered");
        }
      });
    } catch (e) {
      fail(currentStep, e);
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot runs once on mount
  }, []);

  if (phase === "error" && error) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>{appCouldNotStartMessage()}</Text>
        <Text style={styles.step}>Failed at: {bootStep}</Text>
        <ScrollView style={styles.scroll}>
          <Text style={styles.message}>{error.message}</Text>
          {error.stack ? <Text style={styles.stack}>{error.stack}</Text> : null}
        </ScrollView>
      </View>
    );
  }

  if (!App) {
    return (
      <View style={styles.root}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.label}>{appStartingMessage()}</Text>
        <Text style={styles.step}>{bootStep}</Text>
      </View>
    );
  }

  return <App />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#03171F",
    padding: 24
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8
  },
  step: {
    fontSize: 13,
    color: "#A1A1AA",
    marginBottom: 12
  },
  label: {
    marginTop: 16,
    fontSize: 16,
    color: "#E4E4E7",
    fontWeight: "500"
  },
  scroll: { flex: 1, alignSelf: "stretch" },
  message: { fontSize: 14, color: "#FCA5A5", marginBottom: 8 },
  stack: { fontSize: 11, color: "#D4D4D8", fontFamily: "Menlo" }
});
