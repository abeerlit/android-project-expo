package co.voxo.android.notifications.activities

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.telecom.Connection
import android.telecom.TelecomManager
import android.util.Log
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import co.voxo.android.MainActivity
import co.voxo.android.R
import co.voxo.android.notifications.VoxoConnectIncomingCallBroadcastReceiver
import io.wazo.callkeep.Constants
import io.wazo.callkeep.VoiceConnection
import io.wazo.callkeep.VoiceConnectionService
import java.util.HashMap
import kotlin.collections.HashMap as KotlinHashMap

/**
 * Full-screen activity for incoming calls when app is killed.
 * Shows Answer/Reject UI, works on lock screen.
 */
class IncomingCallFullScreenActivity : AppCompatActivity() {
    private lateinit var answerButton: Button
    private lateinit var answerButtonIcon: ImageView
    private lateinit var answerButtonLabel: TextView

    private lateinit var rejectButton: Button
    private lateinit var rejectButtonIcon: ImageView
    private lateinit var rejectButtonLabel: TextView

    private lateinit var callerNameText: TextView
    private lateinit var callerNumberText: TextView

    private lateinit var voxoMobileLogo: LinearLayout

    private lateinit var mScreenWakeLock: PowerManager.WakeLock
    private val localBroadcastManager by lazy { LocalBroadcastManager.getInstance(this) }
    private var telecomReceiver: BroadcastReceiver = TelecomBroadcastReceiver()
    private var currentCallUuid: String? = null
    @Volatile private var isAnswering: Boolean = false
    @Volatile private var hasLaunchedMain: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(null)
        Log.d(TAG, "onCreate")

        with(getSystemService(Context.POWER_SERVICE) as PowerManager) {
            mScreenWakeLock = newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
                "ring:incoming:call:lock"
            )
            mScreenWakeLock.setReferenceCounted(false)
            if (!mScreenWakeLock.isHeld) {
                mScreenWakeLock.acquire()
            }
        }

        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                or WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            window.addFlags(
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    or WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
            )
        }

        setContentView(R.layout.incoming_call_ringer_screen)

        voxoMobileLogo = findViewById(R.id.voxomobile_logo_container)
        callerNameText = findViewById(R.id.caller_name)
        callerNumberText = findViewById(R.id.caller_number)

        answerButton = findViewById(R.id.answer_button)
        answerButtonIcon = findViewById(R.id.answer_button_icon)
        answerButtonLabel = findViewById(R.id.answer_button_label)

        rejectButton = findViewById(R.id.reject_button)
        rejectButtonIcon = findViewById(R.id.reject_button_icon)
        rejectButtonLabel = findViewById(R.id.reject_button_label)

        // Setup held calls RecyclerView with empty adapter (no held calls in kill-state flow)
        findViewById<RecyclerView>(R.id.held_call_items).apply {
            layoutManager = LinearLayoutManager(this@IncomingCallFullScreenActivity)
            adapter = object : RecyclerView.Adapter<RecyclerView.ViewHolder>() {
                override fun getItemCount() = 0
                override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int) =
                    object : RecyclerView.ViewHolder(android.view.View(parent.context)) {}
                override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {}
            }
        }

        currentActivity = this

        // Register telecom broadcast receiver
        val intentFilter = IntentFilter().apply {
            addAction(Constants.ACTION_SHOW_INCOMING_CALL_UI)
            addAction(Constants.ACTION_END_CALL)
            addAction(Constants.ACTION_ANSWER_CALL)
            addAction(Constants.ACTION_ONGOING_CALL)
            addAction("ACTION_UPDATE_UI")
            addAction("ACTION_INCOMING_CALL_CANCELLED")
        }
        localBroadcastManager.registerReceiver(telecomReceiver, intentFilter)

        val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        if (!keyguardManager.isDeviceLocked) {
            hideSystemUI()
        } else {
            Log.d(TAG, "Device is locked - skipping immersive hideSystemUI to avoid black-screen lockscreen issues")
        }
        processLaunchIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        processLaunchIntent(intent)
    }

    private fun processLaunchIntent(launchIntent: Intent?) {
        if (launchIntent == null) return

        val callUuid = launchIntent.getStringExtra("CALL_UUID")
        val callerName = launchIntent.getStringExtra("CALLER_NAME") ?: "Unknown"
        val callerNumber = launchIntent.getStringExtra("CALLER_NUMBER") ?: ""

        if (callUuid != null) {
            currentCallUuid = callUuid
            callerNameText.text = callerName
            callerNumberText.text = callerNumber
            val secondLine = launchIntent.getBooleanExtra("SECOND_LINE_MODE", false)
            setupAnswerRejectButtons(callUuid, callerName, callerNumber, secondLine)
        }
    }

    private fun setupAnswerRejectButtons(
        callUuid: String?,
        callerName: String,
        callerNumber: String,
        secondLine: Boolean = false
    ) {
        if (callUuid == null) return

        answerButton.visibility = View.VISIBLE
        answerButtonIcon.visibility = View.VISIBLE
        answerButtonLabel.visibility = View.VISIBLE
        answerButtonLabel.text = if (secondLine) {
            getString(R.string.button_text_end_accept_button)
        } else {
            getString(R.string.button_text_accept_button)
        }
        answerButton.setOnClickListener {
            Log.d(TAG, if (secondLine) "END_AND_ACCEPT" else "ANSWER")
            if (secondLine) {
                handleEndAndAccept(callUuid)
            } else {
                handleAnswer(callUuid)
            }
        }

        rejectButton.visibility = View.VISIBLE
        rejectButtonIcon.visibility = View.VISIBLE
        rejectButtonLabel.visibility = View.VISIBLE
        rejectButtonLabel.text = "Decline"
        rejectButtonIcon.setImageResource(R.drawable.ic_decline_call)
        rejectButton.setOnClickListener {
            Log.d(TAG, "REJECT")
            sendCallBroadcast(callUuid, "REJECT")
            finish()
        }
    }

    private fun hideSystemUI() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let {
                it.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
        }
    }

    private fun handleEndAndAccept(callUuid: String) {
        if (isAnswering) {
            Log.d(TAG, "END_AND_ACCEPT ignored - already processing for $callUuid")
            return
        }
        isAnswering = true
        answerButton.isEnabled = false
        rejectButton.isEnabled = false
        sendCallBroadcast(callUuid, "END_AND_ACCEPT")
        val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        if (keyguardManager.isDeviceLocked) {
            keyguardManager.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
                override fun onDismissError() {
                    Log.d(TAG, "END_AND_ACCEPT onDismissError — staying until SIP answers")
                }
                override fun onDismissCancelled() {
                    Log.d(TAG, "END_AND_ACCEPT onDismissCancelled — staying until SIP answers")
                }
            })
        }
        Handler(Looper.getMainLooper()).postDelayed({
            if (isAnswering && !hasLaunchedMain) {
                Log.d(TAG, "END_AND_ACCEPT timeout — launching MainActivity")
                launchMainActivity(callUuid)
                finish()
            }
        }, 12_000)
    }

    private fun handleAnswer(callUuid: String) {
        if (isAnswering) {
            Log.d(TAG, "ANSWER ignored - already processing for $callUuid")
            return
        }
        isAnswering = true
        answerButton.isEnabled = false
        rejectButton.isEnabled = false
        sendCallBroadcast(callUuid, "ANSWER")

        val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        if (keyguardManager.isDeviceLocked) {
            keyguardManager.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
                override fun onDismissError() {
                    Log.d(TAG, "onDismissError — staying on incoming UI until SIP answers")
                }
                override fun onDismissCancelled() {
                    Log.d(TAG, "onDismissCancelled — staying on incoming UI until SIP answers")
                }
            })
        }
        Handler(Looper.getMainLooper()).postDelayed({
            if (isAnswering && !hasLaunchedMain) {
                Log.d(TAG, "ANSWER timeout — launching MainActivity")
                launchMainActivity(callUuid)
                finish()
            }
        }, 12_000)
    }

    fun launchMainActivity(callUuid: String? = currentCallUuid) {
        if (hasLaunchedMain) return
        hasLaunchedMain = true
        isAnswering = false
        val activityIntent = Intent(this, MainActivity::class.java)
        activityIntent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        )
        if (callUuid != null) {
            activityIntent.putExtra("LAUNCH_FROM_ANSWER", true)
            activityIntent.putExtra("CALL_UUID", callUuid)
        }
        startActivity(activityIntent)
    }

    private fun sendCallBroadcast(callUuid: String, action: String) {
        val intent = Intent(this, VoxoConnectIncomingCallBroadcastReceiver::class.java)
            .putExtra("CALL_UUID", callUuid)
            .putExtra("actionPerformed", action)
            .putExtra("IS_FULLSCREEN_ACTIVITY", true)
            .setFlags(Intent.FLAG_RECEIVER_FOREGROUND)
        sendBroadcast(intent)
    }

    inner class TelecomBroadcastReceiver : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val attributeMap = intent.getSerializableExtra("attributeMap") as? KotlinHashMap<String, String>

            when (intent.action) {
                Constants.ACTION_SHOW_INCOMING_CALL_UI -> {
                    if (attributeMap != null) {
                        val uuid = attributeMap[Constants.EXTRA_CALL_UUID]
                        val number = attributeMap[Constants.EXTRA_CALL_NUMBER]
                        val name = attributeMap[Constants.EXTRA_CALLER_NAME]
                        Log.d(TAG, "ACTION_SHOW_INCOMING_CALL_UI: $uuid $name $number")
                        if (uuid != null && name != null && number != null) {
                            callerNameText.text = name
                            callerNumberText.text = number
                            setupAnswerRejectButtons(uuid, name, number)
                        }
                    }
                }
                "ACTION_INCOMING_CALL_CANCELLED" -> {
                    if (VoiceConnectionService.currentConnections.isEmpty()) {
                        Log.d(TAG, "ACTION_INCOMING_CALL_CANCELLED, ending activity")
                        finish()
                    }
                }
                "ACTION_UPDATE_UI" -> {
                    Log.d(TAG, "ACTION_UPDATE_UI isAnswering=$isAnswering")
                    if (isAnswering) {
                        launchMainActivity()
                    }
                    finish()
                }
                Constants.ACTION_END_CALL -> {
                    if (VoiceConnectionService.currentConnections.isEmpty()) {
                        Log.d(TAG, "ACTION_END_CALL, ending activity")
                        finish()
                    }
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        if (!mScreenWakeLock.isHeld) {
            mScreenWakeLock.acquire()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "onDestroy")
        try {
            localBroadcastManager.unregisterReceiver(telecomReceiver)
        } catch (_: Exception) {}
        if (mScreenWakeLock.isHeld) {
            mScreenWakeLock.release()
        }
        currentActivity = null
    }

    companion object {
        private const val TAG = "VoxoConnect:IncomingCallAct"
        var currentActivity: IncomingCallFullScreenActivity? = null
    }
}
