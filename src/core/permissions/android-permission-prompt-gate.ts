import { Platform } from "react-native";

/**
 * Android: first-run permission prompts (notifications, mic, location, phone, …) must finish
 * before SessionManager.register() is allowed. System dialogs move AppState out of "active",
 * which previously caused unintended REGISTER. FCM wake-up handles inbound registration.
 */
let promptsComplete = false;

const listeners = new Set<() => void>();

export function getAndroidPermissionPromptsComplete(): boolean {
  if (Platform.OS !== "android") {
    return true;
  }
  return promptsComplete;
}

export function setAndroidPermissionPromptsComplete(value: boolean): void {
  if (Platform.OS !== "android") {
    return;
  }
  if (promptsComplete === value) {
    return;
  }
  promptsComplete = value;
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeAndroidPermissionPromptGate(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
