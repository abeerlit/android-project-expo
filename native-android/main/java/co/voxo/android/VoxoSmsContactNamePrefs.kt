package co.voxo.android

import android.content.Context
import org.json.JSONObject

/**
 * Persists SMS contact name cache synced from JS (directory + conversations).
 * Used when FCM runs without Redux (killed / background headless).
 */
object VoxoSmsContactNamePrefs {
    private const val PREFS_NAME = "voxo_sms_contact_names"
    private const val KEY_CACHE_JSON = "cache_json"

    @Volatile
    private var memoryCache: JSONObject? = null

    fun syncCache(context: Context, json: String) {
        context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_CACHE_JSON, json)
            .apply()
        memoryCache = try {
            JSONObject(json)
        } catch (_: Exception) {
            null
        }
    }

    private fun loadCache(context: Context): JSONObject? {
        memoryCache?.let { return it }
        val raw = context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_CACHE_JSON, null)
            ?: return null
        return try {
            JSONObject(raw).also { memoryCache = it }
        } catch (_: Exception) {
            null
        }
    }

    private fun cacheKeyForPhone(phoneNumber: String): String? {
        val digits = phoneNumber.replace(Regex("\\D"), "")
        if (digits.isEmpty()) {
            return null
        }
        val last10 = if (digits.length >= 10) digits.takeLast(10) else digits
        return if (last10.length == 10) last10 else digits
    }

    fun getContactNameForPhone(context: Context, phoneNumber: String): String? {
        val key = cacheKeyForPhone(phoneNumber) ?: return null
        val cache = loadCache(context) ?: return null
        val phones = cache.optJSONObject("phones") ?: return null
        val name = phones.optString(key, "")
        return name.takeIf { it.isNotBlank() }
    }

    fun getConversationTitle(context: Context, conversationId: String): String? {
        if (conversationId.isBlank()) {
            return null
        }
        val cache = loadCache(context) ?: return null
        val conversations = cache.optJSONObject("conversations") ?: return null
        val title = conversations.optString(conversationId, "")
        return title.takeIf { it.isNotBlank() }
    }
}
