package co.voxo.android

import android.content.Context

/**
 * Persists the same preference as JS user.enableMobileCallNotifications (1 = on).
 * Used when FCM runs without Redux (killed / background handler).
 * Default when unset: enabled (matches existing behavior).
 */
object VoxoCallNotificationPrefs {
    private const val PREFS_NAME = "voxo_call_notifications"
    private const val KEY_ENABLE_MOBILE_CALL = "enableMobileCallNotifications"

    fun isEnableMobileCallNotifications(context: Context): Boolean {
        val sp = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (!sp.contains(KEY_ENABLE_MOBILE_CALL)) {
            return true
        }
        return sp.getBoolean(KEY_ENABLE_MOBILE_CALL, true)
    }

    fun setEnableMobileCallNotifications(context: Context, enabled: Boolean) {
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_ENABLE_MOBILE_CALL, enabled)
            .apply()
    }
}
