package co.voxo.android.notifications

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import co.voxo.android.AppForegroundTracker
import co.voxo.android.MainActivity
import co.voxo.android.contacts.DeviceContactLookup
import co.voxo.android.contacts.SmsContactNameCache
import com.google.firebase.messaging.RemoteMessage

object SmsSystemTrayEnricher {
    private const val TAG = "SMS-NOTIF"
    private const val SMS_CHANNEL_ID = "voxo-sms-v2"
    private val CANCEL_RETRY_DELAYS_MS = longArrayOf(0L, 80L, 200L, 450L, 900L, 1600L)
    private const val JS_FALLBACK_DELAY_MS = 5000L

    /**
     * Called from FCM service before JS headless wake. Tries to show one tray banner with a
     * resolved contact name; marks state so JS skips a second Notifee post.
     */
    fun onSmsReceived(
        context: Context,
        message: RemoteMessage,
        reactContextAlive: Boolean
    ) {
        if (AppForegroundTracker.isAppInForeground()) {
            return
        }

        val notification = message.notification ?: return
        val systemTitle = notification.title?.trim().orEmpty()
        val systemBody = notification.body?.trim().orEmpty()
        if (systemTitle.isEmpty() && systemBody.isEmpty()) {
            return
        }

        val data = message.data
        val from = data["from"]?.trim().orEmpty()
        val peerName = data["peerName"]?.trim().orEmpty().ifEmpty {
            data["peer_name"]?.trim().orEmpty()
        }

        scheduleCancelBurst(context, systemTitle, systemBody, message.messageId)

        // Killed (no React): try native name ASAP so user never needs a second JS notification.
        if (!reactContextAlive) {
            scheduleEnrichAttempts(
                context,
                message,
                from,
                peerName,
                systemTitle,
                systemBody,
                longArrayOf(0L, 120L, 350L, 700L)
            )
        }

        // Background: JS will resolve from Redux; native only if JS did not handle in time.
        if (reactContextAlive) {
            Handler(Looper.getMainLooper()).postDelayed({
                if (SmsTrayDisplayState.wasResolvedByNative(context, message.messageId)) {
                    return@postDelayed
                }
                try {
                    enrichIfNeeded(
                        context.applicationContext,
                        message,
                        from,
                        peerName,
                        systemTitle,
                        systemBody
                    )
                } catch (e: Exception) {
                    Log.w(
                        TAG,
                        "smsTrayJsFallback failed messageId=${message.messageId} error=${e.message}"
                    )
                }
            }, JS_FALLBACK_DELAY_MS)
        }
    }

    private fun scheduleEnrichAttempts(
        context: Context,
        message: RemoteMessage,
        from: String,
        peerName: String,
        systemTitle: String,
        systemBody: String,
        delays: LongArray
    ) {
        val appContext = context.applicationContext
        for (delay in delays) {
            Handler(Looper.getMainLooper()).postDelayed({
                if (SmsTrayDisplayState.wasResolvedByNative(appContext, message.messageId)) {
                    return@postDelayed
                }
                try {
                    val applied = enrichIfNeeded(
                        appContext,
                        message,
                        from,
                        peerName,
                        systemTitle,
                        systemBody
                    )
                    if (applied) {
                        SmsTrayDisplayState.markResolved(appContext, message.messageId)
                    }
                } catch (e: Exception) {
                    Log.w(
                        TAG,
                        "smsTrayKilledEnrich failed delay=$delay messageId=${message.messageId} error=${e.message}"
                    )
                }
            }, delay)
        }
    }

    private fun scheduleCancelBurst(
        context: Context,
        systemTitle: String,
        systemBody: String,
        messageId: String?
    ) {
        val appContext = context.applicationContext
        for (delay in CANCEL_RETRY_DELAYS_MS) {
            Handler(Looper.getMainLooper()).postDelayed({
                SystemTrayNotificationCanceler.cancelByTitleAndBody(
                    appContext,
                    systemTitle,
                    systemBody,
                    messageId
                )
                messageId?.let {
                    SystemTrayNotificationCanceler.cancelByMessageId(appContext, it)
                }
            }, delay)
        }
    }

    /** @return true when a resolved-name tray notification was posted */
    private fun enrichIfNeeded(
        context: Context,
        message: RemoteMessage,
        from: String,
        peerName: String,
        systemTitle: String,
        systemBody: String
    ): Boolean {
        val phone = resolveSenderPhone(from, peerName, systemTitle)
        val resolved = resolveDisplayName(context, phone, peerName)
        if (resolved.isNullOrBlank()) {
            Log.i(TAG, "smsTrayEnrich skip=noResolvedName phone=$phone")
            return false
        }
        if (resolved == systemTitle) {
            Log.i(TAG, "smsTrayEnrich skip=titleAlreadyResolved title=$systemTitle")
            SmsTrayDisplayState.markResolved(context, message.messageId)
            return true
        }

        SystemTrayNotificationCanceler.cancelByTitleAndBody(
            context,
            systemTitle,
            systemBody,
            message.messageId
        )
        message.messageId?.let {
            SystemTrayNotificationCanceler.cancelByMessageId(context, it)
        }
        val body = stripSenderPrefix(systemBody).ifBlank { "New message" }
        postTrayNotification(context, message, resolved, body)
        Log.i(TAG, "smsTrayEnrich success phone=$phone title=$resolved")
        return true
    }

    /** FCM puts the peer number in notification.title; data.from may be absent. */
    private fun resolveSenderPhone(from: String, peerName: String, systemTitle: String): String {
        if (systemTitle.isNotBlank() && isValidPeerPhone(systemTitle)) return systemTitle
        if (peerName.isNotBlank() && isValidPeerPhone(peerName)) return peerName
        if (from.isNotBlank() && isValidPeerPhone(from)) return from
        return systemTitle.ifBlank { peerName }.ifBlank { from }
    }

    private fun resolveDisplayName(
        context: Context,
        phone: String,
        peerName: String
    ): String? {
        if (peerName.isNotBlank() && !isPhoneLikeName(peerName, phone)) {
            return peerName
        }
        if (phone.isNotBlank()) {
            for (variant in phoneLookupVariants(phone)) {
                SmsContactNameCache.lookup(context, variant)?.let { return it }
                DeviceContactLookup.lookupDisplayName(context, variant)?.let { return it }
            }
        }
        return null
    }

    private fun phoneLookupVariants(phone: String): List<String> {
        val variants = linkedSetOf(phone.trim())
        val digits = phone.replace(Regex("\\D"), "")
        if (digits.length == 11 && digits.startsWith("1")) {
            variants.add(digits)
            variants.add(digits.drop(1))
            variants.add("+${digits}")
            variants.add("+1${digits.drop(1)}")
        } else if (digits.length == 10) {
            variants.add(digits)
            variants.add("1$digits")
            variants.add("+1$digits")
        }
        return variants.toList()
    }

    private fun isValidPeerPhone(value: String): Boolean {
        val digits = value.trim().replace(Regex("\\D"), "")
        return digits.length == 10 ||
            (digits.length == 11 && digits.startsWith("1"))
    }

    private fun isPhoneLikeName(value: String, from: String): Boolean {
        if (!isValidPeerPhone(value)) {
            return false
        }
        val valueDigits = value.trim().replace(Regex("\\D"), "")
        val fromDigits = from.replace(Regex("\\D"), "")
        if (fromDigits.isNotEmpty() && valueDigits == fromDigits) {
            return true
        }
        val nonDigitChars = value.trim().replace(Regex("[\\d\\s+\\-().]"), "")
        return nonDigitChars.isEmpty()
    }

    private fun stripSenderPrefix(body: String): String {
        val colonIndex = body.indexOf(':')
        return if (colonIndex > 0) {
            body.substring(colonIndex + 1).trim()
        } else {
            body.trim()
        }
    }

    private fun postTrayNotification(
        context: Context,
        message: RemoteMessage,
        title: String,
        body: String
    ) {
        val launchIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            for ((key, value) in message.data) {
                putExtra(key, value)
            }
            putExtra("click_action", message.data["click_action"] ?: "TEXT-RECEIVED")
            message.messageId?.let { putExtra("google.message_id", it) }
        }

        val requestCode = (message.messageId ?: title).hashCode()
        val pendingIntent = PendingIntent.getActivity(
            context,
            requestCode,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notificationId = stableNotificationId(message.messageId)

        val builder = NotificationCompat.Builder(context, SMS_CHANNEL_ID)
            .setSmallIcon(co.voxo.android.R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(notificationId, builder.build())
        Log.i(TAG, "smsTray posted notificationId=$notificationId title=$title")
    }

    private fun stableNotificationId(messageId: String?): Int {
        return messageId?.hashCode() ?: ("sms-${System.currentTimeMillis()}").hashCode()
    }
}
