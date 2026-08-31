package co.voxo.android

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.RemoteMessage
import co.voxo.android.headlessTasks.HandleSipCallHeadlessTask
import co.voxo.android.VoxoCallNotificationPrefs
import co.voxo.android.AppForegroundTracker
import co.voxo.android.VoxoVoipPushStale
import io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService
import io.wazo.callkeep.Constants
import java.util.HashMap

/**
 * Receives FCM when app is in background or killed.
 * Incoming calls: native headless path when React is not running.
 * Chat/SMS/etc: forwards to RN Firebase via super.onMessageReceived for JS background handler.
 */
class VoxoConnectFirebaseService : ReactNativeFirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        try {
            cancelEmptyNotificationIfNeeded(message)
            val bundle = message.toIntent().extras
            val payloadType = bundle?.getString("vm_payload_type") ?: ""
            val clickAction = bundle?.getString("click_action") ?: ""
            val hasCallUuid = !(bundle?.getString("callUuid").isNullOrBlank())
            val hasPayloadCallUuid = !(bundle?.getString("payload_callUuid").isNullOrBlank())
            Log.i(
                TAG,
                "[FCM] onMessageReceived: vm_payload_type=$payloadType click_action=$clickAction callUuid=$hasCallUuid payload_callUuid=$hasPayloadCallUuid | VOICEMAIL_PUSH=${payloadType == "voicemail" || payloadType == "voicemail_notification"} MISSED_CALL_PUSH=${payloadType == "missed_call" || clickAction.contains("MISSED", ignoreCase = true)} INCOMING_CALL=${payloadType == "incoming_call_notification"}"
            )
            Log.d(TAG, "New message from FCM: $bundle")

            if (payloadType == "incoming_call_notification") {
                handleIncomingCallFcm(message, bundle)
                return
            }

            logSmsNotificationPayload(message, bundle)

            // SMS tray UI is owned by JS (see handleAndroidSmsFcm). Forward all FCM to RN.

            val reactContext = getReactContextSafe()
            // Chat, SMS, voicemail — deliver to @react-native-firebase/messaging background handler.
            Log.i(
                SMS_TAG,
                "forwardToJs=true reactContext=${reactContext != null} messageId=${message.messageId} " +
                    "collapseKey=${message.collapseKey} from=${message.from} sentTime=${message.sentTime}"
            )
            try {
                super.onMessageReceived(message)
                Log.i(SMS_TAG, "forwardToJs=done messageId=${message.messageId}")
            } catch (e: Exception) {
                Log.e(TAG, "[FCM] super.onMessageReceived failed (RN handler)", e)
                Log.e(SMS_TAG, "forwardToJs=FAILED messageId=${message.messageId} error=${e.message}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "[FCM] onMessageReceived FAILED", e)
            Log.e(SMS_TAG, "onMessageReceived=FAILED error=${e.message}")
        }
    }

    /**
     * Structured SMS / text-message FCM logging for adb filtering:
     *   adb logcat | grep -E "SMS-NOTIF|VoxoConnect:FirebaseService"
     */
    private fun isSmsNotification(message: RemoteMessage, bundle: Bundle?): Boolean {
        val data = message.data
        val clickAction = data["click_action"] ?: bundle?.getString("click_action") ?: ""
        val conversationId =
            data["conversationId"] ?: data["conversation_id"] ?: data["reference_id"]
                ?: bundle?.getString("conversationId")
                ?: bundle?.getString("conversation_id")
                ?: bundle?.getString("reference_id")
        return clickAction.equals("TEXT-RECEIVED", ignoreCase = true) ||
            !conversationId.isNullOrBlank() ||
            clickAction.contains("TEXT", ignoreCase = true)
    }

    private fun logSmsNotificationPayload(message: RemoteMessage, bundle: Bundle?) {
        val data = message.data
        val clickAction = data["click_action"] ?: bundle?.getString("click_action") ?: ""
        val conversationId =
            data["conversationId"] ?: data["conversation_id"] ?: data["reference_id"]
                ?: bundle?.getString("conversationId")
                ?: bundle?.getString("conversation_id")
                ?: bundle?.getString("reference_id")
        val messageId =
            data["messageId"] ?: data["message_id"] ?: bundle?.getString("messageId")
                ?: bundle?.getString("message_id") ?: message.messageId
        val from = data["from"] ?: bundle?.getString("from")
        val peerName = data["peerName"] ?: data["peer_name"] ?: bundle?.getString("peerName")
        val body =
            data["body"] ?: data["message"] ?: data["text"] ?: bundle?.getString("body")
                ?: bundle?.getString("message") ?: bundle?.getString("text")
        val ignorePush = data["ignorePush"] ?: bundle?.getString("ignorePush")
        val vmPayloadType =
            data["vm_payload_type"] ?: bundle?.getString("vm_payload_type") ?: ""
        val referenceId =
            data["reference_id"] ?: data["referenceId"] ?: bundle?.getString("reference_id")
        val hasSendbird = !data["sendbird"].isNullOrBlank() || !bundle?.getString("sendbird").isNullOrBlank()

        val isSmsCandidate =
            clickAction.equals("TEXT-RECEIVED", ignoreCase = true) ||
                !conversationId.isNullOrBlank() ||
                clickAction.contains("TEXT", ignoreCase = true)

        val systemNotif = message.notification
        val systemTitle = systemNotif?.title
        val systemBody = systemNotif?.body

        val dataKeys = (data.keys + (bundle?.keySet()?.map { it.toString() } ?: emptyList()))
            .distinct()
            .sorted()

        Log.i(
            SMS_TAG,
            "payload kind=${classifyPayloadKind(clickAction, conversationId, hasSendbird, vmPayloadType)} " +
                "isSmsCandidate=$isSmsCandidate hasSendbird=$hasSendbird"
        )
        Log.i(
            SMS_TAG,
            "smsFields click_action=${truncate(clickAction)} conversationId=${truncate(conversationId)} " +
                "messageId=${truncate(messageId)} from=${truncate(from)} peerName=${truncate(peerName)} " +
                "ignorePush=${truncate(ignorePush)} reference_id=${truncate(referenceId)} " +
                "vm_payload_type=${truncate(vmPayloadType)}"
        )
        Log.i(
            SMS_TAG,
            "smsBody data.body=${truncate(body)} system.title=${truncate(systemTitle)} " +
                "system.body=${truncate(systemBody)}"
        )
        Log.i(
            SMS_TAG,
            "smsChecks hasConversationId=${!conversationId.isNullOrBlank()} " +
                "hasClickAction=${clickAction.isNotBlank()} hasFrom=${!from.isNullOrBlank()} " +
                "hasPeerName=${!peerName.isNullOrBlank()} hasDisplayBody=${!body.isNullOrBlank() || !systemBody.isNullOrBlank()} " +
                "hasSystemNotificationBlock=${systemNotif != null} dataKeyCount=${data.size} bundleKeyCount=${bundle?.size() ?: 0}"
        )
        Log.i(SMS_TAG, "smsDataKeys=${dataKeys.joinToString(",")}")

        if (data.isNotEmpty()) {
            val redacted = data.entries
                .sortedBy { it.key }
                .joinToString(" | ") { (k, v) -> "$k=${truncate(v)}" }
            Log.i(SMS_TAG, "smsDataPayload $redacted")
        }

        if (bundle != null && !bundle.isEmpty) {
            val bundleDump = bundle.keySet()
                .sortedBy { it.toString() }
                .joinToString(" | ") { key ->
                    val value = bundle.get(key)?.toString()
                    "$key=${truncate(value)}"
                }
            Log.i(SMS_TAG, "smsBundleExtras $bundleDump")
        }

        if (isSmsCandidate) {
            val missing = mutableListOf<String>()
            if (conversationId.isNullOrBlank()) missing.add("conversationId")
            if (from.isNullOrBlank() && peerName.isNullOrBlank() && systemTitle.isNullOrBlank()) {
                missing.add("fromOrPeerNameOrSystemTitle")
            }
            if (body.isNullOrBlank() && systemBody.isNullOrBlank()) {
                missing.add("bodyOrSystemBody")
            }
            if (missing.isEmpty()) {
                Log.i(SMS_TAG, "smsReadyForDisplay=true (native sees required fields)")
            } else {
                Log.w(
                    SMS_TAG,
                    "smsReadyForDisplay=false missing=${missing.joinToString(",")} " +
                        "note=JS Notifee may still display if other fields present"
                )
            }
        }
    }

    private fun classifyPayloadKind(
        clickAction: String,
        conversationId: String?,
        hasSendbird: Boolean,
        vmPayloadType: String
    ): String {
        if (clickAction.equals("TEXT-RECEIVED", ignoreCase = true) ||
            !conversationId.isNullOrBlank()
        ) {
            return "sms"
        }
        if (hasSendbird) return "sendbird"
        if (vmPayloadType == "voicemail" || vmPayloadType == "voicemail_notification") {
            return "voicemail"
        }
        if (vmPayloadType == "incoming_call_notification") return "call"
        if (clickAction.isNotBlank()) return "click_action:$clickAction"
        return "other"
    }

    private fun truncate(value: String?, max: Int = 160): String {
        if (value.isNullOrEmpty()) return "null"
        return if (value.length <= max) value else "${value.take(max)}…(${value.length})"
    }

    private fun getReactContextSafe() = try {
        (application as MainApplication).reactNativeHost.reactInstanceManager.currentReactContext
    } catch (_: Exception) {
        null
    }

    private fun handleIncomingCallFcm(message: RemoteMessage, bundle: Bundle?) {
        val payloadBundle = Bundle()
        if (bundle != null) {
            val payloadPrefix = "payload_"
            val payloadKeys = bundle.keySet().filter { it.startsWith(payloadPrefix) }
            payloadKeys.forEach { key ->
                val newKey = key.replaceRange(0, payloadPrefix.length, "")
                val value = bundle.getString(key)
                payloadBundle.putString(newKey, value)
            }
            bundle.keySet().filter { !it.startsWith(payloadPrefix) }.forEach { key ->
                val value = bundle.getString(key)
                if (value != null) payloadBundle.putString(key, value)
            }
        }

        val callUuid = payloadBundle.getString("callUuid")
            ?: payloadBundle.getString("payload_callUuid")
            ?: bundle?.getString("callUuid")
        val callerName = payloadBundle.getString("callerName")
            ?: payloadBundle.getString("payload_callerName")
            ?: bundle?.getString("callerName")
        val callerNumber = payloadBundle.getString("callerNumber")
            ?: payloadBundle.getString("payload_callerNumber")
            ?: bundle?.getString("callerNumber")

        if (callUuid == null || callerName == null || callerNumber == null) {
            Log.w(TAG, "Missing call data: callUuid=$callUuid callerName=$callerName callerNumber=$callerNumber")
            return
        }

        if (VoxoVoipPushStale.logAndIsStale(payloadBundle, callUuid, "handleIncomingCallFcm")) {
            return
        }

        Log.i(TAG, "[FCM] Incoming Call: callUuid=$callUuid caller=$callerName number=$callerNumber")

        val appInForeground = AppForegroundTracker.isAppInForeground()
        val reactContext = getReactContextSafe()

        if (!VoxoCallNotificationPrefs.isEnableMobileCallNotifications(this)) {
            if (appInForeground && reactContext != null) {
                Log.i(
                    TAG,
                    "[FCM] Pref off, foreground — forward to JS only (no native notification)"
                )
                try {
                    super.onMessageReceived(message)
                } catch (e: Exception) {
                    Log.e(TAG, "[FCM] super.onMessageReceived failed (foreground, pref off)", e)
                }
            } else {
                Log.i(
                    TAG,
                    "[FCM] Incoming call suppressed — enableMobileCallNotifications off (background/killed)"
                )
            }
            return
        }

        IncomingCallBundles[callUuid] = payloadBundle
        payloadBundle.putString("action", "answer")
        payloadBundle.putString("direction", "inbound")

        if (appInForeground) {
            // Foreground: JS displayIncomingCall owns notification + ring — avoid duplicate with FCM post.
            Log.i(TAG, "[FCM] App foreground — skip native incoming notification; forward to JS if alive")
            if (reactContext != null) {
                try {
                    super.onMessageReceived(message)
                } catch (e: Exception) {
                    Log.e(TAG, "[FCM] super.onMessageReceived failed (foreground incoming call)", e)
                }
            }
            return
        }

        // Background/killed: show incoming-call UI + native ring immediately (before SIP/JS).
        HandleSipCallHeadlessTask.postIncomingCallNotificationFromContext(
            this,
            callUuid,
            callerNumber,
            callerName,
            secondLineMode = false
        )

        if (reactContext != null) {
            // React alive in background: also forward to JS so SIP session + promise registration run.
            Log.i(TAG, "[FCM] App background (React alive) — notification posted, forwarding to JS")
            try {
                super.onMessageReceived(message)
            } catch (e: Exception) {
                Log.e(TAG, "[FCM] super.onMessageReceived failed (background incoming call)", e)
            }
            return
        }

        val service = Intent(this, HandleSipCallHeadlessTask::class.java).apply {
            action = "INBOUND_CALL"
            putExtras(payloadBundle)
            putExtra(Constants.EXTRA_CALL_UUID, callUuid)
            putExtra(Constants.EXTRA_CALL_NUMBER, callerNumber)
            putExtra(Constants.EXTRA_CALLER_NAME, callerName)
        }
        Log.i(TAG, "[FCM] Starting HandleSipCallHeadlessTask INBOUND_CALL (app killed)")
        try {
            startForegroundService(service)
        } catch (e: Exception) {
            Log.e(TAG, "[FCM] startForegroundService FAILED (may be ForegroundServiceStartNotAllowedException)", e)
        }
    }

    override fun onNewToken(token: String) {
        Log.i(VOIP_PUSH_TAG, "FCM onNewToken (VoIP/incoming-call push): token=$token")
        Log.d(TAG, "Refreshed token: $token")
        co.voxo.android.calling.VoxoFcmTokenPrefs.save(this, token)
        try {
            super.onNewToken(token)
        } catch (e: Exception) {
            Log.w(TAG, "[FCM] super.onNewToken failed", e)
        }
    }

    private fun extractCallUuid(bundle: Bundle?): String? {
        if (bundle == null) return null
        return bundle.getString("callUuid")
            ?: bundle.getString("payload_callUuid")
    }

    private fun extractCallerIp(bundle: Bundle?): String? {
        if (bundle == null) return null
        return bundle.getString("ip")
            ?: bundle.getString("payload_ip")
            ?: bundle.getString("callerIp")
            ?: bundle.getString("payload_callerIp")
    }

    private fun cancelEmptyNotificationIfNeeded(message: RemoteMessage) {
        val notification = message.notification ?: return
        val body = notification.body
        if (!body.isNullOrBlank()) return
        val title = notification.title ?: return

        val runCancel = Runnable {
            try {
                val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val active = nm.activeNotifications
                    for (sbn in active) {
                        val notif = sbn.notification ?: continue
                        val extras = notif.extras ?: continue
                        val notifTitle =
                            extras.getCharSequence(NotificationCompat.EXTRA_TITLE)?.toString()
                        val notifText =
                            extras.getCharSequence(NotificationCompat.EXTRA_TEXT)?.toString()
                        if (notifTitle == title && notifText.isNullOrBlank()) {
                            if (sbn.tag != null) {
                                nm.cancel(sbn.tag, sbn.id)
                            } else {
                                nm.cancel(sbn.id)
                            }
                            Log.i(TAG, "[FCM] Canceled empty notification: title='$title'")
                            Log.i(SMS_TAG, "canceledEmptySystemNotification title=${truncate(title)}")
                            return@Runnable
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "[FCM] Failed to cancel empty notification", e)
            }
        }
        Handler(Looper.getMainLooper()).postDelayed(runCancel, 200L)
    }

    companion object {
        private const val TAG = "VoxoConnect:FirebaseService"
        /** Filter: adb logcat | grep VOIP-PUSH-ANDROID */
        private const val VOIP_PUSH_TAG = "VOIP-PUSH-ANDROID"
        /** Filter: adb logcat | grep SMS-NOTIF */
        private const val SMS_TAG = "SMS-NOTIF"
        val IncomingCallBundles: HashMap<String, Bundle> = HashMap()
    }
}
