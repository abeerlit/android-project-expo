package co.voxo.android.headlessTasks

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.jstasks.HeadlessJsTaskEventListener
import com.facebook.react.modules.core.JavaTimerManager
import com.facebook.react.ReactInstanceManager
import co.voxo.android.LaunchFromAnswerCleanup
import co.voxo.android.MainApplication
import co.voxo.android.R
import co.voxo.android.VoxoConnectFirebaseService
import co.voxo.android.VoxoVoipPushStale
import co.voxo.android.notifications.IncomingCallAutoDecline
import co.voxo.android.notifications.IncomingCallRingtonePlayer
import co.voxo.android.notifications.VoxoConnectIncomingCallBroadcastReceiver
import co.voxo.android.notifications.activities.AnswerTrampolineActivity
import co.voxo.android.notifications.activities.IncomingCallFullScreenActivity
import io.wazo.callkeep.Constants.EXTRA_CALL_NUMBER
import io.wazo.callkeep.Constants.EXTRA_CALLER_NAME
import io.wazo.callkeep.Constants.EXTRA_CALL_UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

class HandleSipCallHeadlessTask : HeadlessJsTaskService() {
    private var isRunning = false
    private var stopSelfCalled = false

    private val signallingEstablishedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            try {
                if (intent?.action != "ACTION_SIP_SIGNALLING_ESTABLISHED") return
                val callUuid = intent.getStringExtra(EXTRA_CALL_UUID) ?: return
                val bundle = VoxoConnectFirebaseService.IncomingCallBundles[callUuid] ?: return
                val callerNumber = bundle.getString("callerNumber") ?: "Unknown"
                val callerName = bundle.getString("callerName") ?: "Unknown Caller"
                if (IncomingCallAutoDecline.isTerminal(callUuid)) {
                    Log.i(TAG, "[HEADLESS] INVITE received but $callUuid already answered/declined — skipping notification")
                    return
                }
                if (!markIncomingNotificationPostAllowed(callUuid)) {
                    Log.i(TAG, "[HEADLESS] INVITE received, skipping duplicate incoming notification for $callUuid")
                    if (!IncomingCallRingtonePlayer.isRinging(callUuid)) {
                        IncomingCallRingtonePlayer.start(this@HandleSipCallHeadlessTask, callUuid)
                    }
                    return
                }
                Log.i(TAG, "[HEADLESS] INVITE received, posting notification for $callUuid")
                val secondLine = intent.getBooleanExtra("SECOND_LINE_MODE", false)
                postIncomingCallNotification(callUuid, callerNumber, callerName, secondLine)
                LocalBroadcastManager.getInstance(this@HandleSipCallHeadlessTask).unregisterReceiver(this)
            } catch (e: Exception) {
                Log.e(TAG, "[HEADLESS] signallingEstablishedReceiver.onReceive FAILED", e)
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val intentNonNull = intent ?: return Service.START_NOT_STICKY

        val callUuid = intentNonNull.extras?.getString(EXTRA_CALL_UUID)
            ?: intentNonNull.extras?.getString("callUuid")

        Log.i(TAG, "[HEADLESS] onStartCommand: action=${intentNonNull.action} callUuid=$callUuid")

        try {
            when (intentNonNull.action) {
                "END_CALL" -> {
                    if (callUuid != null) activeCallUuids.remove(callUuid)
                    if (callUuid != null) clearIncomingNotificationPostGuard(callUuid)
                    val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    if (callUuid != null) {
                        val nid = releaseNotificationIdForCall(callUuid)
                        if (nid != null) notificationManager.cancel(nid)
                        if (foregroundServiceCallUuid == callUuid) {
                            foregroundServiceCallUuid = null
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                                stopForeground(Service.STOP_FOREGROUND_REMOVE)
                            } else {
                                @Suppress("DEPRECATION")
                                stopForeground(true)
                            }
                        }
                        LaunchFromAnswerCleanup.onCallEnded(callUuid)
                    } else {
                        cancelLegacySlots(notificationManager)
                        foregroundServiceCallUuid = null
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                            stopForeground(Service.STOP_FOREGROUND_REMOVE)
                        } else {
                            @Suppress("DEPRECATION")
                            stopForeground(true)
                        }
                        LaunchFromAnswerCleanup.clearAllLaunchFromAnswerHints()
                    }
                    cancelLegacySlots(notificationManager)
                    val appInForeground = intentNonNull.extras?.getBoolean("APP_IN_FOREGROUND", false) ?: false
                    if (!appInForeground) {
                        stopSelfCalled = true
                        Log.w(TAG, "[HEADLESS] stopSelf: END_CALL appInForeground=false")
                        stopSelf()
                    } else {
                        Log.i(TAG, "[HEADLESS] END_CALL: app in foreground, keeping service alive")
                    }
                    return Service.START_NOT_STICKY
                }
                "INBOUND_CALL" -> {
                    if (callUuid != null && activeCallUuids.contains(callUuid)) {
                        Log.i(TAG, "[HEADLESS] INBOUND_CALL: already handling $callUuid, skipping duplicate")
                        return Service.START_NOT_STICKY
                    }
                    val extrasBundle = intentNonNull.extras
                    if (VoxoVoipPushStale.logAndIsStale(extrasBundle, callUuid, "INBOUND_CALL")) {
                        if (callUuid != null) {
                            clearIncomingNotificationPostGuard(callUuid)
                            val notificationManager =
                                getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                            val nid = releaseNotificationIdForCall(callUuid)
                            if (nid != null) notificationManager.cancel(nid)
                        }
                        return Service.START_NOT_STICKY
                    }
                    if (callUuid != null) activeCallUuids.add(callUuid)

                    // Must call startForeground() within ~5s when started via startForegroundService().
                    ensureForeground()

                    // Register receiver for ACTION_SIP_SIGNALLING_ESTABLISHED - notification is posted
                    // only after INVITE is received (when JS calls reportSignallingEstablished).
                    LocalBroadcastManager.getInstance(this).registerReceiver(
                        signallingEstablishedReceiver,
                        IntentFilter("ACTION_SIP_SIGNALLING_ESTABLISHED")
                    )
                    Log.i(TAG, "[HEADLESS] INBOUND_CALL: starting JS task, notification after INVITE")
ensureContextThenStartTask(intentNonNull)
                }
                "REJECT_CALL" -> {
                    if (callUuid != null) activeCallUuids.remove(callUuid)
                    if (callUuid != null) clearIncomingNotificationPostGuard(callUuid)
                    if (callUuid != null) LaunchFromAnswerCleanup.onCallEnded(callUuid)
                    ensureForeground()
                    val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    if (callUuid != null) {
                        val nid = releaseNotificationIdForCall(callUuid)
                        if (nid != null) notificationManager.cancel(nid)
                    }
                    cancelLegacySlots(notificationManager)
                    // ensureContextThenStartTask(intentNonNull) // REMOVED: Call already declined by foreground JS
                    // Only stop the service when app was never brought to foreground (same as END_CALL).
                    val appInForeground = intentNonNull.extras?.getBoolean("APP_IN_FOREGROUND", false) ?: false
                    if (!appInForeground) {
                        stopSelfCalled = true
                        Log.w(TAG, "[HEADLESS] stopSelf: REJECT_CALL appInForeground=false")
                        stopSelf()
                    } else {
                        Log.i(TAG, "[HEADLESS] REJECT_CALL: app in foreground, keeping service alive")
                    }
                }
                "CALL_ANSWERED" -> {
                    Log.i(TAG, "[HEADLESS] CALL_ANSWERED: swapping to ongoing notification")
                    swapToOngoingCallNotification(intentNonNull)
                    val callUuid = intentNonNull.getStringExtra(EXTRA_CALL_UUID)
                        ?: intentNonNull.getStringExtra("callUuid")
                        ?: ""
                    if (callUuid.isNotEmpty()) {
                        VoxoConnectIncomingCallBroadcastReceiver.launchMainActivityIfPending(
                            applicationContext,
                            callUuid
                        )
                    }
                }
                "OUTBOUND_CALL" -> {
                    postOngoingCallNotification(intentNonNull)
ensureContextThenStartTask(intentNonNull)
                }
                "ONGOING_CALL" -> {
                    postOngoingCallNotification(intentNonNull)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "[HEADLESS] onStartCommand action=${intentNonNull.action} FAILED", e)
        }

        return Service.START_NOT_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        activeCallUuids.clear()
        Log.w(TAG, "[HEADLESS] onDestroy stopSelfCalled=$stopSelfCalled (false=likely system killed)")
        try {
            LocalBroadcastManager.getInstance(this).unregisterReceiver(signallingEstablishedReceiver)
        } catch (_: Exception) {}
        // Use finish() not finishAndRemoveTask() — finishAndRemoveTask removes the task and
        // closes the app when ending a call. We only want to dismiss the full-screen incoming
        // UI and return to the app (MainActivity/InCallScreen), not close the app.
        try {
            IncomingCallFullScreenActivity.currentActivity?.finish()
        } catch (e: Exception) {
            Log.e(TAG, "[HEADLESS] onDestroy finish FAILED", e)
        }
    }

    private fun postOngoingCallNotification(intent: Intent) {
        val callUuid = intent.extras?.getString(EXTRA_CALL_UUID) ?: intent.extras?.getString("callUuid") ?: ""
        val callerName = intent.extras?.getString(EXTRA_CALLER_NAME)
            ?: intent.extras?.getString("callerName")
            ?: intent.extras?.getString("callerNumber")
            ?: "Unknown"
        val nid = allocateNotificationId(callUuid)
        val notification = buildOngoingCallNotification(callUuid, callerName)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    startForeground(
                        nid,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                    )
                } catch (e: SecurityException) {
                    startForeground(
                        nid,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
                    )
                }
            } else {
                startForeground(nid, notification)
            }
            foregroundServiceCallUuid = callUuid
            isRunning = true
        } catch (e: Exception) {
            Log.e(TAG, "[HEADLESS] postOngoingCallNotification FAILED", e)
        }
    }

    /** Replace incoming notification with ongoing call notification. Stops ringtone/vibration.
     * Tries MICROPHONE type for audio access (user has answered = eligible state on Android 14+). */
    private fun swapToOngoingCallNotification(intent: Intent) {
        try {
            val callUuid = intent.extras?.getString(EXTRA_CALL_UUID) ?: ""
            val callerName = intent.extras?.getString(EXTRA_CALLER_NAME)
                ?: intent.extras?.getString("callerNumber")
                ?: VoxoConnectFirebaseService.IncomingCallBundles[callUuid]?.getString("callerName")
                ?: VoxoConnectFirebaseService.IncomingCallBundles[callUuid]?.getString("callerNumber")
                ?: "Unknown Caller"
            val nid = allocateNotificationId(callUuid)
            val notification = buildOngoingCallNotification(callUuid, callerName)
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.cancel(PROCESSING_NOTIFICATION_ID)
            cancelLegacySlots(notificationManager)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    startForeground(
                        nid,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                    )
                } catch (e: SecurityException) {
                    Log.w(TAG, "[HEADLESS] MICROPHONE type failed, using PHONE_CALL only", e)
                    startForeground(
                        nid,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
                    )
                }
            } else {
                startForeground(nid, notification)
            }
            foregroundServiceCallUuid = callUuid
            isRunning = true
        } catch (e: Exception) {
            Log.e(TAG, "[HEADLESS] swapToOngoingCallNotification FAILED", e)
        }
    }

    private fun buildOngoingCallNotification(callUuid: String, callerName: String): Notification {
        val displayName = callerName.ifEmpty { "Unknown" }
        
        // Collapsed View (Button hidden)
        val collapsedLayout = android.widget.RemoteViews(packageName, R.layout.ongoing_call_notification)
        applyOngoingCallAppLogo(collapsedLayout)
        collapsedLayout.setTextViewText(R.id.ongoing_call_description, displayName)
        collapsedLayout.setViewVisibility(R.id.btnHangup, View.GONE)

        // Expanded View (Button visible)
        val expandedLayout = android.widget.RemoteViews(packageName, R.layout.ongoing_call_notification)
        applyOngoingCallAppLogo(expandedLayout)
        expandedLayout.setTextViewText(R.id.ongoing_call_description, displayName)
        expandedLayout.setViewVisibility(R.id.btnHangup, View.VISIBLE)

        val foregroundIntent = Intent(this, VoxoConnectIncomingCallBroadcastReceiver::class.java)
            .putExtra("actionPerformed", "FOREGROUND")
            .putExtra(EXTRA_CALL_UUID, callUuid)
            .setFlags(Intent.FLAG_RECEIVER_FOREGROUND)
        val foregroundReqCode = 10000 + (callUuid.hashCode() and 0x0fffffff)
        val foregroundPendingIntent = PendingIntent.getBroadcast(
            this, foregroundReqCode, foregroundIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val hangupIntent = Intent(this, VoxoConnectIncomingCallBroadcastReceiver::class.java).apply {
            putExtra("actionPerformed", "END_FROM_NOTIFICATION")
            putExtra(EXTRA_CALL_UUID, callUuid)
            setFlags(Intent.FLAG_RECEIVER_FOREGROUND)
        }
        val hangupReqCode = 20000 + (callUuid.hashCode() and 0x7fff)
        val hangupPendingIntent = PendingIntent.getBroadcast(
            this, hangupReqCode, hangupIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        expandedLayout.setOnClickPendingIntent(R.id.btnHangup, hangupPendingIntent)

        val notification = NotificationCompat.Builder(applicationContext, MainApplication.ONGOING_CALL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(displayName)
            .setContentText(getString(R.string.tap_to_open_app))
            .setCustomContentView(collapsedLayout)
            .setCustomBigContentView(expandedLayout)
            .setContentIntent(foregroundPendingIntent)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
        notification.flags = notification.flags or Notification.FLAG_NO_CLEAR
        return notification
    }

    private fun postIncomingCallNotification(
        callUuid: String,
        callerNumber: String,
        callerName: String,
        secondLineMode: Boolean = false
    ) {
        try {
        val hashSlice = callUuid.hashCode() and 0x7fff
        val incomingCallFullScreenIntent = Intent(Intent.ACTION_MAIN, null).apply {
            action = "co.voxo.action.SHOW_INCOMING_CALL"
            putExtra("CALL_UUID", callUuid)
            putExtra("CALLER_NUMBER", callerNumber)
            putExtra("CALLER_NAME", callerName)
            putExtra("SECOND_LINE_MODE", secondLineMode)
            flags = Intent.FLAG_ACTIVITY_NO_USER_ACTION or Intent.FLAG_ACTIVITY_NEW_TASK
            setClass(this@HandleSipCallHeadlessTask, IncomingCallFullScreenActivity::class.java)
        }
        val pendingFullScreenIntent = PendingIntent.getActivity(
            this, 1001 + hashSlice, incomingCallFullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val answerPendingIntent = if (secondLineMode) {
            val endAcceptIntent = Intent(this, VoxoConnectIncomingCallBroadcastReceiver::class.java)
                .putExtra("CALL_UUID", callUuid)
                .putExtra(EXTRA_CALL_UUID, callUuid)
                .putExtra("actionPerformed", "END_AND_ACCEPT")
                .setFlags(Intent.FLAG_RECEIVER_FOREGROUND)
            PendingIntent.getBroadcast(
                this, 50000 + hashSlice, endAcceptIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        } else {
            val answerIntent = Intent(this, AnswerTrampolineActivity::class.java)
                .putExtra("CALL_UUID", callUuid)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            PendingIntent.getActivity(
                this, 40000 + hashSlice, answerIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        val rejectIntent = Intent(this, VoxoConnectIncomingCallBroadcastReceiver::class.java)
            .putExtra("CALL_UUID", callUuid)
            .putExtra(EXTRA_CALL_UUID, callUuid)
            .putExtra("actionPerformed", "REJECT")
            .setFlags(Intent.FLAG_RECEIVER_FOREGROUND)
        val rejectPendingIntent = PendingIntent.getBroadcast(
            this, 30000 + hashSlice, rejectIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val acceptLabel = if (secondLineMode) {
            getString(R.string.button_text_end_accept_button)
        } else {
            getString(R.string.button_text_accept_button)
        }

        val headsUpLayout = android.widget.RemoteViews(packageName, R.layout.heads_up_notification)
        applyIncomingCallAppLogo(headsUpLayout)
        headsUpLayout.setTextViewText(R.id.incoming_call_type, "Incoming call")
        headsUpLayout.setTextViewText(R.id.incoming_call_name, callerName)
        headsUpLayout.setTextViewText(R.id.btnAnswer, acceptLabel)
        headsUpLayout.setOnClickPendingIntent(R.id.btnAnswer, answerPendingIntent)
        headsUpLayout.setOnClickPendingIntent(R.id.btnReject, rejectPendingIntent)

        val customLayout = android.widget.RemoteViews(packageName, R.layout.notification_custom_content_view)
        applyIncomingCallAppLogo(customLayout)
        customLayout.setTextViewText(R.id.incoming_call_type, "Incoming call")
        customLayout.setTextViewText(R.id.incoming_call_name, callerName)
        customLayout.setViewVisibility(R.id.btnAnswer, View.GONE)
        customLayout.setViewVisibility(R.id.btnReject, View.GONE)

        val customLayoutExpanded = android.widget.RemoteViews(packageName, R.layout.notification_custom_content_view)
        applyIncomingCallAppLogo(customLayoutExpanded)
        customLayoutExpanded.setTextViewText(R.id.incoming_call_type, "Incoming call")
        customLayoutExpanded.setTextViewText(R.id.incoming_call_name, callerName)
        customLayoutExpanded.setTextViewText(R.id.btnAnswer, acceptLabel)
        customLayoutExpanded.setViewVisibility(R.id.btnAnswer, View.VISIBLE)
        customLayoutExpanded.setViewVisibility(R.id.btnReject, View.VISIBLE)
        customLayoutExpanded.setOnClickPendingIntent(R.id.btnAnswer, answerPendingIntent)
        customLayoutExpanded.setOnClickPendingIntent(R.id.btnReject, rejectPendingIntent)

        val notification = NotificationCompat.Builder(this, MainApplication.INCOMING_CALL_CHANNEL_ID)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(false)
            .setOngoing(true)
            .setSmallIcon(R.drawable.ic_notification)
            .setCustomHeadsUpContentView(headsUpLayout)
            .setCustomContentView(customLayout)
            .setCustomBigContentView(customLayoutExpanded)
            .setFullScreenIntent(pendingFullScreenIntent, true)
            .build()

        notification.flags = notification.flags or Notification.FLAG_INSISTENT or Notification.FLAG_NO_CLEAR
        notifyIncoming(callUuid, notification)
        Log.i(TAG, "[HEADLESS] 🔊 STARTING RINGTONE for callUuid=$callUuid")
        IncomingCallRingtonePlayer.start(this, callUuid)
        Log.i(TAG, "[HEADLESS] 🔊 RINGTONE START CALLED for callUuid=$callUuid")
        IncomingCallAutoDecline.schedule(this, callUuid)
        } catch (e: Exception) {
            Log.e(TAG, "[HEADLESS] postIncomingCallNotification FAILED", e)
        }
    }

    /**
     * Must call startForeground() within ~5s when started via startForegroundService().
     * Call for REJECT_CALL and END_CALL which don't post a visible notification.
     */
    private fun ensureForeground() {
        try {
            if (!isRunning) {
                val notification = NotificationCompat.Builder(this, MainApplication.ONGOING_CALL_CHANNEL_ID)
                    .setContentTitle("Call")
                    .setContentText("Processing...")
                    .setSmallIcon(R.drawable.ic_notification)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .build()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(
                        PROCESSING_NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
                    )
                } else {
                    startForeground(PROCESSING_NOTIFICATION_ID, notification)
                }
                isRunning = true
            }
        } catch (e: Exception) {
            Log.e(TAG, "[HEADLESS] ensureForeground FAILED", e)
        }
    }

    private fun notifyIncoming(callUuid: String, notification: Notification) {
        try {
            val nid = allocateNotificationId(callUuid)
            if (!isRunning) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(
                        nid,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
                    )
                } else {
                    startForeground(nid, notification)
                }
                foregroundServiceCallUuid = callUuid
                isRunning = true
            } else {
                NotificationManagerCompat.from(this).notify(nid, notification)
            }
            IncomingCallRingtonePlayer.start(this, callUuid)
            Log.i(TAG, "[HEADLESS] notifyIncoming callUuid=$callUuid notificationId=$nid")
        } catch (e: Exception) {
            Log.e(TAG, "[HEADLESS] notifyIncoming FAILED", e)
        }
    }

    private fun ensureContextThenStartTask(intent: Intent) {
        try {
        Log.i(TAG, "[HEADLESS] ensureContextThenStartTask: entry")
        val taskConfig = HeadlessJsTaskConfig(
            "AndroidHandleSipCallHeadlessTask",
            Arguments.fromBundle(intent.extras),
            0,
            true
        )

        val reactInstanceManager = reactNativeHost.reactInstanceManager
        val reactContext = reactInstanceManager.currentReactContext

        if (reactContext == null) {
            Log.i(TAG, "[HEADLESS] React context null - requesting createReactContextInBackground")
            reactInstanceManager.addReactInstanceEventListener(object : ReactInstanceManager.ReactInstanceEventListener {
                override fun onReactContextInitialized(context: ReactContext) {
                    Log.i(TAG, "[HEADLESS] React context ready - waiting 1s then dispatching")
                    reactInstanceManager.removeReactInstanceEventListener(this)
                    val handler = Handler(Looper.getMainLooper())
                    handler.postDelayed({
                        dispatchWhenTimingModuleReady(intent, taskConfig, context, handler, 0)
                    }, 1000)
                }
            })
            reactInstanceManager.createReactContextInBackground()
        } else {
            Log.i(TAG, "[HEADLESS] React context exists - dispatching immediately")
            dispatchWhenTimingModuleReady(intent, taskConfig, reactContext, Handler(Looper.getMainLooper()), 0)
        }
        } catch (e: Exception) {
            Log.e(TAG, "[HEADLESS] ensureContextThenStartTask FAILED", e)
        }
    }

    private fun dispatchWhenTimingModuleReady(
        intent: Intent,
        taskConfig: HeadlessJsTaskConfig,
        reactContext: ReactContext,
        handler: Handler,
        dispatchCount: Int
    ): Boolean {
        Log.i(TAG, "[HEADLESS] dispatchWhenTimingModuleReady: attempt=$dispatchCount")
        try {
            val headlessJsTaskContext = HeadlessJsTaskContext.getInstance(reactContext)
            val eventListenersField = HeadlessJsTaskContext::class.java.getDeclaredField("mHeadlessJsTaskEventListeners")
            eventListenersField.isAccessible = true
            @Suppress("UNCHECKED_CAST")
            val eventListeners = eventListenersField.get(headlessJsTaskContext) as Set<HeadlessJsTaskEventListener>
            val hasTimingModule = eventListeners.any { it is JavaTimerManager }

            if (hasTimingModule) {
                Log.i(TAG, "[HEADLESS] TimingModule ready - starting JS task")
                startTask(taskConfig)
                return true
            }
            if (timingModuleWaitInterval * dispatchCount > timingModuleWaitMax) {
                Log.i(TAG, "[HEADLESS] TimingModule wait timeout - starting JS task anyway")
                startTask(taskConfig)
                return true
            }
            Log.i(TAG, "[HEADLESS] TimingModule not ready - retrying in 500ms (attempt $dispatchCount)")
            handler.postDelayed({
                dispatchWhenTimingModuleReady(intent, taskConfig, reactContext, handler, dispatchCount + 1)
            }, timingModuleWaitInterval)
            return false
        } catch (e: Exception) {
            Log.e(TAG, "[HEADLESS] dispatchWhenTimingModuleReady FAILED - starting task anyway", e)
            startTask(taskConfig)
            return true
        }
    }

    private fun isAppInForeground(): Boolean {
        val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        val appProcesses = activityManager.runningAppProcesses ?: return false
        val packageName = applicationContext.packageName
        for (appProcess in appProcesses) {
            if (appProcess.importance == android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
                && appProcess.processName == packageName) {
                return true
            }
        }
        return false
    }

    companion object {
        private const val TAG = "VoxoConnect:HandleSipCall"
        const val NotificationID = 20
        const val PROCESSING_NOTIFICATION_ID = 21
        private const val NOTIFICATION_ID_MIN = 30_000
        private const val NOTIFICATION_ID_MAX = 32_767
        private const val timingModuleWaitInterval: Long = 500
        private const val timingModuleWaitMax: Long = 5000

        @Volatile
        @JvmStatic
        var foregroundServiceCallUuid: String? = null

        private val notificationIdByCallUuid = ConcurrentHashMap<String, Int>()
        private val nextNotificationId = AtomicInteger(NOTIFICATION_ID_MIN)

        /** UUIDs currently being handled to avoid duplicate headless tasks. */
        private val activeCallUuids = mutableSetOf<String>()

        fun isHandlingCall(callUuid: String): Boolean = activeCallUuids.contains(callUuid)

        /** True if another INBOUND uuid is still tracked (e.g. second incoming while first active). */
        @JvmStatic
        fun hasOtherActiveInboundUuid(excludeCallUuid: String): Boolean {
            synchronized(activeCallUuids) {
                return activeCallUuids.any { it != excludeCallUuid }
            }
        }

        @JvmStatic
        fun allocateNotificationId(callUuid: String): Int {
            return notificationIdByCallUuid.getOrPut(callUuid) {
                var n = nextNotificationId.getAndIncrement()
                if (n > NOTIFICATION_ID_MAX) {
                    nextNotificationId.set(NOTIFICATION_ID_MIN)
                    n = nextNotificationId.getAndIncrement()
                }
                n
            }
        }

        @JvmStatic
        fun releaseNotificationIdForCall(callUuid: String): Int? {
            return notificationIdByCallUuid.remove(callUuid)
        }

        @JvmStatic
        fun cancelLegacySlots(nm: NotificationManager) {
            nm.cancel(NotificationID)
            nm.cancel(PROCESSING_NOTIFICATION_ID)
        }

        /**
         * Cancel the shade notification for this call (does not remove map entry; END_CALL cleans up).
         */
        @JvmStatic
        fun cancelNotificationForCall(context: Context, callUuid: String) {
            val id = notificationIdByCallUuid[callUuid] ?: return
            val nm = context.applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.cancel(id)
        }

        /** Remove mapping and cancel shade entry for this call (e.g. one leg ended, other calls remain). */
        @JvmStatic
        fun dismissNotificationForCallOnly(context: Context, callUuid: String) {
            val nid = releaseNotificationIdForCall(callUuid) ?: return
            val nm = context.applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.cancel(nid)
        }

        /**
         * Post incoming call notification from any context (e.g. AndroidNotificationsModule).
         * Used when reportSignallingEstablished is called but the service may have been destroyed
         * (second-call scenario). Decouples notification from service lifecycle.
         */
        @JvmStatic
        fun postIncomingCallNotificationFromContext(
            context: Context,
            callUuid: String,
            callerNumber: String,
            callerName: String,
            secondLineMode: Boolean = false
        ) {
            try {
                val staleBundle = VoxoConnectFirebaseService.IncomingCallBundles[callUuid]
                if (VoxoVoipPushStale.logAndIsStale(staleBundle, callUuid, "postFromContext")) {
                    return
                }
                // User already answered/declined this call (e.g. Decline tapped before the SIP
                // INVITE arrived) — never re-post the incoming UI or restart the ringtone.
                if (IncomingCallAutoDecline.isTerminal(callUuid)) {
                    Log.i(TAG, "[HEADLESS] Skipping incoming notification for $callUuid — call already answered/declined")
                    return
                }
                if (!markIncomingNotificationPostAllowed(callUuid)) {
                    Log.i(TAG, "[HEADLESS] Skipping duplicate incoming notification from context for $callUuid")
                    if (!IncomingCallRingtonePlayer.isRinging(callUuid)) {
                        IncomingCallRingtonePlayer.start(context.applicationContext, callUuid)
                    }
                    return
                }
                val appContext = context.applicationContext
                val hashSlice = callUuid.hashCode() and 0x7fff
                val incomingCallFullScreenIntent = Intent(Intent.ACTION_MAIN, null).apply {
                    action = "co.voxo.action.SHOW_INCOMING_CALL"
                    putExtra("CALL_UUID", callUuid)
                    putExtra("CALLER_NUMBER", callerNumber)
                    putExtra("CALLER_NAME", callerName)
                    putExtra("SECOND_LINE_MODE", secondLineMode)
                    flags = Intent.FLAG_ACTIVITY_NO_USER_ACTION or Intent.FLAG_ACTIVITY_NEW_TASK
                    setClass(appContext, IncomingCallFullScreenActivity::class.java)
                }
                val pendingFullScreenIntent = PendingIntent.getActivity(
                    appContext, 1001 + hashSlice, incomingCallFullScreenIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )

                val answerPendingIntent = if (secondLineMode) {
                    val endAcceptIntent = Intent(appContext, VoxoConnectIncomingCallBroadcastReceiver::class.java)
                        .putExtra("CALL_UUID", callUuid)
                        .putExtra(EXTRA_CALL_UUID, callUuid)
                        .putExtra("actionPerformed", "END_AND_ACCEPT")
                        .setFlags(Intent.FLAG_RECEIVER_FOREGROUND)
                    PendingIntent.getBroadcast(
                        appContext, 50000 + hashSlice, endAcceptIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                } else {
                    val answerIntent = Intent(appContext, AnswerTrampolineActivity::class.java)
                        .putExtra("CALL_UUID", callUuid)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    PendingIntent.getActivity(
                        appContext, 40000 + hashSlice, answerIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                }

                val rejectIntent = Intent(appContext, VoxoConnectIncomingCallBroadcastReceiver::class.java)
                    .putExtra("CALL_UUID", callUuid)
                    .putExtra(EXTRA_CALL_UUID, callUuid)
                    .putExtra("actionPerformed", "REJECT")
                    .setFlags(Intent.FLAG_RECEIVER_FOREGROUND)
                val rejectPendingIntent = PendingIntent.getBroadcast(
                    appContext, 30000 + hashSlice, rejectIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )

                val acceptLabel = if (secondLineMode) {
                    appContext.getString(R.string.button_text_end_accept_button)
                } else {
                    appContext.getString(R.string.button_text_accept_button)
                }

                val headsUpLayout = android.widget.RemoteViews(appContext.packageName, R.layout.heads_up_notification)
                applyIncomingCallAppLogo(headsUpLayout)
                headsUpLayout.setTextViewText(R.id.incoming_call_type, "Incoming call")
                headsUpLayout.setTextViewText(R.id.incoming_call_name, callerName)
                headsUpLayout.setTextViewText(R.id.btnAnswer, acceptLabel)
                headsUpLayout.setOnClickPendingIntent(R.id.btnAnswer, answerPendingIntent)
                headsUpLayout.setOnClickPendingIntent(R.id.btnReject, rejectPendingIntent)

                val customLayout = android.widget.RemoteViews(appContext.packageName, R.layout.notification_custom_content_view)
                applyIncomingCallAppLogo(customLayout)
                customLayout.setTextViewText(R.id.incoming_call_type, "Incoming call")
                customLayout.setTextViewText(R.id.incoming_call_name, callerName)
                customLayout.setViewVisibility(R.id.btnAnswer, View.GONE)
                customLayout.setViewVisibility(R.id.btnReject, View.GONE)

                val customLayoutExpanded = android.widget.RemoteViews(appContext.packageName, R.layout.notification_custom_content_view)
                applyIncomingCallAppLogo(customLayoutExpanded)
                customLayoutExpanded.setTextViewText(R.id.incoming_call_type, "Incoming call")
                customLayoutExpanded.setTextViewText(R.id.incoming_call_name, callerName)
                customLayoutExpanded.setTextViewText(R.id.btnAnswer, acceptLabel)
                customLayoutExpanded.setViewVisibility(R.id.btnAnswer, View.VISIBLE)
                customLayoutExpanded.setViewVisibility(R.id.btnReject, View.VISIBLE)
                customLayoutExpanded.setOnClickPendingIntent(R.id.btnAnswer, answerPendingIntent)
                customLayoutExpanded.setOnClickPendingIntent(R.id.btnReject, rejectPendingIntent)

                val notification = NotificationCompat.Builder(appContext, MainApplication.INCOMING_CALL_CHANNEL_ID)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setAutoCancel(false)
                    .setOngoing(true)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setCustomHeadsUpContentView(headsUpLayout)
                    .setCustomContentView(customLayout)
                    .setCustomBigContentView(customLayoutExpanded)
                    .setFullScreenIntent(pendingFullScreenIntent, true)
                    .build()

                notification.flags = notification.flags or Notification.FLAG_INSISTENT or Notification.FLAG_NO_CLEAR
                val nid = allocateNotificationId(callUuid)
                NotificationManagerCompat.from(appContext).notify(nid, notification)
                Log.i(TAG, "[HEADLESS] 🔊 STARTING RINGTONE for callUuid=$callUuid")
                IncomingCallRingtonePlayer.start(appContext, callUuid)
                Log.i(TAG, "[HEADLESS] 🔊 RINGTONE START CALLED for callUuid=$callUuid")
                Log.i(TAG, "[HEADLESS] Posted incoming from context callUuid=$callUuid notificationId=$nid secondLine=$secondLineMode")
                IncomingCallAutoDecline.schedule(appContext, callUuid)
            } catch (e: Exception) {
                Log.e(TAG, "[HEADLESS] postIncomingCallNotificationFromContext FAILED", e)
            }
        }

        @JvmStatic
        fun postOngoingCallNotificationFromContext(
            context: Context,
            callUuid: String,
            callerName: String
        ) {
            try {
                val appContext = context.applicationContext
                val displayName = callerName.ifEmpty { "Unknown" }
                val nid = allocateNotificationId(callUuid)

                val collapsedLayout = android.widget.RemoteViews(appContext.packageName, R.layout.ongoing_call_notification)
                applyOngoingCallAppLogo(collapsedLayout)
                collapsedLayout.setTextViewText(R.id.ongoing_call_description, displayName)
                collapsedLayout.setViewVisibility(R.id.btnHangup, View.GONE)

                val expandedLayout = android.widget.RemoteViews(appContext.packageName, R.layout.ongoing_call_notification)
                applyOngoingCallAppLogo(expandedLayout)
                expandedLayout.setTextViewText(R.id.ongoing_call_description, displayName)
                expandedLayout.setViewVisibility(R.id.btnHangup, View.VISIBLE)

                val foregroundIntent = Intent(appContext, VoxoConnectIncomingCallBroadcastReceiver::class.java)
                    .putExtra("actionPerformed", "FOREGROUND")
                    .putExtra(EXTRA_CALL_UUID, callUuid)
                    .setFlags(Intent.FLAG_RECEIVER_FOREGROUND)
                val foregroundReqCode = 10000 + (callUuid.hashCode() and 0x0fffffff)
                val foregroundPendingIntent = PendingIntent.getBroadcast(
                    appContext, foregroundReqCode, foregroundIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )

                val hangupIntent = Intent(appContext, VoxoConnectIncomingCallBroadcastReceiver::class.java).apply {
                    putExtra("actionPerformed", "END_FROM_NOTIFICATION")
                    putExtra(EXTRA_CALL_UUID, callUuid)
                    setFlags(Intent.FLAG_RECEIVER_FOREGROUND)
                }
                val hangupReqCode = 20000 + (callUuid.hashCode() and 0x7fff)
                val hangupPendingIntent = PendingIntent.getBroadcast(
                    appContext, hangupReqCode, hangupIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                expandedLayout.setOnClickPendingIntent(R.id.btnHangup, hangupPendingIntent)

                val notification = NotificationCompat.Builder(appContext, MainApplication.ONGOING_CALL_CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(displayName)
                    .setContentText(appContext.getString(R.string.tap_to_open_app))
                    .setCustomContentView(collapsedLayout)
                    .setCustomBigContentView(expandedLayout)
                    .setContentIntent(foregroundPendingIntent)
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setOngoing(true)
                    .setAutoCancel(false)
                    .setOnlyAlertOnce(true)
                    .setSilent(true)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                    .build()

                notification.flags = notification.flags or Notification.FLAG_NO_CLEAR
                NotificationManagerCompat.from(appContext).notify(nid, notification)
                Log.i(TAG, "[HEADLESS] Posted ongoing from context: $callUuid notificationId=$nid")
            } catch (e: Exception) {
                Log.e(TAG, "[HEADLESS] postOngoingCallNotificationFromContext FAILED", e)
            }
        }

        @JvmStatic
        fun dismissOngoingCallNotificationFromContext(context: Context) {
            try {
                val nm = context.applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notificationIdByCallUuid.values.forEach { nm.cancel(it) }
                notificationIdByCallUuid.clear()
                cancelLegacySlots(nm)
                foregroundServiceCallUuid = null
                Log.i(TAG, "[HEADLESS] Dismissed all call notifications from context")
                // StartForeground() notifications are not fully removed by NotificationManager.cancel();
                // END_CALL with no EXTRA_CALL_UUID runs stopForeground() (see onStartCommand).
                try {
                    val appContext = context.applicationContext
                    val endIntent = Intent(appContext, HandleSipCallHeadlessTask::class.java).apply {
                        action = "END_CALL"
                    }
                    appContext.startService(endIntent)
                } catch (e: Exception) {
                    Log.e(TAG, "[HEADLESS] dismissOngoing: END_CALL stopForeground dispatch FAILED", e)
                }
            } catch (e: Exception) {
                Log.e(TAG, "[HEADLESS] dismissOngoingCallNotificationFromContext FAILED", e)
            }
        }

        private const val INCOMING_POST_DEDUPE_WINDOW_MS = 8000L
        private val incomingPostAtMs = HashMap<String, Long>()

        @Synchronized
        private fun markIncomingNotificationPostAllowed(callUuid: String): Boolean {
            val now = System.currentTimeMillis()
            val previous = incomingPostAtMs[callUuid]
            if (previous != null && (now - previous) < INCOMING_POST_DEDUPE_WINDOW_MS) {
                return false
            }
            incomingPostAtMs[callUuid] = now
            return true
        }

        @Synchronized
        private fun clearIncomingNotificationPostGuard(callUuid: String) {
            incomingPostAtMs.remove(callUuid)
        }
    }
}

/** Full-color app icon in custom RemoteViews (mipmap); small icon stays monochrome via setSmallIcon. */
private fun applyIncomingCallAppLogo(views: android.widget.RemoteViews) {
    views.setImageViewResource(R.id.notification_app_logo, R.mipmap.ic_launcher_round)
}

private fun applyOngoingCallAppLogo(views: android.widget.RemoteViews) {
    views.setImageViewResource(R.id.notification_app_logo, R.mipmap.ic_launcher_round)
}
