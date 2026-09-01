package co.voxo.android.notifications.activities

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import co.voxo.android.MainActivity
import co.voxo.android.notifications.VoxoConnectIncomingCallBroadcastReceiver
import io.wazo.callkeep.Constants.EXTRA_CALL_UUID

/**
 * Trampoline for heads-up Answer button. Workaround for Android 10+ background activity
 * restriction: starting an Activity from a BroadcastReceiver is blocked. This Activity
 * is launched directly by the user's tap (allowed), then starts MainActivity.
 */
class AnswerTrampolineActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val callUuid = intent.getStringExtra(EXTRA_CALL_UUID) ?: intent.getStringExtra("CALL_UUID")
        if (callUuid != null) {
            sendAnswerBroadcast(callUuid)
            launchMainActivity(callUuid)
        }
        finish()
    }

    private fun sendAnswerBroadcast(callUuid: String) {
        val broadcast = Intent(this, VoxoConnectIncomingCallBroadcastReceiver::class.java)
            .putExtra("CALL_UUID", callUuid)
            .putExtra("actionPerformed", "ANSWER")
            .putExtra("FROM_HEADS_UP_BUTTON", true)
            .setFlags(Intent.FLAG_RECEIVER_FOREGROUND)
        sendBroadcast(broadcast)
    }

    private fun launchMainActivity(callUuid: String) {
        val i = Intent(this, MainActivity::class.java)
        i.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        )
        i.putExtra("LAUNCH_FROM_ANSWER", true)
        i.putExtra("CALL_UUID", callUuid)
        startActivity(i)
    }
}
