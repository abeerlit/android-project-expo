package co.voxo.android.calling.module

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

/**
 * Reliable in-call speaker routing on Android (especially 11–14 with self-managed Telecom).
 * InCallManager.setSpeakerphoneOn alone is often ignored when ConnectionService owns the call.
 */
@ReactModule(name = "VoxoCallAudio")
class VoxoCallAudioModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName(): String = "VoxoCallAudio"

  private val mainHandler = Handler(Looper.getMainLooper())

  @ReactMethod
  fun setSpeakerphoneEnabled(enabled: Boolean) {
    mainHandler.post { applySpeakerphone(enabled) }
  }

  private fun applySpeakerphone(enabled: Boolean) {
    val audioManager =
      context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return

    audioManager.mode = AudioManager.MODE_IN_COMMUNICATION

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      if (enabled) {
        val speaker =
          audioManager.availableCommunicationDevices.firstOrNull {
            it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
          }
        if (speaker != null) {
          audioManager.setCommunicationDevice(speaker)
        }
        @Suppress("DEPRECATION")
        audioManager.isSpeakerphoneOn = true
      } else {
        audioManager.clearCommunicationDevice()
        val earpiece =
          audioManager.availableCommunicationDevices.firstOrNull {
            it.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
          }
        if (earpiece != null) {
          audioManager.setCommunicationDevice(earpiece)
        }
        @Suppress("DEPRECATION")
        audioManager.isSpeakerphoneOn = false
      }
      return
    }

    @Suppress("DEPRECATION")
    audioManager.isSpeakerphoneOn = enabled
  }
}
