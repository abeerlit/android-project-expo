package co.voxo.android

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives FCM broadcast (c2dm.RECEIVE) to cancel empty notifications.
 * When the server sends a notification payload with title but no body (e.g. phone number only),
 * Android auto-displays it, producing an empty notification. We cancel it so only the JS handler's
 * proper notification (e.g. "Received an attachment") is shown.
 *
 * Runs with low priority so RNFirebase's handler runs first; we only cancel the empty one.
 */
class EmptyNotificationCancelReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.extras == null) return
        val remoteMessage = RemoteMessage(intent.extras!!)
        val notification = remoteMessage.notification ?: return
        val body = notification.body
        if (!body.isNullOrBlank()) return
        val title = notification.title ?: return

        // Skip incoming call notifications - those are handled by native call UI
        val payloadType = intent.extras?.getString("vm_payload_type") ?: ""
        if (payloadType == "incoming_call_notification") return

        Handler(Looper.getMainLooper()).postDelayed({
            try {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val active = nm.activeNotifications
                    for (sbn in active) {
                        val notif = sbn.notification ?: continue
                        val extras = notif.extras ?: continue
                        val notifTitle = extras.getCharSequence(NotificationCompat.EXTRA_TITLE)?.toString()
                        val notifText = extras.getCharSequence(NotificationCompat.EXTRA_TEXT)?.toString()
                        if (notifTitle == title && notifText.isNullOrBlank()) {
                            if (sbn.tag != null) {
                                nm.cancel(sbn.tag, sbn.id)
                            } else {
                                nm.cancel(sbn.id)
                            }
                            Log.i(TAG, "[EmptyNotif] Canceled empty notification: title='$title'")
                            break
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "[EmptyNotif] Failed to cancel empty notification", e)
            }
        }, 300)
    }

    companion object {
        private const val TAG = "VoxoConnect:EmptyNotif"
    }
}
