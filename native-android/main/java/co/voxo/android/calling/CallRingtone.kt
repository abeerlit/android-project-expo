package co.voxo.android.calling

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Vibrator
import android.os.VibrationEffect
import android.os.Build
import android.util.Log

/**
 * Plays the device ringtone (looping) for incoming calls, independent of the silent
 * incoming-call notification channel so OEMs don't double-ring or mute the custom UI.
 */
object CallRingtone {
    private const val TAG = "CallRingtone"
    private var player: MediaPlayer? = null
    private var vibrator: Vibrator? = null

    @Synchronized
    fun start(context: Context) {
        if (player != null) return
        try {
            val uri = RingtoneManager.getActualDefaultRingtoneUri(
                context,
                RingtoneManager.TYPE_RINGTONE
            ) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            player = MediaPlayer().apply {
                setDataSource(context, uri)
                isLooping = true
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                prepare()
                start()
            }
            startVibration(context)
        } catch (e: Exception) {
            Log.e(TAG, "start failed", e)
        }
    }

    private fun startVibration(context: Context) {
        try {
            vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            val pattern = longArrayOf(0, 1000, 1000)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, 0)
            }
        } catch (_: Exception) {
        }
    }

    @Synchronized
    fun stop() {
        try {
            player?.stop()
            player?.release()
        } catch (_: Exception) {
        } finally {
            player = null
        }
        try {
            vibrator?.cancel()
        } catch (_: Exception) {
        } finally {
            vibrator = null
        }
    }
}
