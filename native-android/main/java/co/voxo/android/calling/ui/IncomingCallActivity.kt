package co.voxo.android.calling.ui

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import co.voxo.android.R
import co.voxo.android.calling.CallSessionRegistry
import co.voxo.android.calling.VoxoLinphoneManager

/**
 * Full-screen incoming-call UI shown over the lock screen for inbound calls in any state.
 * Accept/decline drive the Linphone Core directly via VoxoLinphoneManager.
 */
class IncomingCallActivity : AppCompatActivity() {

    private var callId: String? = null

    private val callEndedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.getStringExtra("callId") == callId) {
                finishAndRemoveTask()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showWhenLockedAndTurnScreenOn()
        setContentView(R.layout.native_incoming_call)

        callId = intent.getStringExtra("callId")
        bindCallInfo()

        findViewById<ImageView>(R.id.incoming_accept_button).setOnClickListener {
            callId?.let { VoxoLinphoneManager.accept(it) }
            launchCallActivity()
            finish()
        }
        findViewById<ImageView>(R.id.incoming_decline_button).setOnClickListener {
            callId?.let { VoxoLinphoneManager.decline(it) }
            finishAndRemoveTask()
        }

        ContextCompat.registerReceiver(
            this,
            callEndedReceiver,
            IntentFilter(VoxoLinphoneManager.ACTION_CALL_ENDED),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        callId = intent.getStringExtra("callId")
        bindCallInfo()
    }

    private fun bindCallInfo() {
        val entry = callId?.let { CallSessionRegistry.get(it) }
        val name = entry?.displayName
            ?: intent.getStringExtra("displayName")
            ?: "Incoming call"
        val number = entry?.number ?: intent.getStringExtra("number") ?: ""
        val avatarUri = entry?.avatarUri ?: intent.getStringExtra("avatarUri")

        findViewById<TextView>(R.id.incoming_caller_name).text = name
        findViewById<TextView>(R.id.incoming_caller_number).text = number
        avatarUri?.let { loadAvatar(it) }
    }

    private fun loadAvatar(uri: String) {
        try {
            val imageView = findViewById<ImageView>(R.id.incoming_avatar)
            contentResolver.openInputStream(Uri.parse(uri))?.use { stream ->
                val bmp = BitmapFactory.decodeStream(stream)
                if (bmp != null) imageView.setImageBitmap(bmp)
            }
        } catch (_: Exception) {
        }
    }

    private fun launchCallActivity() {
        val id = callId ?: return
        startActivity(
            Intent(this, CallActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                putExtra("callId", id)
            }
        )
    }

    private fun showWhenLockedAndTurnScreenOn() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val km = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
            km?.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }
    }

    override fun onDestroy() {
        try {
            unregisterReceiver(callEndedReceiver)
        } catch (_: Exception) {
        }
        super.onDestroy()
    }
}
