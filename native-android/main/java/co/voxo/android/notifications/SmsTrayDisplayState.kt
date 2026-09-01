package co.voxo.android.notifications

import android.content.Context

/** Tracks SMS tray replacements so headless JS does not post a second Notifee banner. */
object SmsTrayDisplayState {
    private const val PREFS_NAME = "voxo_sms_tray_display_state"
    private const val KEY_PREFIX = "resolved_"
    private const val TTL_MS = 120_000L

    fun markResolved(context: Context, messageId: String?) {
        if (messageId.isNullOrBlank()) {
            return
        }
        context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_PREFIX + messageId, System.currentTimeMillis())
            .apply()
    }

    fun wasResolvedByNative(context: Context, messageId: String?): Boolean {
        if (messageId.isNullOrBlank()) {
            return false
        }
        val prefs = context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val at = prefs.getLong(KEY_PREFIX + messageId, 0L)
        if (at <= 0L) {
            return false
        }
        if (System.currentTimeMillis() - at > TTL_MS) {
            prefs.edit().remove(KEY_PREFIX + messageId).apply()
            return false
        }
        return true
    }
}
