package co.voxo.android

import android.os.Bundle
import android.util.Log

object VoxoVoipPushStale {
    private const val TAG = "VoxoVoipPushStale"
    private const val DEFAULT_MAX_AGE_MS = 15_000L

    fun parseSentAtMs(bundle: Bundle?): Long? {
        if (bundle == null) return null
        return parseSentAtString(bundle.getString("sentAt"))
            ?: parseSentAtString(bundle.getString("payload_sentAt"))
    }

    private fun parseSentAtString(raw: String?): Long? {
        if (raw.isNullOrBlank()) return null
        return try {
            raw.trim().toLong()
        } catch (_: NumberFormatException) {
            null
        }
    }

    fun isStale(bundle: Bundle?, maxAgeMs: Long = DEFAULT_MAX_AGE_MS): Boolean {
        val sentAt = parseSentAtMs(bundle) ?: return false
        val ageMs = (System.currentTimeMillis() - sentAt).coerceAtLeast(0)
        return ageMs > maxAgeMs
    }

    fun logAndIsStale(
        bundle: Bundle?,
        callUuid: String?,
        source: String,
        maxAgeMs: Long = DEFAULT_MAX_AGE_MS
    ): Boolean {
        val sentAt = parseSentAtMs(bundle) ?: return false
        val ageMs = (System.currentTimeMillis() - sentAt).coerceAtLeast(0)
        if (ageMs > maxAgeMs) {
            Log.i(
                TAG,
                "STALE VoIP push source=$source uuid=${callUuid ?: "(nil)"} ageMs=$ageMs sentAt=$sentAt"
            )
            return true
        }
        return false
    }
}
