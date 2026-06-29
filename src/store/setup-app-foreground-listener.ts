import type { Store } from "@reduxjs/toolkit";
import { AppState, Platform } from "react-native";
import * as actionTypes from "./global-actions.ts";
import { hasActiveCall } from "../core/callState.ts";

/** Debounce: wait for stable active before dispatching resume work */
const APP_FOREGROUND_DEBOUNCE_MS = 1000;
/** Min gap between APP_FOREGROUND dispatches — not a periodic poll */
const APP_FOREGROUND_MIN_INTERVAL_MS = 60000;
/** Ignore brief background flicker (e.g. permission sheets, SIP init) */
const APP_FOREGROUND_MIN_BACKGROUND_MS = 3000;

/**
 * Single AppState → APP_FOREGROUND pipeline (expo boot + bare store).
 * Skips launch flicker, permission onboarding, and rapid resume churn.
 */
export function setupAppForegroundListener(store: Store): () => void {
  let appForegroundTimer: ReturnType<typeof setTimeout> | null = null;
  let lastAppForegroundDispatch = 0;
  let lastBackgroundAt: number | null = null;

  const subscription = AppState.addEventListener("change", (newState) => {
    if (appForegroundTimer) {
      clearTimeout(appForegroundTimer);
      appForegroundTimer = null;
    }

    if (newState.match(/inactive|background/)) {
      lastBackgroundAt = Date.now();
      return;
    }

    if (newState !== "active") {
      return;
    }

    appForegroundTimer = setTimeout(() => {
      appForegroundTimer = null;
      if (typeof hasActiveCall === "function" && hasActiveCall()) {
        return;
      }

      try {
        const {
          getPermissionPromptInProgress
        } = require("core/permissions/permission-prompt-session.ts");
        if (getPermissionPromptInProgress()) {
          return;
        }
      } catch {
        /* ignore */
      }

      if (Platform.OS === "android") {
        try {
          const {
            getAndroidPermissionPromptsComplete
          } = require("core/permissions/android-permission-prompt-gate.ts");
          if (!getAndroidPermissionPromptsComplete()) {
            return;
          }
        } catch {
          /* ignore */
        }
      }

      if (lastBackgroundAt != null) {
        const backgroundMs = Date.now() - lastBackgroundAt;
        if (backgroundMs < APP_FOREGROUND_MIN_BACKGROUND_MS) {
          return;
        }
      }

      const now = Date.now();
      if (now - lastAppForegroundDispatch < APP_FOREGROUND_MIN_INTERVAL_MS) {
        return;
      }
      lastAppForegroundDispatch = now;
      lastBackgroundAt = null;
      store.dispatch({
        type: actionTypes.APP_FOREGROUND
      });
    }, APP_FOREGROUND_DEBOUNCE_MS);
  });

  return () => {
    if (appForegroundTimer) {
      clearTimeout(appForegroundTimer);
    }
    subscription.remove();
  };
}
