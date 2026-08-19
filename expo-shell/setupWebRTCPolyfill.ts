/**
 * Run shared WebRTC globals before SoftphoneProvider (matches bare Entrypoint).
 */
export function runSetupWebRTCPolyfill(): void {
  const mod = require("core/softphone/webrtc-polyfill.js") as {
    setupWebRTCPolyfill?: () => void;
    default?: { setupWebRTCPolyfill?: () => void };
  };
  const fn =
    mod.setupWebRTCPolyfill ?? mod.default?.setupWebRTCPolyfill;
  if (typeof fn !== "function") {
    throw new Error(
      "core/softphone/webrtc-polyfill.js did not export setupWebRTCPolyfill"
    );
  }
  fn();
}
