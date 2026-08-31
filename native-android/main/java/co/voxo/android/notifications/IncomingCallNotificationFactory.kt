package co.voxo.android.notifications

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import co.voxo.android.MainApplication
import co.voxo.android.R
import co.voxo.android.notifications.activities.AnswerTrampolineActivity
import co.voxo.android.notifications.activities.IncomingCallFullScreenActivity
import io.wazo.callkeep.Constants.EXTRA_CALL_UUID

/**
 * Incoming-call notification used on all Android versions we ship.
 *
 * Uses [NotificationCompat.CallStyle] (system Answer/Decline) instead of custom
 * RemoteViews. Samsung One UI 8 / Android 16 often ignores custom button
 * PendingIntents on the lock screen and treats the tap as "open the app".
 */
object IncomingCallNotificationFactory {
    private const val TAG = "VoxoConnect:IncomingNotif"

    fun canUseFullScreenIntent(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            return true
        }
        return try {
            val nm = context.getSystemService(NotificationManager::class.java)
            nm.canUseFullScreenIntent()
        } catch (e: Exception) {
            Log.w(TAG, "canUseFullScreenIntent check failed", e)
            true
        }
    }

    fun build(
        context: Context,
        callUuid: String,
        callerNumber: String,
        callerName: String,
        secondLineMode: Boolean
    ): Notification {
        val hashSlice = callUuid.hashCode() and 0x7fff
        val displayName = callerName.ifBlank {
            callerNumber.ifBlank { "Incoming call" }
        }

        val fullScreenIntent = Intent(Intent.ACTION_MAIN, null).apply {
            action = "co.voxo.action.SHOW_INCOMING_CALL"
            putExtra("CALL_UUID", callUuid)
            putExtra("CALLER_NUMBER", callerNumber)
            putExtra("CALLER_NAME", callerName)
            putExtra("SECOND_LINE_MODE", secondLineMode)
            flags = Intent.FLAG_ACTIVITY_NO_USER_ACTION or Intent.FLAG_ACTIVITY_NEW_TASK
            setClass(context, IncomingCallFullScreenActivity::class.java)
        }
        val pendingFullScreenIntent = PendingIntent.getActivity(
            context,
            1001 + hashSlice,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val answerAction = if (secondLineMode) "END_AND_ACCEPT" else "ANSWER"
        val answerIntent = Intent(context, AnswerTrampolineActivity::class.java).apply {
            putExtra("CALL_UUID", callUuid)
            putExtra(EXTRA_CALL_UUID, callUuid)
            putExtra("actionPerformed", answerAction)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val answerPendingIntent = PendingIntent.getActivity(
            context,
            40000 + hashSlice,
            answerIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val rejectIntent = Intent(context, VoxoConnectIncomingCallBroadcastReceiver::class.java)
            .putExtra("CALL_UUID", callUuid)
            .putExtra(EXTRA_CALL_UUID, callUuid)
            .putExtra("actionPerformed", "REJECT")
            .setFlags(Intent.FLAG_RECEIVER_FOREGROUND)
        val rejectPendingIntent = PendingIntent.getBroadcast(
            context,
            30000 + hashSlice,
            rejectIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val caller = Person.Builder()
            .setName(displayName)
            .setImportant(true)
            .build()

        val builder = NotificationCompat.Builder(context, MainApplication.INCOMING_CALL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(displayName)
            .setContentText(context.getString(R.string.content_description_incoming_call))
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(pendingFullScreenIntent)
            .setStyle(
                NotificationCompat.CallStyle.forIncomingCall(
                    caller,
                    rejectPendingIntent,
                    answerPendingIntent
                )
            )
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)

        if (canUseFullScreenIntent(context)) {
            builder.setFullScreenIntent(pendingFullScreenIntent, true)
        } else {
            Log.w(
                TAG,
                "USE_FULL_SCREEN_INTENT not granted — CallStyle banner only for $callUuid"
            )
        }

        val notification = builder.build()
        notification.flags =
            notification.flags or Notification.FLAG_INSISTENT or Notification.FLAG_NO_CLEAR
        return notification
    }
}
