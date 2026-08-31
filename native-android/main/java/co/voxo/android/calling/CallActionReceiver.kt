package co.voxo.android.calling

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Handles Answer / Decline / Hang up taps from call notifications. Every action carries
 * the specific callId so it only affects that one call.
 */
class CallActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val callId = intent.getStringExtra(EXTRA_CALL_ID) ?: return
        when (intent.action) {
            ACTION_ANSWER -> {
                VoxoLinphoneManager.ensureStarted(context.applicationContext)
                VoxoLinphoneManager.accept(callId)
            }
            ACTION_DECLINE -> {
                VoxoLinphoneManager.ensureStarted(context.applicationContext)
                VoxoLinphoneManager.decline(callId)
            }
            ACTION_HANGUP -> {
                VoxoLinphoneManager.ensureStarted(context.applicationContext)
                VoxoLinphoneManager.hangup(callId)
            }
            else -> Log.w(TAG, "Unknown action ${intent.action}")
        }
    }

    companion object {
        const val TAG = "CallActionReceiver"
        const val EXTRA_CALL_ID = "callId"
        const val ACTION_ANSWER = "co.voxo.android.calling.ANSWER"
        const val ACTION_DECLINE = "co.voxo.android.calling.DECLINE"
        const val ACTION_HANGUP = "co.voxo.android.calling.HANGUP"
    }
}
