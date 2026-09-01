package co.voxo.android.contacts

import android.content.Context
import org.json.JSONObject

object SmsContactNameCache {
    private const val PREFS_NAME = "voxo_sms_contact_names"
    private const val KEY_MAP_JSON = "phone_name_map_v1"

    @Volatile
    private var memoryMap: Map<String, String> = emptyMap()

    fun syncFromJson(context: Context, json: String) {
        val parsed = mutableMapOf<String, String>()
        try {
            val root = JSONObject(json)
            val keys = root.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val value = root.optString(key, "").trim()
                if (key.isNotBlank() && value.isNotEmpty()) {
                    parsed[key] = value
                }
            }
        } catch (_: Exception) {
            return
        }

        memoryMap = parsed
        context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_MAP_JSON, json)
            .apply()
    }

    fun lookup(context: Context, phoneNumber: String?): String? {
        if (phoneNumber.isNullOrBlank()) {
            return null
        }

        val map = memoryMap.ifEmpty { loadFromPrefs(context) }
        val digits = phoneNumber.replace(Regex("\\D"), "")
        if (digits.isEmpty()) {
            return null
        }

        map[digits]?.let { return it }

        if (digits.length >= 10) {
            val last10 = digits.takeLast(10)
            map[last10]?.let { return it }
        }

        return null
    }

    private fun loadFromPrefs(context: Context): Map<String, String> {
        val raw = context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_MAP_JSON, null)
            ?: return emptyMap()

        val parsed = mutableMapOf<String, String>()
        try {
            val root = JSONObject(raw)
            val keys = root.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val value = root.optString(key, "").trim()
                if (key.isNotBlank() && value.isNotEmpty()) {
                    parsed[key] = value
                }
            }
        } catch (_: Exception) {
            return emptyMap()
        }

        memoryMap = parsed
        return parsed
    }
}
