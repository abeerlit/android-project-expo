package co.voxo.android.calling

import android.content.Context
import org.json.JSONObject

/**
 * Local cache of caller name + avatar keyed by phone number (last 10 digits), so the
 * native incoming/active call UI can show contact info without any JS being alive.
 * Provisioned from the JS directory via the VoxoCalling bridge (syncCallContacts).
 */
object VoxoCallContactPrefs {
    private const val PREFS = "voxo_call_contacts"
    private const val KEY_MAP = "contacts_json"

    data class ContactInfo(val name: String, val avatarUri: String?)

    private fun normalize(number: String): String {
        val digits = number.filter { it.isDigit() }
        return if (digits.length >= 10) digits.takeLast(10) else digits
    }

    fun save(context: Context, json: String) {
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_MAP, json)
            .apply()
    }

    fun lookup(context: Context, number: String): ContactInfo? {
        val raw = context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_MAP, null) ?: return null
        return try {
            val root = JSONObject(raw)
            val key = normalize(number)
            val obj = root.optJSONObject(key) ?: return null
            ContactInfo(
                name = obj.optString("name", number),
                avatarUri = obj.optString("avatarUri", "").ifEmpty { null }
            )
        } catch (_: Exception) {
            null
        }
    }

    /** Returns the full contacts map for the native picker. */
    fun allContacts(context: Context): JSONObject {
        val raw = context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_MAP, null) ?: return JSONObject()
        return try {
            JSONObject(raw)
        } catch (_: Exception) {
            JSONObject()
        }
    }
}
