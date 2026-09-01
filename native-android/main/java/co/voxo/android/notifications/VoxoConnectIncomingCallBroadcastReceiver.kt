package co.voxo.android.notifications

import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import co.voxo.android.MainActivity
import co.voxo.android.headlessTasks.HandleSipCallHeadlessTask
import co.voxo.android.VoxoConnectFirebaseService
import io.wazo.callkeep.Constants.EXTRA_CALL_NUMBER
import io.wazo.callkeep.Constants.EXTRA_CALLER_NAME
import io.wazo.callkeep.Constants.EXTRA_CALL_UUID
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

/**
 * Handles Answer/Reject broadcasts from IncomingCallFullScreenActivity
 * and from heads-up notification buttons.
 *
 * When the headless JS task is already running (it called getIncomingCallNotificationResult),
 * we resolve the registered Promise so the same SIP session is answered/rejected.
 * Only when no Promise is registered (edge case) do we fall back to starting a new headless task.
 */
class VoxoConnectIncomingCallBroadcastReceiver : BroadcastReceiver() {

    private fun resolveRNPromise(callUuid: String, result: String) {
        try {
            val notification = promises.getOrDefault(callUuid, null)
            if (notification != null && notification.promise != null) {
                Log.d(TAG, "Resolving RN promise for $callUuid with $result")
                notification.promise.resolve(result)
                removePromise(callUuid)
            } else {
                Log.d(TAG, "No promise registered for $callUuid, storing pending result: $result")
                pendingNotificationResults[callUuid] = result
            }
        } catch (e: Exception) {
            Log.e(TAG, "resolveRNPromise FAILED for $callUuid", e)
        }
    }

    override fun onReceive(context: Context, intent: Intent?) {
        try {
        if (intent == null) {
            Log.w(TAG, "onReceive: intent is null")
            return
        }
        val callUuid = intent.getStringExtra(EXTRA_CALL_UUID) ?: intent.getStringExtra("CALL_UUID")
        val actionPerformed = intent.getStringExtra("actionPerformed")
        val isFullScreenAct = intent.getBooleanExtra("IS_FULLSCREEN_ACTIVITY", false)
        val fromHeadsUp = intent.getBooleanExtra("FROM_HEADS_UP_BUTTON", false)

        Log.d(TAG, "CALL NOTIFICATION RESULT callUuid=$callUuid action=$actionPerformed isFullScreenAct=$isFullScreenAct fromHeadsUp=$fromHeadsUp")

        when {
            actionPerformed == "END_AND_ACCEPT" && callUuid != null -> {
                try {
                    if (isDuplicateAnswer(callUuid)) {
                        Log.d(TAG, "Ignoring duplicate END_AND_ACCEPT for $callUuid")
                        return
                    }
                    IncomingCallAutoDecline.cancel(callUuid)
                    IncomingCallAutoDecline.markTerminal(callUuid)
                    resolveRNPromise(callUuid, "END_AND_ACCEPT")
                    if (fromHeadsUp) {
                        pendingHeadsUpUnlockedCallUuid = callUuid
                        Log.d(TAG, "END_AND_ACCEPT fromHeadsUp=true — trampoline owns MainActivity after SIP answer")
                        return
                    }
                    if (isFullScreenAct) {
                        Log.d(TAG, "END_AND_ACCEPT from full-screen activity")
                        return
                    }
                    try {
                        foregroundApp(context, callUuid)
                        Log.d(TAG, "foregroundApp for END_AND_ACCEPT completed")
                    } catch (e: Exception) {
                        Log.e(TAG, "foregroundApp END_AND_ACCEPT FAILED", e)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "END_AND_ACCEPT FAILED", e)
                }
            }
            actionPerformed == "END_FROM_NOTIFICATION" && callUuid != null -> {
                try {
                    IncomingCallAutoDecline.cancel(callUuid)
                    IncomingCallAutoDecline.markTerminal(callUuid)
                    HandleSipCallHeadlessTask.cancelNotificationForCall(context, callUuid)
                    // Emit HeadlessHangupRequested so headless task (if running) sends SIP BYE and then reportCallEnded
                    // Emit OngoingCallHangupRequested so main app (if in foreground) hangs up.
                    // Do NOT startForegroundService(END_CALL) here: in foreground that kills the app (service never calls startForeground).
                    val app = context.applicationContext as? ReactApplication
                    val reactContext = app?.reactNativeHost?.reactInstanceManager?.currentReactContext
                    if (reactContext?.hasActiveReactInstance() == true) {
                        val args1 = Arguments.createMap()
                        args1.putString("callUuid", callUuid)
                        reactContext.emitDeviceEvent("HeadlessHangupRequested", args1)

                        val args2 = Arguments.createMap()
                        args2.putString("callUuid", callUuid)
                        reactContext.emitDeviceEvent("OngoingCallHangupRequested", args2)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "END_FROM_NOTIFICATION FAILED", e)
                }
            }
            actionPerformed == "FOREGROUND" -> {
                val foregroundCallUuid = intent.getStringExtra(EXTRA_CALL_UUID) ?: intent.getStringExtra("CALL_UUID")
                try { foregroundApp(context, foregroundCallUuid) } catch (e: Exception) {
                    Log.e(TAG, "foregroundApp FAILED", e)
                }
            }
            callUuid != null && actionPerformed != null -> {
                try {
                    if (
                        actionPerformed == "ANSWER" ||
                        actionPerformed == "REJECT" ||
                        actionPerformed == "END_AND_ACCEPT"
                    ) {
                        IncomingCallRingtonePlayer.stop(callUuid)
                        IncomingCallAutoDecline.cancel(callUuid)
                        IncomingCallAutoDecline.markTerminal(callUuid)
                    }
                    if (actionPerformed == "ANSWER" && isDuplicateAnswer(callUuid)) {
                        Log.d(TAG, "Ignoring duplicate ANSWER for $callUuid")
                        return
                    }
                    // Capture before resolveRNPromise — it stores into pendingNotificationResults
                    // when no Promise is registered, which must not block the native REJECT fallback.
                    val hadRegisteredPromise = promises.containsKey(callUuid)
                    // Resolve the Promise that the headless JS task is awaiting.
                    // This keeps the same SIP session alive (mirroring voxo-mobile).
                    resolveRNPromise(callUuid, actionPerformed)

                    when (actionPerformed) {
                        "ANSWER" -> {
                            if (fromHeadsUp && callUuid != null) {
                                // AnswerTrampolineActivity stays alive over the lock screen and
                                // launches MainActivity after SIP 200 OK. Do not start MainActivity
                                // from this receiver (blocked on Android 10+ and races headless JS).
                                pendingHeadsUpUnlockedCallUuid = callUuid
                                Log.d(TAG, "ANSWER fromHeadsUp=true — trampoline owns MainActivity after SIP answer")
                                return
                            }
                            if (isFullScreenAct) {
                                // IncomingCallFullScreenActivity handles foregrounding MainActivity
                                // after keyguard dismissal; skip duplicate launcher here.
                                Log.d(TAG, "Skipping foregroundApp (ANSWER) from full-screen activity path")
                                return
                            }
                            Log.d(TAG, "ANSWER fallback: calling foregroundApp (isFullScreenAct=false)")
                            try {
                                foregroundApp(context, callUuid)
                                Log.d(TAG, "foregroundApp called successfully (fallback)")
                            } catch (e: Exception) {
                                Log.e(TAG, "foregroundApp (ANSWER) FAILED", e)
                            }
                        }
                        "REJECT" -> {
                            val fromAutoDecline = intent.getBooleanExtra("FROM_AUTO_DECLINE_TIMEOUT", false)
                            // Always clean up when auto-decline fires: the headless task may be stuck
                            // (e.g. establishInboundSession hanging for extension-number calls) and
                            // will never call reportCallEnded on its own.
                            if (!hadRegisteredPromise || fromAutoDecline) {
                                try {
                                    val appInForeground = isAppInForeground(context.applicationContext)
                                    if (fromAutoDecline) {
                                        // Dismiss IncomingCallFullScreenActivity on the lock screen.
                                        try {
                                            LocalBroadcastManager.getInstance(context.applicationContext).sendBroadcast(
                                                Intent("ACTION_INCOMING_CALL_CANCELLED")
                                                    .putExtra(EXTRA_CALL_UUID, callUuid)
                                            )
                                        } catch (e: Exception) {
                                            Log.e(TAG, "REJECT auto-decline: ACTION_INCOMING_CALL_CANCELLED broadcast FAILED", e)
                                        }
                                    }
                                    if (!hadRegisteredPromise) {
                                        // No headless task running — start service to clean up notification.
                                        val payload = VoxoConnectFirebaseService.IncomingCallBundles[callUuid]
                                        if (payload != null) {
                                            payload.putString("action", "reject")
                                            val serviceIntent = Intent(context, HandleSipCallHeadlessTask::class.java).apply {
                                                action = "REJECT_CALL"
                                                putExtras(payload)
                                                putExtra(EXTRA_CALL_UUID, callUuid)
                                                putExtra("APP_IN_FOREGROUND", appInForeground)
                                            }
                                            context.applicationContext.startForegroundService(serviceIntent)
                                        } else {
                                            val endIntent = Intent(context, HandleSipCallHeadlessTask::class.java).apply {
                                                action = "END_CALL"
                                                putExtra("APP_IN_FOREGROUND", appInForeground)
                                            }
                                            context.applicationContext.startForegroundService(endIntent)
                                        }
                                    } else {
                                        // Headless task registered a promise but timed out / got stuck —
                                        // force END_CALL so the foreground service stops and the
                                        // notification is dismissed. The service is already running so
                                        // startService (not startForegroundService) is safe here.
                                        val endIntent = Intent(context, HandleSipCallHeadlessTask::class.java).apply {
                                            action = "END_CALL"
                                            putExtra(EXTRA_CALL_UUID, callUuid)
                                            putExtra("APP_IN_FOREGROUND", appInForeground)
                                        }
                                        try {
                                            context.applicationContext.startService(endIntent)
                                        } catch (e: Exception) {
                                            Log.e(TAG, "REJECT auto-decline: startService END_CALL FAILED", e)
                                        }
                                    }
                                } catch (e: Exception) {
                                    Log.e(TAG, "REJECT startForegroundService FAILED", e)
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Exception in broadcast receiver", e)
                    try { resolveRNPromise(callUuid, "ERROR") } catch (_: Exception) {}
                }
            }
        }
        } catch (e: Exception) {
            Log.e(TAG, "onReceive FAILED", e)
        }
    }

    private fun isAppInForeground(context: Context): Boolean {
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return false
        val appProcesses = activityManager.runningAppProcesses ?: return false
        val packageName = context.packageName
        for (appProcess in appProcesses) {
            if (appProcess.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
                && appProcess.processName == packageName) {
                return true
            }
        }
        return false
    }

    private fun foregroundApp(context: Context, callUuid: String? = null) {
        try {
            Log.d(TAG, "foregroundApp: callUuid=$callUuid")
            val activityIntent = Intent(context, MainActivity::class.java)
            activityIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            )
            if (callUuid != null) {
                activityIntent.putExtra("LAUNCH_FROM_ANSWER", true)
                activityIntent.putExtra("CALL_UUID", callUuid)
            }
            context.startActivity(activityIntent)
            Log.d(TAG, "foregroundApp: startActivity completed")
        } catch (e: Exception) {
            Log.e(TAG, "foregroundApp startActivity FAILED", e)
            throw e
        }
    }

    data class IncomingCallNotification(val callUuid: String, val promise: Promise?)

    companion object {
        private const val TAG = "VoxoConnect:IncomingCallReceiver"
        private const val DUPLICATE_ANSWER_WINDOW_MS = 1500L
        val promises = HashMap<String, IncomingCallNotification?>()
        val pendingNotificationResults = HashMap<String, String>()
        private val lastAnswerAtMs = HashMap<String, Long>()

        /** Set when Answer from heads-up (unlocked); cleared when CALL_ANSWERED launches MainActivity. */
        @Volatile
        var pendingHeadsUpUnlockedCallUuid: String? = null

        /**
         * If callUuid matches pendingHeadsUpUnlockedCallUuid, launch MainActivity and clear the flag.
         * Called from HandleSipCallHeadlessTask when CALL_ANSWERED (after SIP 200 OK sent).
         */
        fun launchMainActivityIfPending(context: Context, callUuid: String): Boolean {
            val pending = pendingHeadsUpUnlockedCallUuid
            if (pending != callUuid) return false
            pendingHeadsUpUnlockedCallUuid = null
            try {
                val activityIntent = Intent(context.applicationContext, MainActivity::class.java)
                activityIntent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                )
                activityIntent.putExtra("LAUNCH_FROM_ANSWER", true)
                activityIntent.putExtra("CALL_UUID", callUuid)
                context.applicationContext.startActivity(activityIntent)
                Log.d(TAG, "launchMainActivityIfPending: launched MainActivity for $callUuid")
                return true
            } catch (e: Exception) {
                Log.e(TAG, "launchMainActivityIfPending FAILED", e)
                return false
            }
        }

        private fun isDuplicateAnswer(callUuid: String): Boolean {
            val now = System.currentTimeMillis()
            val previous = lastAnswerAtMs[callUuid]
            lastAnswerAtMs[callUuid] = now
            return previous != null && (now - previous) < DUPLICATE_ANSWER_WINDOW_MS
        }

        fun registerPromise(callUuid: String, promise: Promise) {
            try {
                Log.d(TAG, "registerPromise: $callUuid")
                promises[callUuid] = IncomingCallNotification(callUuid, promise)
            } catch (e: Exception) {
                Log.e(TAG, "registerPromise FAILED for $callUuid", e)
            }
        }

        fun resolvePromiseExternal(callUuid: String, result: String) {
            try {
                val notification = promises.getOrDefault(callUuid, null)
                if (notification != null && notification.promise != null) {
                    Log.d(TAG, "resolvePromiseExternal: $callUuid = $result")
                    notification.promise.resolve(result)
                    removePromise(callUuid)
                } else {
                    pendingNotificationResults[callUuid] = result
                }
            } catch (e: Exception) {
                Log.e(TAG, "resolvePromiseExternal FAILED for $callUuid", e)
            }
        }

        private fun removePromise(callUuid: String?) {
            promises.remove(callUuid)
        }
    }
}
