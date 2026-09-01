package co.voxo.android.calling

/**
 * SIP settings aligned with android-project where Linphone can match them.
 *
 * - Identity: sip:{peer}@dev-sip.voxo.co (same as legacy)
 * - Legacy JS signaling: wss://api.voxo.co/webrtc (WebSocket only — not usable by Linphone)
 * - Linphone registrar: TLS to dev-sip.voxo.co (api.voxo.co:443 is WSS, not SIP — causes "io error")
 */
object VoxoSipConfig {
    const val DOMAIN = "dev-sip.voxo.co"
    /** android-project SessionManager transportOptions.server */
    const val WEBSOCKET_URI = "wss://api.voxo.co/webrtc"
    /** Linphone TLS registrar host (SIP domain, not api.voxo.co). */
    const val REGISTRAR_HOST = DOMAIN
    const val NORMAL_REGISTER_EXPIRES = 600
    const val WAKE_REGISTER_EXPIRES = 120
}
