package co.voxo.android.notifications.activities

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import co.voxo.android.MainActivity
import co.voxo.android.notifications.VoxoConnectIncomingCallBroadcastReceiver
import io.wazo.callkeep.Constants.EXTRA_CALL_UUID

/**
 * User-tap trampoline for CallStyle / heads-up Answer.
 *
 * Must run over the lock screen: Samsung One UI 8 / Android 16 otherwise rewrites
 * the tap to "open MainActivity" without delivering ANSWER.
 *
 * Sends ANSWER immediately, then waits for SIP 200 OK ([ACTION_UPDATE_UI]) before
 * starting MainActivity so headless JS is not killed mid-accept.
 */
class AnswerTrampolineActivity : AppCompatActivity() {
    private var callUuid: String? = null
    private var launched = false
    private val handler = Handler(Looper.getMainLooper())
    private val timeoutRunnable = Runnable { launchMainActivityIfNeeded("timeout") }

    private val answeredReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val uuid = intent?.getStringExtra(EXTRA_CALL_UUID)
                ?: intent?.getStringExtra("CALL_UUID")
            if (callUuid != null && uuid != null && uuid != callUuid) return
            when (intent?.action) {
                "ACTION_UPDATE_UI" -> launchMainActivityIfNeeded("sip_answered")
                "ACTION_INCOMING_CALL_CANCELLED" -> {
                    if (!launched) finish()
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableLockScreen()
        callUuid = intent.getStringExtra(EXTRA_CALL_UUID) ?: intent.getStringExtra("CALL_UUID")
        val action = intent.getStringExtra("actionPerformed") ?: "ANSWER"
        if (callUuid == null) {
            finish()
            return
        }

        LocalBroadcastManager.getInstance(this).registerReceiver(
            answeredReceiver,
            IntentFilter().apply {
                addAction("ACTION_UPDATE_UI")
                addAction("ACTION_INCOMING_CALL_CANCELLED")
            }
        )

        sendAnswerBroadcast(callUuid!!, action)
        dismissKeyguard()
        handler.postDelayed(timeoutRunnable, SIP_ANSWER_WAIT_MS)
    }

    private fun enableLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    private fun dismissKeyguard() {
        val km = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && km.isDeviceLocked) {
            km.requestDismissKeyguard(this, null)
        }
    }

    private fun sendAnswerBroadcast(uuid: String, action: String) {
        val broadcast = Intent(this, VoxoConnectIncomingCallBroadcastReceiver::class.java)
            .putExtra("CALL_UUID", uuid)
            .putExtra(EXTRA_CALL_UUID, uuid)
            .putExtra("actionPerformed", action)
            .putExtra("FROM_HEADS_UP_BUTTON", true)
            .setFlags(Intent.FLAG_RECEIVER_FOREGROUND)
        sendBroadcast(broadcast)
    }

    private fun launchMainActivityIfNeeded(reason: String) {
        if (launched) return
        launched = true
        handler.removeCallbacks(timeoutRunnable)
        val uuid = callUuid
        if (uuid == null) {
            finish()
            return
        }
        Log.d(TAG, "launchMainActivity reason=$reason uuid=$uuid")
        val i = Intent(this, MainActivity::class.java)
        i.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        )
        i.putExtra("LAUNCH_FROM_ANSWER", true)
        i.putExtra("CALL_UUID", uuid)
        startActivity(i)
        finish()
    }

    override fun onDestroy() {
        handler.removeCallbacks(timeoutRunnable)
        try {
            LocalBroadcastManager.getInstance(this).unregisterReceiver(answeredReceiver)
        } catch (_: Exception) {
        }
        super.onDestroy()
    }

    companion object {
        private const val TAG = "VoxoConnect:AnswerTrampoline"
        private const val SIP_ANSWER_WAIT_MS = 12_000L
    }
}
