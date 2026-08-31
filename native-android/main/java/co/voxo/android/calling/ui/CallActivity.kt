package co.voxo.android.calling.ui

import android.app.AlertDialog
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import co.voxo.android.R
import co.voxo.android.calling.CallSessionRegistry
import co.voxo.android.calling.VoxoLinphoneManager
import java.util.Locale

/**
 * Native in-call UI (separate task via taskAffinity). Mirrors the active call from the
 * registry and drives mute/speaker/hold/transfer/add/end through the Linphone Core.
 */
class CallActivity : AppCompatActivity() {

    private var callId: String? = null
    private val handler = Handler(Looper.getMainLooper())

    private val registryListener: () -> Unit = {
        handler.post { render() }
    }

    private val timerRunnable = object : Runnable {
        override fun run() {
            updateTimer()
            handler.postDelayed(this, 1000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
        setContentView(R.layout.native_active_call)
        callId = intent.getStringExtra("callId")
        wireButtons()
        CallSessionRegistry.addListener(registryListener)
        render()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.getStringExtra("callId")?.let { callId = it }
        render()
    }

    override fun onResume() {
        super.onResume()
        handler.post(timerRunnable)
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(timerRunnable)
    }

    private fun currentEntry(): CallSessionRegistry.CallEntry? {
        val id = callId ?: return null
        return CallSessionRegistry.get(id)
            ?: CallSessionRegistry.activeCall()
    }

    private fun wireButtons() {
        findViewById<ImageView>(R.id.btn_mute).setOnClickListener {
            val e = currentEntry() ?: return@setOnClickListener
            VoxoLinphoneManager.setMuted(e.callId, !e.muted)
        }
        findViewById<ImageView>(R.id.btn_speaker).setOnClickListener {
            val e = currentEntry() ?: return@setOnClickListener
            VoxoLinphoneManager.setSpeaker(e.callId, !e.speaker)
        }
        findViewById<ImageView>(R.id.btn_hold).setOnClickListener {
            val e = currentEntry() ?: return@setOnClickListener
            VoxoLinphoneManager.setHold(e.callId, !e.onHold)
        }
        findViewById<ImageView>(R.id.btn_add).setOnClickListener {
            startActivity(
                Intent(this, DialerActivity::class.java).apply {
                    putExtra("mode", "secondCall")
                }
            )
        }
        findViewById<ImageView>(R.id.btn_transfer).setOnClickListener {
            val e = currentEntry() ?: return@setOnClickListener
            startActivity(
                Intent(this, ContactPickerActivity::class.java).apply {
                    putExtra("mode", "transfer")
                    putExtra("callId", e.callId)
                }
            )
        }
        findViewById<ImageView>(R.id.btn_keypad).setOnClickListener {
            showDtmfDialog()
        }
        findViewById<ImageView>(R.id.call_end_button).setOnClickListener {
            val e = currentEntry()
            if (e != null) VoxoLinphoneManager.hangup(e.callId)
            finishAndRemoveTask()
        }
    }

    private fun render() {
        val entry = currentEntry()
        if (entry == null) {
            finishAndRemoveTask()
            return
        }
        callId = entry.callId
        findViewById<TextView>(R.id.call_name).text = entry.displayName
        findViewById<TextView>(R.id.call_status).text = statusText(entry)
        entry.avatarUri?.let { loadAvatar(it) }
        renderHeldCalls(entry.callId)
    }

    private fun statusText(entry: CallSessionRegistry.CallEntry): String {
        return when {
            entry.state == "outgoing" -> "Calling…"
            entry.onHold -> "On hold"
            entry.answeredAt != null -> elapsed(entry.answeredAt!!)
            else -> "Connecting…"
        }
    }

    private fun updateTimer() {
        val entry = currentEntry() ?: return
        if (entry.answeredAt != null && !entry.onHold && entry.state == "connected") {
            findViewById<TextView>(R.id.call_status).text = elapsed(entry.answeredAt!!)
        }
    }

    private fun elapsed(since: Long): String {
        val secs = ((System.currentTimeMillis() - since) / 1000).coerceAtLeast(0)
        return String.format(Locale.US, "%02d:%02d", secs / 60, secs % 60)
    }

    private fun renderHeldCalls(activeId: String) {
        val container =
            findViewById<android.widget.LinearLayout>(R.id.held_calls_container)
        container.removeAllViews()
        val others = CallSessionRegistry
            .byBucket(CallSessionRegistry.Bucket.ACTIVE)
            .filter { it.callId != activeId }
        for (other in others) {
            val tv = TextView(this).apply {
                text = "On hold: ${other.displayName}"
                setTextColor(0xCCFFFFFF.toInt())
                textSize = 14f
                setOnClickListener { switchTo(other.callId) }
            }
            container.addView(tv)
        }
    }

    private fun switchTo(otherId: String) {
        val current = callId
        if (current != null) VoxoLinphoneManager.setHold(current, true)
        VoxoLinphoneManager.setHold(otherId, false)
        callId = otherId
        CallSessionRegistry.setActiveCallId(otherId)
        render()
    }

    private fun showDtmfDialog() {
        val input = EditText(this).apply {
            inputType = android.text.InputType.TYPE_CLASS_PHONE
            hint = "Digits"
        }
        AlertDialog.Builder(this)
            .setTitle("Send tones")
            .setView(input)
            .setPositiveButton("Send") { _, _ ->
                val e = currentEntry() ?: return@setPositiveButton
                input.text.toString().forEach {
                    VoxoLinphoneManager.sendDtmf(e.callId, it)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun loadAvatar(uri: String) {
        try {
            val imageView = findViewById<ImageView>(R.id.call_avatar)
            contentResolver.openInputStream(Uri.parse(uri))?.use { stream ->
                BitmapFactory.decodeStream(stream)?.let { imageView.setImageBitmap(it) }
            }
        } catch (_: Exception) {
        }
    }

    override fun onDestroy() {
        CallSessionRegistry.removeListener(registryListener)
        handler.removeCallbacks(timerRunnable)
        super.onDestroy()
    }
}
