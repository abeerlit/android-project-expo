package co.voxo.android.calling.bridge

import co.voxo.android.calling.CallSessionRegistry
import co.voxo.android.calling.VoxoCallContactPrefs
import co.voxo.android.calling.VoxoLinphoneManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * The only JS <-> native calling bridge. JS uses it to:
 *  - provision SIP credentials once at login (setSipCredentials),
 *  - store API access token for inbound wake REGISTER (setAccessToken),
 *  - trigger outbound calls from existing dial buttons (startCall),
 *  - read the live call snapshot for the return-to-call banner (getSnapshot + events),
 *  - sync the contact name/avatar cache for the native UI (syncCallContacts).
 * All SIP logic itself stays native.
 */
class VoxoCallingModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private val registryListener: () -> Unit = { emitSnapshot() }

    init {
        CallSessionRegistry.addListener(registryListener)
    }

    override fun getName(): String = "VoxoCalling"

    override fun invalidate() {
        CallSessionRegistry.removeListener(registryListener)
        super.invalidate()
    }

    private fun emitSnapshot() {
        if (!reactContext.hasActiveReactInstance()) return
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT_SNAPSHOT, CallSessionRegistry.snapshotJson().toString())
        } catch (_: Exception) {
        }
    }

    // ── Provisioning ──────────────────────────────────────────────────────

    @ReactMethod
    fun setFcmToken(token: String) {
        if (token.isNotBlank()) {
            VoxoLinphoneManager.setFcmToken(reactContext.applicationContext, token)
        }
    }

    @ReactMethod
    fun setSipCredentials(
        user: String,
        secret: String,
        domain: String,
        displayName: String
    ) {
        VoxoLinphoneManager.setCredentials(
            reactContext.applicationContext, user, secret, domain, displayName
        )
    }

    @ReactMethod
    fun setAccessToken(token: String) {
        VoxoLinphoneManager.setAccessToken(reactContext.applicationContext, token)
    }

    @ReactMethod
    fun register() {
        VoxoLinphoneManager.ensureStarted(reactContext.applicationContext)
    }

    @ReactMethod
    fun unregister() {
        VoxoLinphoneManager.unregister(reactContext.applicationContext)
    }

    // ── Outbound ──────────────────────────────────────────────────────────

    @ReactMethod
    fun startCall(number: String, displayName: String?) {
        VoxoLinphoneManager.ensureStarted(reactContext.applicationContext)
        VoxoLinphoneManager.startCall(number, displayName)
    }

    // ── In-call controls (used by native UI; exposed for completeness) ─────

    @ReactMethod
    fun accept(callId: String) = VoxoLinphoneManager.accept(callId)

    @ReactMethod
    fun decline(callId: String) = VoxoLinphoneManager.decline(callId)

    @ReactMethod
    fun hangup(callId: String) = VoxoLinphoneManager.hangup(callId)

    @ReactMethod
    fun setMuted(callId: String, muted: Boolean) =
        VoxoLinphoneManager.setMuted(callId, muted)

    @ReactMethod
    fun setSpeaker(callId: String, on: Boolean) =
        VoxoLinphoneManager.setSpeaker(callId, on)

    @ReactMethod
    fun setHold(callId: String, hold: Boolean) =
        VoxoLinphoneManager.setHold(callId, hold)

    @ReactMethod
    fun sendDtmf(callId: String, digit: String) {
        if (digit.isNotEmpty()) VoxoLinphoneManager.sendDtmf(callId, digit[0])
    }

    @ReactMethod
    fun transferBlind(callId: String, number: String) =
        VoxoLinphoneManager.transferBlind(callId, number)

    @ReactMethod
    fun startSecondCall(number: String, displayName: String?) =
        VoxoLinphoneManager.startSecondCall(number, displayName)

    @ReactMethod
    fun completeAttendedTransfer(fromCallId: String, toCallId: String) =
        VoxoLinphoneManager.completeAttendedTransfer(fromCallId, toCallId)

    @ReactMethod
    fun mergeIntoConference() = VoxoLinphoneManager.mergeIntoConference()

    @ReactMethod
    fun openActiveCall(callId: String?) = VoxoLinphoneManager.openCallUi(callId)

    // ── Snapshot / contacts ───────────────────────────────────────────────

    @ReactMethod
    fun getSnapshot(promise: Promise) {
        promise.resolve(CallSessionRegistry.snapshotJson().toString())
    }

    @ReactMethod
    fun syncCallContacts(json: String) {
        VoxoCallContactPrefs.save(reactContext.applicationContext, json)
    }

    // ── NativeEventEmitter plumbing ───────────────────────────────────────

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN NativeEventEmitter; no-op (registry listener is always on).
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN NativeEventEmitter; no-op.
    }

    companion object {
        const val EVENT_SNAPSHOT = "VoxoCallSnapshot"
    }
}
