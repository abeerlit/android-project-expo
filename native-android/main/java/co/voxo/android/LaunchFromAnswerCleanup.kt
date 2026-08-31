package co.voxo.android

import android.util.Log

/**
 * When a call ends, clears native state that would otherwise resurrect InCall after Metro reload:
 * [LaunchFromAnswerStore], matching [MainActivity] intent extras, and FCM payload cache for the UUID.
 */
object LaunchFromAnswerCleanup {
    private const val TAG = "LaunchFromAnswerCleanup"

    @JvmStatic
    fun onCallEnded(endedCallUuid: String) {
        try {
            LaunchFromAnswerStore.clear()
            VoxoConnectFirebaseService.IncomingCallBundles.remove(endedCallUuid)
            MainActivity.getInstance()?.clearLaunchFromAnswerForUuid(endedCallUuid)
            Log.i(TAG, "onCallEnded: cleared launch-from-answer state for $endedCallUuid")
        } catch (e: Exception) {
            Log.e(TAG, "onCallEnded FAILED", e)
        }
    }

    /** END_CALL with no specific UUID — clear store and any launch-from-answer flags on the activity. */
    @JvmStatic
    fun clearAllLaunchFromAnswerHints() {
        try {
            LaunchFromAnswerStore.clear()
            MainActivity.getInstance()?.clearLaunchFromAnswerIntentFully()
        } catch (e: Exception) {
            Log.e(TAG, "clearAllLaunchFromAnswerHints FAILED", e)
        }
    }
}
