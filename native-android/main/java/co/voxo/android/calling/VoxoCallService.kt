package co.voxo.android.calling

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import co.voxo.android.R

/**
 * Foreground service for active calls only. Linphone registration runs in the app
 * process without an FGS; this service is promoted when a call session exists.
 */
class VoxoCallService : Service() {

    override fun onCreate() {
        super.onCreate()
        CallNotifications.ensureChannels(this)
        VoxoLinphoneManager.ensureStarted(applicationContext)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                VoxoLinphoneManager.ensureStarted(applicationContext)
                if (!reconcileForeground(applicationContext)) {
                    satisfyForegroundDeadlineThenStop()
                    return START_NOT_STICKY
                }
            }
            ACTION_REFRESH -> {
                if (!reconcileForeground(applicationContext)) {
                    stopForegroundCompat()
                    stopSelf()
                    return START_NOT_STICKY
                }
            }
            ACTION_STOP -> {
                stopForegroundCompat()
                stopSelf()
            }
            else -> {
                if (!reconcileForeground(applicationContext)) {
                    stopSelf()
                    return START_NOT_STICKY
                }
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    /** @return true if the service is in foreground with a call notification */
    private fun reconcileForeground(context: Context): Boolean {
        val incoming = CallSessionRegistry.all().firstOrNull { it.state == "incoming" }
        val active = CallSessionRegistry.activeCall()
            ?: CallSessionRegistry.byBucket(CallSessionRegistry.Bucket.ACTIVE).firstOrNull()
        val outgoing = CallSessionRegistry.all().firstOrNull { it.direction == "outgoing" }

        val (notificationId, notification) = when {
            incoming != null ->
                incoming.notificationId to CallNotifications.buildIncoming(context, incoming)
            active != null ->
                active.notificationId to CallNotifications.buildOngoing(context, active)
            outgoing != null ->
                outgoing.notificationId to CallNotifications.buildOngoing(context, outgoing)
            else -> {
                stopForegroundCompat()
                return false
            }
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    notificationId,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                )
            } else {
                startForeground(notificationId, notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "startForeground failed", e)
            try {
                startForeground(notificationId, notification)
            } catch (_: Exception) {
                return false
            }
        }
        return true
    }

    private fun stopForegroundCompat() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
        } catch (_: Exception) {
        }
    }

    /** If startForegroundService() was used but no call session exists, still satisfy the FGS deadline. */
    private fun satisfyForegroundDeadlineThenStop() {
        try {
            val notification = NotificationCompat.Builder(this, CallNotifications.CHANNEL_ONGOING)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("VOXO Connect")
                .setContentText("Call service")
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setOngoing(true)
                .setSilent(true)
                .build()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    PLACEHOLDER_NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
                )
            } else {
                startForeground(PLACEHOLDER_NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            Log.w(TAG, "placeholder startForeground failed", e)
        }
        stopForegroundCompat()
        stopSelf()
    }

    companion object {
        private const val TAG = "VoxoCallService"
        private const val PLACEHOLDER_NOTIFICATION_ID = 29999
        const val ACTION_START = "co.voxo.android.calling.SERVICE_START"
        const val ACTION_REFRESH = "co.voxo.android.calling.SERVICE_REFRESH"
        const val ACTION_STOP = "co.voxo.android.calling.SERVICE_STOP"

        private fun hasCallSessions(): Boolean =
            CallSessionRegistry.all().isNotEmpty()

        /**
         * Promote to FGS when a call session exists. Registration-only work stays in-process
         * via [VoxoLinphoneManager.ensureStarted] — never start an empty FGS (Android kills the app).
         */
        fun start(context: Context) {
            VoxoLinphoneManager.ensureStarted(context.applicationContext)
            if (!hasCallSessions()) {
                Log.d(TAG, "start skipped — no call session yet")
                return
            }
            val intent = Intent(context, VoxoCallService::class.java).apply {
                action = ACTION_START
            }
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.applicationContext.startForegroundService(intent)
                } else {
                    context.applicationContext.startService(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "start failed", e)
            }
        }

        fun refresh(context: Context) {
            val intent = Intent(context, VoxoCallService::class.java).apply {
                action = ACTION_REFRESH
            }
            try {
                context.applicationContext.startService(intent)
            } catch (e: Exception) {
                if (hasCallSessions()) {
                    start(context)
                }
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, VoxoCallService::class.java).apply {
                action = ACTION_STOP
            }
            try {
                context.applicationContext.startService(intent)
            } catch (_: Exception) {
            }
        }
    }
}
