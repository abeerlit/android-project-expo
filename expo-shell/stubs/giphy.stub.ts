/**
 * Stub until dev client is rebuilt with @giphy/react-native-sdk linked (EXPO_PUBLIC_CHAT_NATIVE=1).
 */
import { toast } from "@backpackapp-io/react-native-toast";

export const GiphyThemePreset = {
  Automatic: "automatic",
  Dark: "dark",
  Light: "light"
} as const;

type Listener = (...args: unknown[]) => void;

const listeners: Record<string, Set<Listener>> = {
  onMediaSelect: new Set(),
  onDismiss: new Set()
};

function notifyUnavailable() {
  toast.error(
    "GIF picker is not available in this dev build. Rebuild with native chat enabled."
  );
}

export class GiphySDK {
  static configure(_options: { apiKey: string }) {
    /* no-op */
  }
}

export const GiphyDialog = {
  configure(_config: unknown) {
    /* no-op */
  },
  show() {
    notifyUnavailable();
  },
  hide() {
    /* no-op */
  },
  addListener(event: string, handler: Listener) {
    listeners[event]?.add(handler);
    return { remove: () => listeners[event]?.delete(handler) };
  },
  removeAllListeners(event: string) {
    listeners[event]?.clear();
  }
};

export const GiphyDialogEvent = {
  MediaSelected: "onMediaSelect",
  Dismissed: "onDismiss"
} as const;
