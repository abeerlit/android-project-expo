/**
 * Call approach configuration for testing.
 *
 * USE_VOXO_MOBILE_APPROACH = true (iOS):
 *   - Use SlimSipClient only for incoming calls (like voxo-mobile)
 *   - No SessionManager for incoming; avoids "answered elsewhere"
 *   - SessionManager registers only when making outgoing calls
 *
 * Android: SessionManager handles all inbound (FG/BG/killed via headless). SlimSip inbound is disabled.
 *
 * USE_SLIMSIP_INBOUND_ONLY: true only when iOS + USE_VOXO_MOBILE_APPROACH — gates SlimSip-only inbound + skip SessionManager.register at startup.
 */
import { Platform } from "react-native";

export const USE_VOXO_MOBILE_APPROACH = true;

/** iOS only: SlimSip owns inbound; SessionManager skips register until outbound. Android always uses SessionManager for inbound. */
export const USE_SLIMSIP_INBOUND_ONLY =
  USE_VOXO_MOBILE_APPROACH && Platform.OS === "ios";
