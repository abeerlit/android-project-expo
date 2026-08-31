package co.voxo.android.notifications

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import io.wazo.callkeep.Constants.EXTRA_CALL_UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Schedules an automatic "reject" after [INCOMING_NO_ANSWER_TIMEOUT_MS] if the user does not
 * answer, mirroring a manual REJECT broadcast to [VoxoConnectIncomingCallBroadcastReceiver].
 */
object IncomingCallAutoDecline {
    private const val TAG = "IncomingCallAutoDecline"

    const val INCOMING_NO_ANSWER_TIMEOUT_MS = 20000L

    private val handler = Handler(Looper.getMainLooper())
    private val runnables = ConcurrentHashMap<String, Runnable>()
    private val terminalUuids = ConcurrentHashMap.newKeySet<String>()

    /** Call when the call is answered, rejected, ended, or cancelled so auto-decline does not fire. */
    fun markTerminal(callUuid: String) {
        terminalUuids.add(callUuid)
    }

    fun isTerminal(callUuid: String): Boolean = terminalUuids.contains(callUuid)

    fun cancel(callUuid: String) {
        val r = runnables.remove(callUuid)
        if (r != null) {
            handler.removeCallbacks(r)
            Log.d(TAG, "cancel: $callUuid")
        }
    }

    /**
     * Schedule auto-decline for this incoming [callUuid]. Resets any previous timer for the same UUID
     * (e.g. duplicate notification post).
     */
    fun schedule(context: Context, callUuid: String) {
        if (terminalUuids.contains(callUuid)) {
            Log.d(TAG, "schedule: skip (terminal) $callUuid")
            return
        }
        cancel(callUuid)
        val appContext = context.applicationContext
        val runnable = Runnable {
            runnables.remove(callUuid)
            if (terminalUuids.contains(callUuid)) {
                Log.d(TAG, "auto-decline: skip (terminal) $callUuid")
                return@Runnable
            }
            Log.i(TAG, "auto-decline: sending REJECT for $callUuid")
            markTerminal(callUuid)
            try {
                val intent = Intent(appContext, VoxoConnectIncomingCallBroadcastReceiver::class.java).apply {
                    putExtra(EXTRA_CALL_UUID, callUuid)
                    putExtra("CALL_UUID", callUuid)
                    putExtra("actionPerformed", "REJECT")
                    putExtra("FROM_AUTO_DECLINE_TIMEOUT", true)
                    setFlags(Intent.FLAG_RECEIVER_FOREGROUND)
                }
                appContext.sendBroadcast(intent)
            } catch (e: Exception) {
                Log.e(TAG, "auto-decline: sendBroadcast FAILED", e)
            }
        }
        runnables[callUuid] = runnable
        handler.postDelayed(runnable, INCOMING_NO_ANSWER_TIMEOUT_MS)
        Log.d(TAG, "schedule: $callUuid in ${INCOMING_NO_ANSWER_TIMEOUT_MS}ms")
    }
}
