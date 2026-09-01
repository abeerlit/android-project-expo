package co.voxo.android.notifications

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import co.voxo.android.R
import java.io.IOException

/**
 * Plays the user's device default ringtone for incoming calls, independent of the silent
 * notification channel. Uses multiple playback strategies because MediaPlayer cannot
 * always open content:// ringtone URIs directly on OEM Android builds.
 */
object IncomingCallRingtonePlayer {
    private const val TAG = "IncomingCallRingtone"

    @Volatile
    private var activeCallUuid: String? = null

    private var mediaPlayer: MediaPlayer? = null
    private var systemRingtone: Ringtone? = null
    private var appContext: Context? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private val lock = Any()

    fun start(context: Context, callUuid: String) {
        val applicationContext = context.applicationContext
        mainHandler.post {
            synchronized(lock) {
                startOnMainThread(applicationContext, callUuid)
            }
        }
    }

    private fun startOnMainThread(appContext: Context, callUuid: String) {
        try {
            if (activeCallUuid == callUuid && isPlayingLocked()) {
                Log.d(TAG, "start: already ringing for $callUuid")
                return
            }
            stopLocked(null)

            this.appContext = appContext
            val audioManager =
                appContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            if (audioManager == null) {
                Log.e(TAG, "start: AudioManager null for $callUuid")
                return
            }

            if (audioManager.ringerMode != AudioManager.RINGER_MODE_NORMAL) {
                Log.w(
                    TAG,
                    "start: ringerMode=${audioManager.ringerMode} (silent/vibrate) for $callUuid"
                )
            }

            acquireWakeLock(appContext)
            audioManager.mode = AudioManager.MODE_RINGTONE

            val uris = buildUriFallbackList(appContext)
            for (uri in uris) {
                Log.d(TAG, "start: trying uri=$uri for $callUuid")
                if (tryMediaPlayer(appContext, audioManager, callUuid, uri)) {
                    Log.i(TAG, "start: MediaPlayer ringing for $callUuid uri=$uri")
                    return
                }
                if (trySystemRingtone(appContext, callUuid, uri)) {
                    Log.i(TAG, "start: Ringtone API ringing for $callUuid uri=$uri")
                    return
                }
            }

            Log.e(TAG, "start FAILED: all playback strategies exhausted for $callUuid")
            stopLocked(null)
        } catch (e: Exception) {
            Log.e(TAG, "start FAILED for $callUuid", e)
            stopLocked(null)
        }
    }

    private fun buildUriFallbackList(context: Context): List<Uri> {
        val uris = LinkedHashSet<Uri>()
        RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_RINGTONE)
            ?.let { uris.add(it) }
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)?.let { uris.add(it) }
        uris.add(
            Uri.parse("android.resource://${context.packageName}/${R.raw.voxo_ringtone}")
        )
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)?.let { uris.add(it) }
        return uris.toList()
    }

    private fun tryMediaPlayer(
        appContext: Context,
        audioManager: AudioManager,
        callUuid: String,
        uri: Uri
    ): Boolean {
        var player: MediaPlayer? = null
        return try {
            player = MediaPlayer()
            attachDataSource(appContext, player, uri)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                player.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setLegacyStreamType(AudioManager.STREAM_RING)
                        .build()
                )
            } else {
                @Suppress("DEPRECATION")
                player.setAudioStreamType(AudioManager.STREAM_RING)
            }
            player.isLooping = true
            val ringVolume = audioManager.getStreamVolume(AudioManager.STREAM_RING).toFloat()
            val ringMax = audioManager.getStreamMaxVolume(AudioManager.STREAM_RING).toFloat()
            val volume = if (ringMax > 0f) ringVolume / ringMax else 1f
            player.setVolume(volume, volume)
            player.prepare()
            player.start()
            mediaPlayer = player
            activeCallUuid = callUuid
            true
        } catch (e: Exception) {
            Log.w(TAG, "tryMediaPlayer failed uri=$uri: ${e.message}")
            try {
                player?.release()
            } catch (_: Exception) {
            }
            false
        }
    }

    private fun attachDataSource(context: Context, player: MediaPlayer, uri: Uri) {
        when (uri.scheme?.lowercase()) {
            "content" -> {
                context.contentResolver.openFileDescriptor(uri, "r")?.use { pfd ->
                    player.setDataSource(pfd.fileDescriptor)
                } ?: throw IOException("openFileDescriptor null for $uri")
            }
            else -> player.setDataSource(context, uri)
        }
    }

    private fun trySystemRingtone(
        appContext: Context,
        callUuid: String,
        uri: Uri
    ): Boolean {
        return try {
            val ringtone = RingtoneManager.getRingtone(appContext, uri) ?: return false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                ringtone.audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setLegacyStreamType(AudioManager.STREAM_RING)
                    .build()
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                ringtone.isLooping = true
            }
            ringtone.play()
            systemRingtone = ringtone
            activeCallUuid = callUuid
            true
        } catch (e: Exception) {
            Log.w(TAG, "trySystemRingtone failed uri=$uri: ${e.message}")
            false
        }
    }

    private fun acquireWakeLock(context: Context) {
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
            wakeLock?.let { if (it.isHeld) it.release() }
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "voxo:incoming_call_ring"
            ).apply {
                setReferenceCounted(false)
                acquire(60_000L)
            }
        } catch (e: Exception) {
            Log.w(TAG, "acquireWakeLock FAILED", e)
        }
    }

    private fun releaseWakeLock() {
        try {
            wakeLock?.let { if (it.isHeld) it.release() }
        } catch (e: Exception) {
            Log.w(TAG, "releaseWakeLock FAILED", e)
        } finally {
            wakeLock = null
        }
    }

    private fun isPlayingLocked(): Boolean {
        mediaPlayer?.let {
            return try {
                it.isPlaying
            } catch (_: Exception) {
                false
            }
        }
        systemRingtone?.let {
            return try {
                it.isPlaying
            } catch (_: Exception) {
                false
            }
        }
        return false
    }

    fun isRinging(callUuid: String? = null): Boolean {
        synchronized(lock) {
            if (callUuid != null && activeCallUuid != null && activeCallUuid != callUuid) {
                return false
            }
            return isPlayingLocked()
        }
    }

    fun stop(callUuid: String?) {
        mainHandler.post {
            synchronized(lock) {
                stopLocked(callUuid)
            }
        }
    }

    fun stopAll() {
        stop(null)
    }

    private fun stopLocked(callUuid: String?) {
        if (callUuid != null && activeCallUuid != null && activeCallUuid != callUuid) {
            return
        }
        val ended = activeCallUuid
        try {
            mediaPlayer?.let { mp ->
                try {
                    if (mp.isPlaying) mp.stop()
                } catch (_: Exception) {
                }
                try {
                    mp.reset()
                    mp.release()
                } catch (_: Exception) {
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "stop mediaPlayer", e)
        }
        mediaPlayer = null

        try {
            systemRingtone?.let { rt ->
                try {
                    if (rt.isPlaying) rt.stop()
                } catch (_: Exception) {
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "stop systemRingtone", e)
        }
        systemRingtone = null
        activeCallUuid = null
        releaseWakeLock()

        val audioManager =
            appContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        if (audioManager != null) {
            try {
                audioManager.mode = AudioManager.MODE_NORMAL
            } catch (e: Exception) {
                Log.w(TAG, "stop mode reset FAILED", e)
            }
        }
        if (ended != null) {
            Log.i(TAG, "stop: ended ring for $ended (requested=$callUuid)")
        }
    }

    fun resetAudioRouteAfterRing(context: Context) {
        try {
            val audioManager =
                context.applicationContext.getSystemService(Context.AUDIO_SERVICE)
                    as? AudioManager ?: return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.clearCommunicationDevice()
            }
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = false
            audioManager.mode = AudioManager.MODE_NORMAL
            Log.i(TAG, "resetAudioRouteAfterRing: MODE_NORMAL")
        } catch (e: Exception) {
            Log.w(TAG, "resetAudioRouteAfterRing FAILED", e)
        }
    }
}
