import React, { useEffect, useState } from "react";
import {
  AppState,
  BackHandler,
  LogBox,
  NativeModules,
  Platform,
  StatusBar,
  View
} from "react-native";
import SystemNavigationBar from "react-native-system-navigation-bar";
import { Provider, useSelector } from "react-redux";
import * as Sentry from "@sentry/react-native";
import ConfigureStore, { rehydratePromise } from "store/global-store.ts";
import * as userActions from "store/users/actions.ts";
import { useOnlineManager } from "hooks/use-online-manager.ts";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Toasts } from "@backpackapp-io/react-native-toast";
import { Navigation } from "core/navigation/Navigation.tsx";
import { navigationRef } from "core/navigation/utils/Ref.ts";
import { DrawerProvider } from "core/drawer/DrawerProvider.tsx";
import { SendbirdContextProvider } from "features/chat/utils/SendbirdContextProvider.tsx";
import { SoftphoneProvider } from "core/softphone/SoftphoneProvider.tsx";
import { setupWebRTCPolyfill } from "core/softphone/webrtc-polyfill";
import { USE_VOXO_MOBILE_APPROACH } from "@core/config/callApproach";
import { ActiveCallBanner } from "features/calling/components/ActiveCallBanner.tsx";
import { ActiveMeetingBanner } from "features/calling/components/ActiveMeetingBanner.tsx";
import { MeetingActiveProvider } from "features/meeting/MeetingActiveContext.tsx";
import { Routes } from "core/navigation/types/types.ts";
import { State } from "store/types.ts";
import { CallUiVisibilityProvider } from "features/calling/CallUiVisibilityContext.tsx";

setupWebRTCPolyfill();

function AndroidEnableMobileCallNotificationsSync() {
  const user = useSelector((s: State) => s.userReducer.user);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const mod = NativeModules.VoxoConnectAndroidNotifications as
      | { setEnableMobileCallNotifications?: (enabled: boolean) => void }
      | undefined;
    if (!mod?.setEnableMobileCallNotifications) return;
    const enabled = !user || user.enableMobileCallNotifications !== 0;
    mod.setEnableMobileCallNotifications(enabled);
  }, [user?.id, user?.enableMobileCallNotifications]);
  return null;
}

/**
 * Some third-party libs assume a browser-like environment and call `window.setTimeout`.
 * On Hermes/Android, `window`/`self` can be `undefined` (fine) but if *anything* sets them
 * to `null`, those libs crash with "Cannot read property 'setTimeout' of null".
 *
 * This keeps `window`/`self` stable aliases of `globalThis` and ensures timer fns exist,
 * without freezing/locking (locking previously broke RN internals in this project).
 */
function ensureGlobalTimerAliases(): void {
  const g = globalThis as any;
  if (g == null) return;

  if (g.window == null) g.window = g;
  if (g.self == null) g.self = g;

  // If a lib overwrote these objects, re-attach timer funcs.
  const timers = ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] as const;
  for (const t of timers) {
    if (typeof g[t] === "function") {
      if (g.window && typeof g.window[t] !== "function") g.window[t] = g[t].bind(g);
      if (g.self && typeof g.self[t] !== "function") g.self[t] = g[t].bind(g);
    }
  }
}

// Run once at module load (best-effort).
ensureGlobalTimerAliases();

// ====== REDUX STORE SETUP ====== //
// persistor
const { store } = ConfigureStore();

// Add basic navigation breadcrumbs
const addNavigationBreadcrumb = () => {
  const currentRouteName = navigationRef.current?.getCurrentRoute()?.name;
  if (currentRouteName) {
    Sentry.addBreadcrumb({
      category: "navigation",
      message: `Navigated to ${currentRouteName}`,
      data: { routeName: currentRouteName }
    });
  }
};

LogBox.ignoreLogs([
  "Saw setTimeout with duration 300000ms",
  "`new NativeEventEmitter()` was called",
  "EventEmitter.",
  "Require cycle: node_modules",
  "Error evaluating injectedJavaScript"
]);


function AppContent() {
  const insets = useSafeAreaInsets();
  const [currentRouteName, setCurrentRouteName] = useState<string>();
  useOnlineManager();
  const queryClient = new QueryClient();
  const isMeetingsRoute = currentRouteName === Routes.Meetings;

  // Global Android back handling (covers system back gesture + back button).
  // Ensures "back" returns to previous screen when possible; otherwise routes to tabs instead of backgrounding app.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!navigationRef.isReady()) return false;
      // Let React Navigation handle normal back behavior when possible.
      // Only intercept when there's nothing to pop (otherwise Android backgrounds/exits).
      if (navigationRef.canGoBack()) return false;
      navigationRef.navigate(Routes.BottomTabNavigator as never);
      return true;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const barStyle = isMeetingsRoute ? "light-content" : "dark-content";
    const backgroundColor = isMeetingsRoute ? "#131314" : "white";
    StatusBar.setTranslucent(false);
    StatusBar.setBackgroundColor(backgroundColor, true);
    StatusBar.setBarStyle(barStyle, true);

    void (async () => {
      try {
        if (isMeetingsRoute) {
          await SystemNavigationBar.navigationHide();
        } else {
          await SystemNavigationBar.navigationShow();
        }
      } catch {
        // Native module / activity timing — ignore
      }
    })();
  }, [isMeetingsRoute]);



  useEffect(() => {
    ensureGlobalTimerAliases();
    const sub = Platform.OS !== "web"
      ? AppState.addEventListener("change", () => ensureGlobalTimerAliases())
      : undefined;
    return () => {
      (sub as any)?.remove?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await rehydratePromise;
      if (cancelled) return;
      const { authReducer } = store.getState();
      if (authReducer.isLoggedIn && authReducer.accessToken?.trim()) {
        store.dispatch({ type: userActions.REFRESH_USER_PROFILE });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const mod = NativeModules.VoxoNotificationsModule;
    if (mod?.setUseVoxoMobileCallApproach) {
      mod.setUseVoxoMobileCallApproach(USE_VOXO_MOBILE_APPROACH);
    }
  }, []);

  const handleNavigationStateChange = () => {
    addNavigationBreadcrumb();
    const routeName = navigationRef.getCurrentRoute()?.name;
    setCurrentRouteName(routeName);
  };

  return (
    <Provider store={store}>
      <AndroidEnableMobileCallNotificationsSync />
      <NavigationContainer
        ref={navigationRef}
        onReady={handleNavigationStateChange}
        onStateChange={handleNavigationStateChange}
      >
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <StatusBar
              barStyle={isMeetingsRoute ? "light-content" : "dark-content"}
              backgroundColor={isMeetingsRoute ? "#131314" : "white"}
              translucent={false}
            />
            <SendbirdContextProvider>
              <SoftphoneProvider>
                <DrawerProvider>
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: isMeetingsRoute ? "#131314" : "white",
                      // iOS: pad here. Android: `Screen` uses SafeAreaView top inset; avoid
                      // doubling with root padding (extra gap when no banner).
                      paddingTop: Platform.OS === "android" ? 0 : insets.top
                    }}
                  >
                    <CallUiVisibilityProvider>
                      <MeetingActiveProvider>
                        <ActiveCallBanner currentRouteName={currentRouteName} />
                        <ActiveMeetingBanner />
                        <Navigation />
                      </MeetingActiveProvider>
                    </CallUiVisibilityProvider>
                  </View>
                </DrawerProvider>
              </SoftphoneProvider>
            </SendbirdContextProvider>
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 9999,
                pointerEvents: "box-none"
              }}
            >
              <Toasts />
            </View>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </NavigationContainer>
    </Provider>
  );
}

function Entrypoint() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

export default Entrypoint;
