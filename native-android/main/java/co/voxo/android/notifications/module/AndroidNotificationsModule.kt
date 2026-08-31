package co.voxo.android.notifications.module

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.module.annotations.ReactModule
import co.voxo.android.AppForegroundTracker
import co.voxo.android.LaunchFromAnswerCleanup
import co.voxo.android.LaunchFromAnswerStore
import co.voxo.android.VoxoConnectFirebaseService
import co.voxo.android.notifications.IncomingCallAutoDecline
import co.voxo.android.notifications.IncomingCallNotificationFactory
import co.voxo.android.notifications.IncomingCallRingtonePlayer
import co.voxo.android.notifications.VoxoConnectIncomingCallBroadcastReceiver
import co.voxo.android.headlessTasks.HandleSipCallHeadlessTask
import co.voxo.android.MainApplication
import co.voxo.android.VoxoCallNotificationPrefs
import co.voxo.android.VoxoSmsContactNamePrefs
import co.voxo.android.notifications.SmsTrayDisplayState
import co.voxo.android.notifications.SystemTrayNotificationCanceler
import io.wazo.callkeep.Constants

@ReactModule(name = "VoxoConnectAndroidNotifications")
class AndroidNotificationsModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName(): String {
        return "VoxoConnectAndroidNotifications"
    }

    @ReactMethod
    fun setEnableMobileCallNotifications(enabled: Boolean) {
        VoxoCallNotificationPrefs.setEnableMobileCallNotifications(context, enabled)
        Log.i(TAG, "setEnableMobileCallNotifications=$enabled")
    }

    /**
     * Synchronous read for index.js background handler (Redux may not be ready).
     */
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getEnableMobileCallNotifications(): Boolean {
        return VoxoCallNotificationPrefs.isEnableMobileCallNotifications(context)
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getDeviceContactNameForPhone(phoneNumber: String): String? {
        return try {
            VoxoSmsContactNamePrefs.getContactNameForPhone(context, phoneNumber)
        } catch (e: Exception) {
            Log.w(TAG, "getDeviceContactNameForPhone failed", e)
            null
        }
    }

    @ReactMethod
    fun syncSmsContactNameCache(json: String) {
        try {
            VoxoSmsContactNamePrefs.syncCache(context, json)
            Log.i(TAG, "syncSmsContactNameCache OK")
        } catch (e: Exception) {
            Log.w(TAG, "syncSmsContactNameCache failed", e)
        }
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getSmsConversationTitle(conversationId: String): String? {
        return try {
            VoxoSmsContactNamePrefs.getConversationTitle(context, conversationId)
        } catch (e: Exception) {
            Log.w(TAG, "getSmsConversationTitle failed", e)
            null
        }
    }

    /**
     * Cancel the FCM system-tray notification (Notifee cannot cancel it).
     * Used by the background JS handler before posting a Notifee banner with a resolved contact name.
     */
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun cancelSmsSystemTrayNotification(
        title: String,
        body: String,
        messageId: String?
    ): Boolean {
        return cancelSmsSystemTrayNotificationImpl(title, body, messageId)
    }

    private fun cancelSmsSystemTrayNotificationImpl(
        title: String,
        body: String,
        messageId: String?
    ): Boolean {
        return try {
            val appContext = context.applicationContext
            var canceled = SystemTrayNotificationCanceler.cancelByTitleAndBody(
                appContext,
                title,
                body ?: ""
            )
            if (!messageId.isNullOrBlank()) {
                canceled = SystemTrayNotificationCanceler.cancelByMessageId(
                    appContext,
                    messageId
                ) || canceled
            }
            canceled
        } catch (e: Exception) {
            Log.w(TAG, "cancelSmsSystemTrayNotification failed", e)
            false
        }
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun wasSmsTrayResolvedByNative(messageId: String?): Boolean {
        return SmsTrayDisplayState.wasResolvedByNative(context.applicationContext, messageId)
    }

    @ReactMethod
    fun markSmsTrayResolvedByNative(messageId: String?) {
        SmsTrayDisplayState.markResolved(context.applicationContext, messageId)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for NativeEventEmitter
    }

    /**
     * Returns a Promise that resolves when the user answers or rejects the incoming call
     * from the notification UI. The Promise is resolved by VoxoConnectIncomingCallBroadcastReceiver
     * when the user taps Answer/Reject.
     *
     * This is the critical bridge that keeps the headless JS task alive while the SIP session
     * waits for user action (mirroring voxo-mobile's getIncomingCallNotificationResult).
     */
    @ReactMethod
    fun getIncomingCallNotificationResult(callUuid: String, promise: Promise) {
        try {
            val pendingAction = VoxoConnectIncomingCallBroadcastReceiver.pendingNotificationResults[callUuid]
            if (pendingAction != null) {
                Log.d(TAG, "getIncomingCallNotificationResult: immediate result for $callUuid = $pendingAction")
                VoxoConnectIncomingCallBroadcastReceiver.pendingNotificationResults.remove(callUuid)
                promise.resolve(pendingAction)
            } else {
                Log.d(TAG, "getIncomingCallNotificationResult: registering promise for $callUuid")
                VoxoConnectIncomingCallBroadcastReceiver.registerPromise(callUuid, promise)
            }
        } catch (e: Exception) {
            Log.e(TAG, "[HEADLESS] getIncomingCallNotificationResult FAILED", e)
            promise.reject("ERROR", e.message ?: "getIncomingCallNotificationResult failed", e)
        }
    }

    /**
     * Post the custom incoming call notification (same UI as killed state) from JS.
     * Used for foreground/background so all Android states show the same custom notification.
     * Call getIncomingCallNotificationResult(callUuid) before this to register for Answer/Reject.
     */
    @ReactMethod
    fun postIncomingCallNotification(
        callUuid: String,
        callerNumber: String,
        callerName: String,
        secondLineMode: Boolean
    ) {
        try {
            if (!VoxoCallNotificationPrefs.isEnableMobileCallNotifications(context)) {
                Log.i(TAG, "postIncomingCallNotification suppressed — enableMobileCallNotifications off")
                return
            }
            HandleSipCallHeadlessTask.postIncomingCallNotificationFromContext(
                context,
                callUuid,
                callerNumber,
                callerName,
                secondLineMode
            )
            Log.i(TAG, "postIncomingCallNotification: uuid=$callUuid secondLine=$secondLineMode")
        } catch (e: Exception) {
            Log.e(TAG, "postIncomingCallNotification FAILED", e)
        }
    }

    /**
     * Notify native side that SIP signalling has been established for a call.
     * Posts the incoming call notification directly so it shows even when the headless service
     * was destroyed (e.g. second call when React context already existed). The service's broadcast
     * receiver may be unregistered by onDestroy - this ensures the notification always appears.
     */
    @ReactMethod
    fun reportSignallingEstablished(callUuid: String, secondLineHint: Boolean) {
        try {
            Log.i(TAG, "[HEADLESS] reportSignallingEstablished: INVITE received for $callUuid hint=$secondLineHint")
            if (!VoxoCallNotificationPrefs.isEnableMobileCallNotifications(context)) {
                Log.i(TAG, "[HEADLESS] reportSignallingEstablished suppressed — enableMobileCallNotifications off")
                return
            }
            if (AppForegroundTracker.isAppInForeground()) {
                Log.i(TAG, "[HEADLESS] reportSignallingEstablished: foreground — JS owns notification, skip native post")
                return
            }
            // Post notification directly - decouples from service lifecycle (fixes second-call bug)
            val bundle = VoxoConnectFirebaseService.IncomingCallBundles[callUuid]
            if (bundle != null) {
                val callerNumber = bundle.getString("callerNumber") ?: "Unknown"
                val callerName = bundle.getString("callerName") ?: "Unknown Caller"
                val secondLine = secondLineHint
                HandleSipCallHeadlessTask.postIncomingCallNotificationFromContext(
                    context,
                    callUuid,
                    callerNumber,
                    callerName,
                    secondLineMode = secondLine
                )
            } else {
                Log.w(TAG, "[HEADLESS] reportSignallingEstablished: no bundle for $callUuid")
            }
            // Also broadcast for service receiver (if service still alive)
            LocalBroadcastManager.getInstance(context).sendBroadcast(
                Intent("ACTION_SIP_SIGNALLING_ESTABLISHED")
                    .putExtra(Constants.EXTRA_CALL_UUID, callUuid)
                    .putExtra("SECOND_LINE_MODE", secondLineHint)
            )
        } catch (e: Exception) {
            Log.e(TAG, "[HEADLESS] reportSignallingEstablished FAILED", e)
        }
    }

    /**
     * Show ongoing call notification (foreground flow). Shows caller name and hang up button.
     * Call dismissOngoingCallNotification when call ends.
     */
    @ReactMethod
    fun showOngoingCallNotification(callUuid: String, callerName: String) {
        try {
            HandleSipCallHeadlessTask.postOngoingCallNotificationFromContext(
                context,
                callUuid,
                callerName.ifEmpty { "Unknown" }
            )
        } catch (e: Exception) {
            Log.e(TAG, "showOngoingCallNotification FAILED", e)
        }
    }

    /**
     * Dismiss the ongoing call notification (foreground flow). Call when call ends.
     */
    @ReactMethod
    fun dismissOngoingCallNotification() {
        try {
            HandleSipCallHeadlessTask.dismissOngoingCallNotificationFromContext(context)
        } catch (e: Exception) {
            Log.e(TAG, "dismissOngoingCallNotification FAILED", e)
        }
    }

    /**
     * Cancel the notification for one call UUID (ongoing or incoming). Does not stop the FGS;
     * use reportCallEnded for custom-notification calls that own the foreground service.
     */
    @ReactMethod
    fun cancelCallNotification(callUuid: String) {
        try {
            HandleSipCallHeadlessTask.dismissNotificationForCallOnly(context, callUuid)
        } catch (e: Exception) {
            Log.e(TAG, "cancelCallNotification FAILED", e)
        }
    }

    /**
     * Request the headless task to send SIP BYE for this call (when main app doesn't own the session).
     * Emits HeadlessHangupRequested so the headless JS task can hang up and then reportCallEnded.
     */
    @ReactMethod
    fun requestHeadlessHangup(callUuid: String) {
        try {
            if (context.hasActiveReactInstance()) {
                val args = Arguments.createMap()
                args.putString("callUuid", callUuid)
                context.emitDeviceEvent("HeadlessHangupRequested", args)
                Log.i(TAG, "requestHeadlessHangup: emitted HeadlessHangupRequested for $callUuid")
            }
        } catch (e: Exception) {
            Log.e(TAG, "requestHeadlessHangup FAILED", e)
        }
    }

    /**
     * Report that the user answered the call. Replaces incoming notification with ongoing
     * (stops ringtone/vibration) and keeps service alive for the call.
     * @param callUuid Call UUID
     * @param callerName Optional caller name for ongoing notification (when app was in foreground,
     *        IncomingCallBundles may be empty; passing this ensures the name is shown)
     */
    /**
     * Synchronously stop [IncomingCallRingtonePlayer] before JS starts InCallManager.
     * Blocking so the RN thread cannot proceed to getUserMedia while STREAM_RING is active.
     */
    /**
     * Stop ring + one-time post-ring audio reset. Safe to call once at answer.
     * If ring already stopped, only stops player — no MODE_NORMAL reset (avoids killing WebRTC playout).
     */
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun stopIncomingCallRingtone(callUuid: String) {
        try {
            val wasRinging = IncomingCallRingtonePlayer.isRinging(callUuid)
            IncomingCallRingtonePlayer.stop(callUuid)
            if (wasRinging) {
                IncomingCallRingtonePlayer.resetAudioRouteAfterRing(context)
                primeCommunicationAudioMode()
                Log.i(TAG, "stopIncomingCallRingtone: $callUuid (ring was active, audio route reset)")
            } else {
                Log.i(TAG, "stopIncomingCallRingtone: $callUuid (ring already stopped, skip audio reset)")
            }
        } catch (e: Exception) {
            Log.e(TAG, "stopIncomingCallRingtone FAILED", e)
        }
    }

    /** After STREAM_RING stops, flush ring route then enter communication mode for WebRTC playout. */
    private fun primeCommunicationAudioMode() {
        try {
            val audioManager =
                context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.clearCommunicationDevice()
            }
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = false
            // Brief NORMAL clears STREAM_RING routing on some OEMs (Oppo/OnePlus).
            audioManager.mode = AudioManager.MODE_NORMAL
            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val earpiece =
                    audioManager.availableCommunicationDevices.firstOrNull {
                        it.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
                    }
                if (earpiece != null) {
                    audioManager.setCommunicationDevice(earpiece)
                }
            }

            Log.i(TAG, "primeCommunicationAudioMode: MODE_IN_COMMUNICATION (post-ring reset)")
        } catch (e: Exception) {
            Log.w(TAG, "primeCommunicationAudioMode FAILED", e)
        }
    }

    @ReactMethod
    fun reportCallAnswered(callUuid: String, callerName: String?) {
        try {
            IncomingCallAutoDecline.cancel(callUuid)
            IncomingCallAutoDecline.markTerminal(callUuid)
            IncomingCallRingtonePlayer.stop(callUuid)
            Log.i(TAG, "[HEADLESS] reportCallAnswered: swapping to ongoing notification for $callUuid callerName=$callerName")
            val service = Intent(context, HandleSipCallHeadlessTask::class.java).apply {
                action = "CALL_ANSWERED"
                putExtra(Constants.EXTRA_CALL_UUID, callUuid)
                callerName?.let { putExtra(Constants.EXTRA_CALLER_NAME, it) }
            }
            context.applicationContext.startForegroundService(service)
            LocalBroadcastManager.getInstance(context).sendBroadcast(
                Intent("ACTION_UPDATE_UI")
                    .putExtra(Constants.EXTRA_CALL_UUID, callUuid)
            )
        } catch (e: Exception) {
            Log.e(TAG, "[HEADLESS] reportCallAnswered startForegroundService FAILED", e)
        }
    }

    /**
     * Report that the call has ended. Dismisses notification and stops the headless service.
     * @param callUuid Call UUID to end
     * @param appInForeground When true, only dismisses notification and does NOT stop the
     *        headless service — prevents app from closing when user is in InCallScreen.
     *        When false/omitted, stops the service (for reject/cancel flows).
     */
    @ReactMethod
    fun reportCallEnded(callUuid: String, appInForeground: Boolean?) {
        try {
            IncomingCallAutoDecline.cancel(callUuid)
            IncomingCallAutoDecline.markTerminal(callUuid)
            val inForeground = appInForeground == true
            Log.i(TAG, "[HEADLESS] reportCallEnded: callUuid=$callUuid appInForeground=$inForeground")
            VoxoConnectIncomingCallBroadcastReceiver.resolvePromiseExternal(callUuid, "CANCEL")
            if (context.hasActiveReactInstance()) {
                try {
                    val args = Arguments.createMap().apply {
                        putString("callUuid", callUuid)
                    }
                    context.emitDeviceEvent("HeadlessCallEnded", args)
                } catch (e: Exception) {
                    Log.e(TAG, "[HEADLESS] reportCallEnded emit HeadlessCallEnded FAILED", e)
                }
            }
            // Cancel notification directly first so it disappears even if the service start
            // below fails (Android 8+ background execution limits can silently drop startService).
            cancelCallNotificationsForUuid(context, callUuid)
            // Also start service to call stopForeground() for FGS-posted notifications.
            try {
                val service = Intent(context, HandleSipCallHeadlessTask::class.java).apply {
                    action = "END_CALL"
                    putExtra(Constants.EXTRA_CALL_UUID, callUuid)
                    putExtra("APP_IN_FOREGROUND", inForeground)
                }
                context.applicationContext.startService(service)
            } catch (e: Exception) {
                Log.w(TAG, "[HEADLESS] reportCallEnded END_CALL startService FAILED (bg limits?)", e)
            }
            // Dismiss IncomingCallFullScreenActivity (lock-screen incoming UI) in case the call
            // ended via the REJECT/CANCEL path rather than through reportIncomingCallCancelled.
            try {
                LocalBroadcastManager.getInstance(context).sendBroadcast(
                    Intent("ACTION_INCOMING_CALL_CANCELLED")
                        .putExtra(Constants.EXTRA_CALL_UUID, callUuid)
                )
            } catch (e: Exception) {
                Log.e(TAG, "[HEADLESS] reportCallEnded ACTION_INCOMING_CALL_CANCELLED broadcast FAILED", e)
            }
        } catch (e: Exception) {
            Log.e(TAG, "[HEADLESS] reportCallEnded FAILED", e)
        }
    }

    /**
     * Report that an incoming call was cancelled (e.g. user declined, caller hung up before answer).
     * Dismisses the notification and cleans up.
     * @param appInForeground When true, only dismisses notification and does NOT stop the headless
     *        service — prevents app from closing when user declines while app is in foreground.
     */
    @ReactMethod
    fun reportIncomingCallCancelled(callUuid: String, appInForeground: Boolean?) {
        try {
            IncomingCallRingtonePlayer.stop(callUuid)
            IncomingCallAutoDecline.cancel(callUuid)
            IncomingCallAutoDecline.markTerminal(callUuid)
            LaunchFromAnswerCleanup.onCallEnded(callUuid)
            val inForeground = appInForeground == true
            Log.d(TAG, "reportIncomingCallCancelled: $callUuid appInForeground=$inForeground")
            VoxoConnectIncomingCallBroadcastReceiver.resolvePromiseExternal(callUuid, "CANCEL")

            // Always cancel the notification directly — startService can fail silently on
            // Android 8+ when the app is in background (background execution limits), which
            // would leave the heads-up / shade notification stuck even after the call ends.
            cancelCallNotificationsForUuid(context, callUuid)
            if (!inForeground) {
                // Also start service so it can call stopForeground() for FGS-posted notifications.
                // This is best-effort; the direct cancel above is the primary path.
                try {
                    val service = Intent(context, HandleSipCallHeadlessTask::class.java).apply {
                        action = "END_CALL"
                        putExtra(Constants.EXTRA_CALL_UUID, callUuid)
                        putExtra("APP_IN_FOREGROUND", false)
                    }
                    context.applicationContext.startService(service)
                } catch (e: Exception) {
                    Log.w(TAG, "[HEADLESS] reportIncomingCallCancelled END_CALL startService FAILED (bg limits?)", e)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "[HEADLESS] reportIncomingCallCancelled FAILED", e)
        }
        try {
            LocalBroadcastManager.getInstance(context).sendBroadcast(
                Intent("ACTION_INCOMING_CALL_CANCELLED")
                    .putExtra(Constants.EXTRA_CALL_UUID, callUuid)
            )
        } catch (e: Exception) {
            Log.e(TAG, "[HEADLESS] reportIncomingCallCancelled sendBroadcast FAILED", e)
        }
    }

    /**
     * Notify native side to update the in-call activity UI (e.g. after call is connected).
     */
    @ReactMethod
    fun updateCallActivityUi() {
        try {
            LocalBroadcastManager.getInstance(context).sendBroadcast(Intent("ACTION_UPDATE_UI"))
        } catch (e: Exception) {
            Log.e(TAG, "[HEADLESS] updateCallActivityUi FAILED", e)
        }
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun canUseFullScreenIntent(): Boolean {
        return IncomingCallNotificationFactory.canUseFullScreenIntent(context)
    }

    @ReactMethod
    fun openFullScreenIntentSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
        try {
            val intent = Intent(android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                data = android.net.Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "openFullScreenIntentSettings FAILED", e)
        }
    }

    /**
     * Fallback: Get launch-from-answer intent when app was opened from Answer on notification.
     * MainActivity stores this when started with LAUNCH_FROM_ANSWER. Use when getLaunchOptions
     * didn't run (e.g. React context reused from headless task).
     */
    @ReactMethod
    fun getLaunchFromAnswerIntent(promise: Promise) {
        try {
            val bundle = LaunchFromAnswerStore.getAndClear()
            if (bundle == null) {
                promise.resolve(null)
                return
            }
            val result = Arguments.createMap().apply {
                putBoolean("launchFromAnswer", true)
                putString("callUuid", bundle.getString("callUuid"))
                putString("callerName", bundle.getString("callerName") ?: "Unknown Caller")
                putString("callerNumber", bundle.getString("callerNumber") ?: "Unknown")
            }
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "getLaunchFromAnswerIntent FAILED", e)
            promise.reject("ERROR", e.message ?: "getLaunchFromAnswerIntent failed", e)
        }
    }

    /**
     * Fallback: Start HandleSipCallHeadlessTask from JS when VoipBridge is not initialized
     * (e.g. app cold-start from killed state; background handler runs before SoftphoneProvider mounts).
     * Mirrors VoxoConnectFirebaseService's flow when reactContext is null.
     */
    @ReactMethod
    fun startInboundCallHeadlessTask(
        callUuid: String,
        callerName: String,
        callerNumber: String,
        payload: ReadableMap,
        promise: Promise
    ) {
        Log.i(TAG, "[KILL_FALLBACK] startInboundCallHeadlessTask called: callUuid=$callUuid caller=$callerName")
        try {
            if (!VoxoCallNotificationPrefs.isEnableMobileCallNotifications(context)) {
                Log.i(TAG, "[KILL_FALLBACK] Suppressed — enableMobileCallNotifications off")
                promise.resolve(false)
                return
            }
            if (HandleSipCallHeadlessTask.isHandlingCall(callUuid)) {
                Log.i(TAG, "[KILL_FALLBACK] Already handling $callUuid, skipping duplicate")
                promise.resolve(true)
                return
            }
            val payloadBundle = readableMapToBundle(payload)
            payloadBundle.putString("callUuid", callUuid)
            payloadBundle.putString("callerName", callerName)
            payloadBundle.putString("callerNumber", callerNumber)
            payloadBundle.putString("action", "answer")
            payloadBundle.putString("direction", "inbound")

            VoxoConnectFirebaseService.IncomingCallBundles[callUuid] = payloadBundle

            val service = Intent(context, HandleSipCallHeadlessTask::class.java).apply {
                action = "INBOUND_CALL"
                putExtras(payloadBundle)
                putExtra(Constants.EXTRA_CALL_UUID, callUuid)
                putExtra(Constants.EXTRA_CALL_NUMBER, callerNumber)
                putExtra(Constants.EXTRA_CALLER_NAME, callerName)
            }
            Log.i(TAG, "[KILL_FALLBACK] Starting HandleSipCallHeadlessTask INBOUND_CALL (from JS, VoipBridge not init)")
            try {
                context.applicationContext.startForegroundService(service)
            } catch (e: Exception) {
                Log.e(TAG, "[KILL_FALLBACK] startForegroundService FAILED (may be ForegroundServiceStartNotAllowedException)", e)
                promise.reject("ERROR", e.message ?: "startForegroundService failed", e)
                return
            }
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "[KILL_FALLBACK] Error starting headless task", e)
            promise.reject("ERROR", e.message ?: "Failed to start headless task", e)
        }
    }

    private fun readableMapToBundle(map: ReadableMap): Bundle {
        val bundle = Bundle()
        val iterator = map.keySetIterator()
        while (iterator.hasNextKey()) {
            val key = iterator.nextKey()
            when (map.getType(key)) {
                ReadableType.String -> map.getString(key)?.let { bundle.putString(key, it) }
                ReadableType.Number -> bundle.putDouble(key, map.getDouble(key))
                ReadableType.Boolean -> bundle.putBoolean(key, map.getBoolean(key))
                else -> { /* skip null, Map, Array */ }
            }
        }
        return bundle
    }

    private fun cancelCallNotificationsForUuid(ctx: Context, callUuid: String) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val nid = HandleSipCallHeadlessTask.releaseNotificationIdForCall(callUuid)
        if (nid != null) nm.cancel(nid)
        HandleSipCallHeadlessTask.cancelLegacySlots(nm)
    }

    companion object {
        private const val TAG = "VoxoConnect:AndroidNotificationsModule"
    }
}
