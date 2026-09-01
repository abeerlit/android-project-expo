package co.voxo.android.calling

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import co.voxo.android.R
import co.voxo.android.calling.ui.CallActivity
import co.voxo.android.calling.ui.IncomingCallActivity

/**
 * Per-call notifications. Each call uses its own notification id (from the registry)
 * so declining/ending one call never cancels another.
 */
object CallNotifications {
    const val CHANNEL_INCOMING = "voxo-incoming-calls-native"
    const val CHANNEL_ONGOING = "voxo-ongoing-calls-native"

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java)

        val incoming = NotificationChannel(
            CHANNEL_INCOMING,
            "Incoming Calls",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Incoming call notifications"
            // Ring is owned by CallRingtone; keep the channel silent to avoid double-ring.
            setSound(null, null)
            enableVibration(false)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        nm.createNotificationChannel(incoming)

        val ongoing = NotificationChannel(
            CHANNEL_ONGOING,
            "Ongoing Calls",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Persistent call notifications"
            setSound(null, null)
            enableVibration(false)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        nm.createNotificationChannel(ongoing)
    }

    private fun actionIntent(
        context: Context,
        action: String,
        callId: String,
        requestCode: Int
    ): PendingIntent {
        val intent = Intent(context, CallActionReceiver::class.java).apply {
            this.action = action
            putExtra(CallActionReceiver.EXTRA_CALL_ID, callId)
        }
        val flags =
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getBroadcast(context, requestCode, intent, flags)
    }

    private fun fullScreenIntent(
        context: Context,
        entry: CallSessionRegistry.CallEntry
    ): PendingIntent {
        val intent = Intent(context, IncomingCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("callId", entry.callId)
            putExtra("displayName", entry.displayName)
            putExtra("number", entry.number)
            putExtra("avatarUri", entry.avatarUri)
        }
        val flags =
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getActivity(context, entry.notificationId, intent, flags)
    }

    private fun callActivityIntent(
        context: Context,
        entry: CallSessionRegistry.CallEntry
    ): PendingIntent {
        val intent = Intent(context, CallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            putExtra("callId", entry.callId)
        }
        val flags =
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getActivity(context, entry.notificationId, intent, flags)
    }

    fun buildIncoming(
        context: Context,
        entry: CallSessionRegistry.CallEntry
    ): Notification {
        ensureChannels(context)
        return NotificationCompat.Builder(context, CHANNEL_INCOMING)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(entry.displayName)
            .setContentText("Incoming call")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreenIntent(context, entry), true)
            .addAction(
                R.drawable.ic_decline_call,
                "Decline",
                actionIntent(
                    context,
                    CallActionReceiver.ACTION_DECLINE,
                    entry.callId,
                    entry.notificationId * 10 + 1
                )
            )
            .addAction(
                R.drawable.ic_phone,
                "Accept",
                actionIntent(
                    context,
                    CallActionReceiver.ACTION_ANSWER,
                    entry.callId,
                    entry.notificationId * 10 + 2
                )
            )
            .build()
    }

    fun buildOngoing(
        context: Context,
        entry: CallSessionRegistry.CallEntry
    ): Notification {
        ensureChannels(context)
        val statusText = when {
            entry.onHold -> "On hold"
            else -> "Ongoing call"
        }
        return NotificationCompat.Builder(context, CHANNEL_ONGOING)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(entry.displayName)
            .setContentText(statusText)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(callActivityIntent(context, entry))
            .addAction(
                R.drawable.ic_hang_up,
                "Hang up",
                actionIntent(
                    context,
                    CallActionReceiver.ACTION_HANGUP,
                    entry.callId,
                    entry.notificationId * 10 + 3
                )
            )
            .build()
    }

    fun postIncoming(context: Context, entry: CallSessionRegistry.CallEntry) {
        try {
            NotificationManagerCompat.from(context)
                .notify(entry.notificationId, buildIncoming(context, entry))
        } catch (_: SecurityException) {
        }
    }

    fun postOngoing(context: Context, entry: CallSessionRegistry.CallEntry) {
        try {
            NotificationManagerCompat.from(context)
                .notify(entry.notificationId, buildOngoing(context, entry))
        } catch (_: SecurityException) {
        }
    }

    fun cancel(context: Context, notificationId: Int) {
        NotificationManagerCompat.from(context).cancel(notificationId)
    }
}
