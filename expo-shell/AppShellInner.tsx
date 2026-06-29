import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Provider } from "react-redux";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { store, rehydratePromise } from "store/global-store.ts";
import { ExpoErrorBoundary } from "./ExpoErrorBoundary.tsx";

const REHYDRATE_TIMEOUT_MS = 5000;

function PersistGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setReady(true);
    };
    const timeout = setTimeout(() => {
      console.warn(
        `[PersistGate] rehydrate timeout ${REHYDRATE_TIMEOUT_MS}ms — continuing`
      );
      finish();
    }, REHYDRATE_TIMEOUT_MS);
    void rehydratePromise.finally(() => {
      clearTimeout(timeout);
      finish();
    });
    return () => clearTimeout(timeout);
  }, []);

  if (!ready) {
    return (
      <View style={styles.persistRoot}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.persistLabel}>Restoring session…</Text>
      </View>
    );
  }

  return <>{children}</>;
}

function LazyNavigationShell() {
  const [Nav, setNav] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const mod = require("./NavigationShell.tsx") as {
        default?: React.ComponentType;
      };
      const Component = mod?.default;
      if (typeof Component !== "function") {
        throw new Error("NavigationShell has no default export");
      }
      setNav(() => Component);
      console.warn("[AppShellInner] NavigationShell loaded");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      console.error("[AppShellInner] NavigationShell failed", e);
    }
  }, []);

  if (error) {
    return (
      <View style={styles.errorRoot}>
        <Text style={styles.errorTitle}>Navigation failed to load</Text>
        <Text style={styles.errorMsg}>{error}</Text>
      </View>
    );
  }

  if (!Nav) {
    return (
      <View style={styles.persistRoot}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.persistLabel}>Loading navigation…</Text>
      </View>
    );
  }

  return <Nav />;
}

export default function AppShellInner() {
  return (
    <View style={styles.appRoot}>
      <ExpoErrorBoundary>
        <SafeAreaProvider>
          <Provider store={store}>
            <PersistGate>
              <LazyNavigationShell />
            </PersistGate>
          </Provider>
        </SafeAreaProvider>
      </ExpoErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: "#FFFFFF" },
  persistRoot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#03171F"
  },
  persistLabel: {
    marginTop: 12,
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "500"
  },
  errorRoot: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff"
  },
  errorTitle: { fontSize: 18, fontWeight: "600", color: "#c00", marginBottom: 8 },
  errorMsg: { fontSize: 13, color: "#444" }
});
