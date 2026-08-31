package co.voxo.android.calling

import android.content.Context
import android.content.SharedPreferences

/** Persists the latest FCM token for native SIP REGISTER (pn-prid). */
object VoxoFcmTokenPrefs {
    private const val PREFS = "voxo_fcm_token"
    private const val KEY_TOKEN = "fcm_token"

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun save(context: Context, token: String) {
        if (token.isBlank()) return
        prefs(context).edit().putString(KEY_TOKEN, token).apply()
    }

    fun get(context: Context): String? = prefs(context).getString(KEY_TOKEN, null)

    fun clear(context: Context) {
        prefs(context).edit().clear().apply()
    }
}
