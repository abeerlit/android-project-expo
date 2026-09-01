package co.voxo.android.telecom

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telecom.Connection
import android.os.Bundle
import android.util.Log
import com.facebook.react.ReactApplication
import co.voxo.android.MainActivity
import co.voxo.android.VoxoConnectFirebaseService
import co.voxo.android.headlessTasks.HandleSipCallHeadlessTask
import co.voxo.android.notifications.VoxoConnectIncomingCallBroadcastReceiver
import io.wazo.callkeep.Constants.ACTION_ANSWER_CALL
import io.wazo.callkeep.Constants.ACTION_END_CALL
import io.wazo.callkeep.Constants.ACTION_ON_CREATE_CONNECTION_FAILED
import io.wazo.callkeep.Constants.ACTION_ONGOING_CALL
import io.wazo.callkeep.Constants.ACTION_SHOW_INCOMING_CALL_UI
import io.wazo.callkeep.Constants.EXTRA_CALL_NUMBER
import io.wazo.callkeep.Constants.EXTRA_CALLER_NAME
import io.wazo.callkeep.Constants.EXTRA_CALL_UUID
import io.wazo.callkeep.VoiceConnectionService
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

/**
 * Receives CallKeep broadcasts (ACTION_SHOW_INCOMING_CALL_UI, etc.)
 * and starts HandleSipCallHeadlessTask to run JS for SIP establishment.
 */
class CallKeepBroadcastReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "onReceive ${intent.action}")
        val attributeMap = intent.getSerializableExtra("attributeMap") as? HashMap<String, String>

        when (intent.action) {
            ACTION_SHOW_INCOMING_CALL_UI -> {
                if (attributeMap != null) {
                    val callUuid = attributeMap[EXTRA_CALL_UUID]
                    val callerNumber = attributeMap[EXTRA_CALL_NUMBER]
                    val callerName = attributeMap[EXTRA_CALLER_NAME]
                    if (callUuid != null && callerNumber != null && callerName != null) {
                        // Only start the headless task when the FCM bundle exists in IncomingCallBundles.
                        // When missing, this ACTION_SHOW_INCOMING_CALL_UI was triggered by JS-side
                        // CallKeep.displayIncomingCall (foreground/background flow) and the foreground
                        // SIP UA already has the session — starting a headless task would create a
                        // duplicate SIP UA that forks the call on the server.
                        val inboundPayload = VoxoConnectFirebaseService.IncomingCallBundles[callUuid]
                        if (inboundPayload == null) {
                            Log.d(TAG, "No IncomingCallBundle for $callUuid — JS-side displayIncomingCall, foreground SIP UA handles. Skipping headless task.")
                            return
                        }

                        val callerNumberDecoded = try {
                            URLDecoder.decode(callerNumber, StandardCharsets.UTF_8.name())
                        } catch (_: Exception) { callerNumber }

                        inboundPayload.putString("action", "answer")
                        inboundPayload.putString("direction", "inbound")

                        val service = Intent("INBOUND_CALL", null, context, HandleSipCallHeadlessTask::class.java)
                            .putExtras(inboundPayload)
                            .putExtra(EXTRA_CALL_UUID, callUuid)
                            .putExtra(EXTRA_CALL_NUMBER, callerNumberDecoded)
                            .putExtra(EXTRA_CALLER_NAME, callerName)
                        Log.d(TAG, "Invoking HandleSipCallHeadlessTask INBOUND_CALL (app killed, FCM bundle found)")
                        context.startForegroundService(service)
                    }
                }
            }
            ACTION_ONGOING_CALL -> {
                if (attributeMap != null) {
                    val callUuid = attributeMap[EXTRA_CALL_UUID]
                    val callerNumber = attributeMap[EXTRA_CALL_NUMBER]
                    if (callUuid != null && callerNumber != null) {
                        val outboundPayload = Bundle().apply {
                            putString("action", "call")
                            putString("direction", "outbound")
                            putString("callUuid", callUuid)
                            putString("callerNumber", callerNumber)
                        }
                        val service = Intent("OUTBOUND_CALL", null, context, HandleSipCallHeadlessTask::class.java)
                            .putExtras(outboundPayload)
                        context.startForegroundService(service)
                    }
                }
            }
            ACTION_ANSWER_CALL -> {
                if (attributeMap != null) {
                    val callUuid = attributeMap[EXTRA_CALL_UUID]
                    val callerName = attributeMap[EXTRA_CALLER_NAME]
                    val callerNumber = attributeMap[EXTRA_CALL_NUMBER]
                    if (callUuid != null) {
                        // Resolve the headless task's getIncomingCallNotificationResult promise so
                        // it can run sessionManager.answerCall(sessionId).
                        VoxoConnectIncomingCallBroadcastReceiver.resolvePromiseExternal(callUuid, "ANSWER")
                        // Bring app to foreground so user sees InCallScreen.
                        val activityIntent = Intent(context, MainActivity::class.java).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            putExtra("LAUNCH_FROM_ANSWER", true)
                            putExtra("CALL_UUID", callUuid)
                        }
                        context.startActivity(activityIntent)
                        val service = Intent("ONGOING_CALL", null, context, HandleSipCallHeadlessTask::class.java).apply {
                            putExtra(EXTRA_CALL_UUID, callUuid)
                            putExtra(EXTRA_CALLER_NAME, callerName ?: callerNumber ?: "Unknown")
                            putExtra(EXTRA_CALL_NUMBER, callerNumber ?: "")
                        }
                        context.startForegroundService(service)
                        return
                    }
                }
                val service = Intent("ONGOING_CALL", null, context, HandleSipCallHeadlessTask::class.java)
                context.startForegroundService(service)
            }
            ACTION_END_CALL -> {
                val hasRinging = VoiceConnectionService.currentConnections.values.any { it.state == Connection.STATE_NEW }
                if (!hasRinging) {
                    val app = context.applicationContext as? ReactApplication
                    val reactContext = app?.reactNativeHost?.reactInstanceManager?.currentReactContext
                    val appInForeground = reactContext?.hasActiveReactInstance() == true

                    val service = Intent("END_CALL", null, context, HandleSipCallHeadlessTask::class.java)
                        .putExtra("APP_IN_FOREGROUND", appInForeground)
                    context.startForegroundService(service)
                }
            }
            ACTION_ON_CREATE_CONNECTION_FAILED -> {
                if (attributeMap != null) {
                    val callUuid = attributeMap[EXTRA_CALL_UUID]
                    val callerNumber = attributeMap[EXTRA_CALL_NUMBER]
                    val callerName = attributeMap[EXTRA_CALLER_NAME]
                    // Resolve the headless task's getIncomingCallNotificationResult promise so it can run sessionManager.declineCall(sessionId).
                    if (callUuid != null) {
                        VoxoConnectIncomingCallBroadcastReceiver.resolvePromiseExternal(callUuid, "REJECT")
                    }
                    if (callUuid != null && callerNumber != null && callerName != null) {
                        // Only start the headless task when the FCM bundle exists in IncomingCallBundles.
                        // When missing, this ACTION_ON_CREATE_CONNECTION_FAILED was triggered by the user
                        // swiping away a JS-side CallKeep notification (foreground/background flow) and the
                        // foreground SIP UA already handled the rejection — starting a headless task would
                        // create a duplicate SIP UA that cancels the active call.
                        val rejectionPayload = VoxoConnectFirebaseService.IncomingCallBundles[callUuid]
                        if (rejectionPayload == null) {
                            Log.d(TAG, "No IncomingCallBundle for $callUuid — JS-side CallKeep rejection, foreground SIP UA handles. Skipping headless task.")
                            return
                        }

                        val callerNumberDecoded = try {
                            URLDecoder.decode(callerNumber, StandardCharsets.UTF_8.name())
                        } catch (_: Exception) { callerNumber }

                        rejectionPayload.putString("action", "reject")

                        val app = context.applicationContext as? ReactApplication
                        val reactContext = app?.reactNativeHost?.reactInstanceManager?.currentReactContext
                        val appInForeground = reactContext?.hasActiveReactInstance() == true

                        val service = Intent("REJECT_CALL", null, context, HandleSipCallHeadlessTask::class.java)
                            .putExtras(rejectionPayload)
                            .putExtra(EXTRA_CALL_UUID, callUuid)
                            .putExtra(EXTRA_CALL_NUMBER, callerNumberDecoded)
                            .putExtra(EXTRA_CALLER_NAME, callerName)
                            .putExtra("APP_IN_FOREGROUND", appInForeground)
                        Log.d(TAG, "Invoking HandleSipCallHeadlessTask REJECT_CALL (app killed, FCM bundle found)")
                        context.startForegroundService(service)
                    }
                }
            }
        }
    }

    companion object {
        private const val TAG = "VoxoConnect:CallKeepReceiver"
    }
}
