package co.voxo.android.calling

import android.content.Context
import android.content.SharedPreferences

/**
 * Persists the SIP identity so the native call stack can register at app startup and
 * in killed state without any JS being alive. Credentials are pushed once from JS at
 * login via the VoxoCalling bridge (the only JS -> native calling handoff).
 */
object VoxoSipCredentialsPrefs {
    private const val PREFS = "voxo_sip_credentials"
    private const val KEY_USER = "sip_user"
    private const val KEY_SECRET = "sip_secret"
    private const val KEY_DOMAIN = "sip_domain"
    private const val KEY_DISPLAY = "sip_display_name"

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    data class SipCredentials(
        val user: String,
        val secret: String,
        val domain: String,
        val displayName: String
    )

    fun save(
        context: Context,
        user: String,
        secret: String,
        domain: String,
        displayName: String
    ) {
        prefs(context).edit()
            .putString(KEY_USER, user)
            .putString(KEY_SECRET, secret)
            .putString(KEY_DOMAIN, domain)
            .putString(KEY_DISPLAY, displayName)
            .apply()
    }

    fun clear(context: Context) {
        prefs(context).edit().clear().apply()
    }

    fun get(context: Context): SipCredentials? {
        val p = prefs(context)
        val user = p.getString(KEY_USER, null) ?: return null
        val secret = p.getString(KEY_SECRET, null) ?: return null
        val domain = p.getString(KEY_DOMAIN, null) ?: return null
        val display = p.getString(KEY_DISPLAY, user) ?: user
        return SipCredentials(user, secret, domain, display)
    }

    fun hasCredentials(context: Context): Boolean = get(context) != null
}
