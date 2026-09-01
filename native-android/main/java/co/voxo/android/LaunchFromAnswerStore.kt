package co.voxo.android

import android.os.Bundle

/**
 * Store for JS to fetch via getLaunchFromAnswerIntent when getLaunchOptions wasn't used.
 * MainActivity stores launch-from-answer data here when started with LAUNCH_FROM_ANSWER.
 */
object LaunchFromAnswerStore {
    @Volatile
    private var stored: Bundle? = null

    fun store(bundle: Bundle) {
        stored = bundle
    }

    fun getAndClear(): Bundle? {
        val b = stored
        stored = null
        return b
    }

    /** Clears any pending launch-from-answer bundle (e.g. call ended remotely — avoid ghost InCall on JS reload). */
    fun clear() {
        stored = null
    }
}
