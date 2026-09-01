package co.voxo.android.calling

import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Single in-memory record of every call the native stack knows about, split into
 * "unhandled" (ringing inbound / dialing outbound) and "active" (answered) buckets.
 *
 * Each call gets its own notification id so declining/ending one call never affects
 * another. Listeners (the RN bridge for the banner, the call UI) are notified on
 * every change.
 */
object CallSessionRegistry {

    enum class Bucket { UNHANDLED, ACTIVE }

    data class CallEntry(
        val callId: String,
        var displayName: String,
        var number: String,
        var bucket: Bucket,
        var state: String,
        var direction: String, // "incoming" | "outgoing"
        var avatarUri: String? = null,
        var muted: Boolean = false,
        var onHold: Boolean = false,
        var speaker: Boolean = false,
        var startedAt: Long = System.currentTimeMillis(),
        var answeredAt: Long? = null,
        val notificationId: Int
    )

    private const val NOTIFICATION_ID_MIN = 30000
    private const val NOTIFICATION_ID_MAX = 32767

    private val sessions = ConcurrentHashMap<String, CallEntry>()
    private val listeners = mutableSetOf<() -> Unit>()

    @Volatile
    private var activeCallId: String? = null

    @Volatile
    private var registered: Boolean = false

    @Volatile
    private var nextNotificationId = NOTIFICATION_ID_MIN

    @Synchronized
    private fun allocateNotificationId(): Int {
        val id = nextNotificationId
        nextNotificationId = if (id >= NOTIFICATION_ID_MAX) NOTIFICATION_ID_MIN else id + 1
        return id
    }

    fun setRegistered(value: Boolean) {
        if (registered == value) return
        registered = value
        notifyChanged()
    }

    fun isRegistered(): Boolean = registered

    fun upsertUnhandled(
        callId: String,
        displayName: String,
        number: String,
        direction: String,
        avatarUri: String? = null
    ): CallEntry {
        val existing = sessions[callId]
        if (existing != null) {
            existing.displayName = displayName
            existing.number = number
            existing.direction = direction
            if (avatarUri != null) existing.avatarUri = avatarUri
            notifyChanged()
            return existing
        }
        val entry = CallEntry(
            callId = callId,
            displayName = displayName,
            number = number,
            bucket = Bucket.UNHANDLED,
            state = if (direction == "incoming") "incoming" else "outgoing",
            direction = direction,
            avatarUri = avatarUri,
            notificationId = allocateNotificationId()
        )
        sessions[callId] = entry
        notifyChanged()
        return entry
    }

    fun promoteToActive(callId: String) {
        val entry = sessions[callId] ?: return
        entry.bucket = Bucket.ACTIVE
        entry.state = "connected"
        if (entry.answeredAt == null) entry.answeredAt = System.currentTimeMillis()
        activeCallId = callId
        notifyChanged()
    }

    fun updateState(callId: String, state: String) {
        val entry = sessions[callId] ?: return
        entry.state = state
        notifyChanged()
    }

    fun setMuted(callId: String, muted: Boolean) {
        sessions[callId]?.let { it.muted = muted; notifyChanged() }
    }

    fun setOnHold(callId: String, onHold: Boolean) {
        sessions[callId]?.let { it.onHold = onHold; notifyChanged() }
    }

    fun setSpeaker(callId: String, speaker: Boolean) {
        sessions[callId]?.let { it.speaker = speaker; notifyChanged() }
    }

    fun setActiveCallId(callId: String?) {
        if (activeCallId == callId) return
        activeCallId = callId
        notifyChanged()
    }

    /**
     * Linphone may report a provisional key (sip URI) before the stable call-log id exists.
     * Re-key the session in place so we keep one notification id per call.
     */
    fun migrateKey(fromId: String, toId: String) {
        if (fromId == toId) return
        val entry = sessions.remove(fromId) ?: return
        val existing = sessions[toId]
        if (existing != null) {
            sessions[toId] = existing
            notifyChanged()
            return
        }
        sessions[toId] = entry.copy(callId = toId)
        if (activeCallId == fromId) activeCallId = toId
        notifyChanged()
    }

    fun remove(callId: String) {
        if (sessions.remove(callId) == null) return
        if (activeCallId == callId) {
            activeCallId = sessions.values.firstOrNull { it.bucket == Bucket.ACTIVE }?.callId
        }
        notifyChanged()
    }

    /** Remove every session matching [number] (cleans orphaned provisional keys). */
    fun removeAllForNumber(number: String) {
        val toRemove = sessions.values.filter { it.number == number }.map { it.callId }
        if (toRemove.isEmpty()) return
        for (id in toRemove) sessions.remove(id)
        if (activeCallId != null && !sessions.containsKey(activeCallId)) {
            activeCallId = sessions.values.firstOrNull { it.bucket == Bucket.ACTIVE }?.callId
        }
        notifyChanged()
    }

    fun get(callId: String): CallEntry? = sessions[callId]

    fun all(): List<CallEntry> = sessions.values.toList()

    fun byBucket(bucket: Bucket): List<CallEntry> =
        sessions.values.filter { it.bucket == bucket }

    fun activeCall(): CallEntry? = activeCallId?.let { sessions[it] }

    fun size(): Int = sessions.size

    fun clear() {
        sessions.clear()
        activeCallId = null
        notifyChanged()
    }

    // ── Listeners ─────────────────────────────────────────────────────────

    fun addListener(listener: () -> Unit) {
        synchronized(listeners) { listeners.add(listener) }
    }

    fun removeListener(listener: () -> Unit) {
        synchronized(listeners) { listeners.remove(listener) }
    }

    private fun notifyChanged() {
        val snapshot = synchronized(listeners) { listeners.toList() }
        for (l in snapshot) {
            try {
                l()
            } catch (_: Exception) {
            }
        }
    }

    // ── Serialization (for the RN bridge / banner) ────────────────────────

    private fun entryToJson(e: CallEntry): JSONObject = JSONObject().apply {
        put("callId", e.callId)
        put("displayName", e.displayName)
        put("number", e.number)
        put("bucket", if (e.bucket == Bucket.ACTIVE) "active" else "unhandled")
        put("state", e.state)
        put("direction", e.direction)
        put("avatarUri", e.avatarUri ?: JSONObject.NULL)
        put("muted", e.muted)
        put("onHold", e.onHold)
        put("speaker", e.speaker)
        put("startedAt", e.startedAt)
        put("answeredAt", e.answeredAt ?: JSONObject.NULL)
        put("notificationId", e.notificationId)
    }

    fun snapshotJson(): JSONObject {
        val unhandled = JSONArray()
        val active = JSONArray()
        for (e in sessions.values) {
            if (e.bucket == Bucket.ACTIVE) active.put(entryToJson(e)) else unhandled.put(entryToJson(e))
        }
        return JSONObject().apply {
            put("isRegistered", registered)
            put("activeCallId", activeCallId ?: JSONObject.NULL)
            put("unhandled", unhandled)
            put("active", active)
        }
    }
}
