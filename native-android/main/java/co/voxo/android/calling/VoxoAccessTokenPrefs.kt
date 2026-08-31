package co.voxo.android.calling

import android.content.Context
import android.content.SharedPreferences

/** Persists the API access token for native SIP wake REGISTER (Authorization: Bearer). */
object VoxoAccessTokenPrefs {
    private const val PREFS = "voxo_access_token"
    private const val KEY_TOKEN = "access_token"

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun save(context: Context, token: String) {
        if (token.isBlank()) return
        prefs(context).edit().putString(KEY_TOKEN, token.trim()).apply()
    }

    fun get(context: Context): String? = prefs(context).getString(KEY_TOKEN, null)?.trim()

    fun clear(context: Context) {
        prefs(context).edit().clear().apply()
    }
}
