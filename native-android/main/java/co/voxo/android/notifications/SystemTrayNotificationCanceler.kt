package co.voxo.android.notifications

import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat

object SystemTrayNotificationCanceler {
    private const val TAG = "SMS-NOTIF"

    fun cancelByTitleAndBody(
        context: Context,
        systemTitle: String,
        systemBody: String,
        messageId: String? = null
    ): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return false
        }
        val title = systemTitle.trim()
        if (title.isEmpty()) {
            return false
        }
        val body = systemBody.trim()
        val titleDigits = digitsOnly(title)

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        var canceled = false
        for (sbn in nm.activeNotifications) {
            val notif = sbn.notification ?: continue
            val extras = notif.extras ?: continue
            val notifTitle =
                extras.getCharSequence(NotificationCompat.EXTRA_TITLE)?.toString()?.trim()
                    ?: continue
            val notifText =
                extras.getCharSequence(NotificationCompat.EXTRA_TEXT)?.toString()?.trim()
                    ?: ""

            val titleMatches =
                notifTitle == title ||
                    (titleDigits.length >= 10 &&
                        digitsOnly(notifTitle) == titleDigits)
            val bodyMatches =
                body.isEmpty() || notifText == body || notifText.isBlank()
            val idMatches =
                messageId != null &&
                    sbn.tag == null &&
                    sbn.id.toString() == messageId

            if (titleMatches && bodyMatches || idMatches) {
                if (sbn.tag != null) {
                    nm.cancel(sbn.tag, sbn.id)
                } else {
                    nm.cancel(sbn.id)
                }
                canceled = true
                Log.i(
                    TAG,
                    "cancelSystemTray id=${sbn.id} title=$notifTitle matched=$title"
                )
            }
        }
        return canceled
    }

    /** FCM / Firebase often use messageId hash as notification id. */
    fun cancelByMessageId(context: Context, messageId: String): Boolean {
        if (messageId.isBlank()) {
            return false
        }
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        var canceled = false
        val idHash = messageId.hashCode()
        try {
            nm.cancel(idHash)
            canceled = true
            Log.i(TAG, "cancelByMessageId hash=$idHash messageId=$messageId")
        } catch (_: Exception) {
            /* ignore */
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            for (sbn in nm.activeNotifications) {
                if (sbn.id == idHash) {
                    if (sbn.tag != null) {
                        nm.cancel(sbn.tag, sbn.id)
                    } else {
                        nm.cancel(sbn.id)
                    }
                    canceled = true
                }
            }
        }
        return canceled
    }

    private fun digitsOnly(value: String): String {
        return value.replace(Regex("\\D"), "")
    }
}
