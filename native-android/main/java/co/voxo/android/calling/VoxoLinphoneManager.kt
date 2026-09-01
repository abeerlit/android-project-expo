package co.voxo.android.calling

import android.content.Context
import android.util.Log

/**
 * JsSIP + CallKeep handle SIP in JS on Android Expo. Linphone was removed from Gradle;
 * this stub keeps native call UI / bridge compiling without the Linphone SDK.
 */
object VoxoLinphoneManager {
    private const val TAG = "VoxoLinphoneManager"

    const val ACTION_CALL_ENDED = "co.voxo.android.calling.CALL_ENDED"

    fun ensureStarted(context: Context) {
        Log.d(TAG, "ensureStarted (no-op — SIP runs in JS)")
    }

    fun setCredentials(
        context: Context,
        user: String,
        secret: String,
        domain: String,
        displayName: String
    ) {
        VoxoSipCredentialsPrefs.save(context, user, secret, domain, displayName)
        Log.d(TAG, "setCredentials saved prefs only (no native SIP stack)")
    }

    fun setAccessToken(context: Context, token: String) {
        if (token.isNotBlank()) {
            VoxoAccessTokenPrefs.save(context, token)
        }
    }

    fun setFcmToken(context: Context, token: String) {
        if (token.isNotBlank()) {
            VoxoFcmTokenPrefs.save(context, token)
        }
    }

    fun wakeUpForIncomingCall(context: Context, callUuid: String, callerIp: String) {
        Log.d(TAG, "wakeUpForIncomingCall (no-op) uuid=$callUuid ip=$callerIp")
    }

    fun unregister(context: Context) {
        Log.d(TAG, "unregister (no-op)")
    }

    fun startCall(number: String, displayName: String?) {
        Log.d(TAG, "startCall (no-op) number=$number")
    }

    fun accept(callId: String) {
        Log.d(TAG, "accept (no-op) callId=$callId")
    }

    fun decline(callId: String) {
        Log.d(TAG, "decline (no-op) callId=$callId")
    }

    fun hangup(callId: String) {
        Log.d(TAG, "hangup (no-op) callId=$callId")
    }

    fun hangupAll() {
        Log.d(TAG, "hangupAll (no-op)")
    }

    fun setMuted(callId: String, muted: Boolean) {
        Log.d(TAG, "setMuted (no-op) callId=$callId muted=$muted")
    }

    fun setSpeaker(callId: String, on: Boolean) {
        Log.d(TAG, "setSpeaker (no-op) callId=$callId on=$on")
    }

    fun setHold(callId: String, hold: Boolean) {
        Log.d(TAG, "setHold (no-op) callId=$callId hold=$hold")
    }

    fun sendDtmf(callId: String, digit: Char) {
        Log.d(TAG, "sendDtmf (no-op) callId=$callId digit=$digit")
    }

    fun transferBlind(callId: String, number: String) {
        Log.d(TAG, "transferBlind (no-op) callId=$callId number=$number")
    }

    fun startSecondCall(number: String, displayName: String?) {
        Log.d(TAG, "startSecondCall (no-op) number=$number")
    }

    fun completeAttendedTransfer(fromCallId: String, toCallId: String) {
        Log.d(TAG, "completeAttendedTransfer (no-op) from=$fromCallId to=$toCallId")
    }

    fun mergeIntoConference() {
        Log.d(TAG, "mergeIntoConference (no-op)")
    }

    fun openCallUi(callId: String?) {
        Log.d(TAG, "openCallUi (no-op) callId=$callId")
    }

    fun hasActiveCalls(): Boolean = false
}
