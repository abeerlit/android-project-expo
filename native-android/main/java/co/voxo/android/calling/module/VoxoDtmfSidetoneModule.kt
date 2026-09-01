package co.voxo.android.calling.module

import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = "VoxoDtmfSidetone")
class VoxoDtmfSidetoneModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName(): String = "VoxoDtmfSidetone"

  private val mainHandler = Handler(Looper.getMainLooper())

  @ReactMethod
  fun playSidetone(digit: String?) {
    val d = digit?.trim()?.firstOrNull() ?: return
    val toneType = when (d) {
      '0' -> ToneGenerator.TONE_DTMF_0
      '1' -> ToneGenerator.TONE_DTMF_1
      '2' -> ToneGenerator.TONE_DTMF_2
      '3' -> ToneGenerator.TONE_DTMF_3
      '4' -> ToneGenerator.TONE_DTMF_4
      '5' -> ToneGenerator.TONE_DTMF_5
      '6' -> ToneGenerator.TONE_DTMF_6
      '7' -> ToneGenerator.TONE_DTMF_7
      '8' -> ToneGenerator.TONE_DTMF_8
      '9' -> ToneGenerator.TONE_DTMF_9
      '*' -> ToneGenerator.TONE_DTMF_S
      '#' -> ToneGenerator.TONE_DTMF_P
      'A', 'a' -> ToneGenerator.TONE_DTMF_A
      'B', 'b' -> ToneGenerator.TONE_DTMF_B
      'C', 'c' -> ToneGenerator.TONE_DTMF_C
      'D', 'd' -> ToneGenerator.TONE_DTMF_D
      else -> null
    } ?: return

    // Use the voice-call stream so it behaves like in-call audio (not a quiet UI effect).
    // Duration tuned to match common keypad UX.
    val durationMs = 120
    // ToneGenerator volume is 0–100; max for loudest in-call sidetone on STREAM_VOICE_CALL.
    val volume = 100

    mainHandler.post {
      try {
        val tg = ToneGenerator(AudioManager.STREAM_VOICE_CALL, volume)
        tg.startTone(toneType, durationMs)
        // Ensure resources are released shortly after the tone finishes.
        mainHandler.postDelayed(
          { try { tg.release() } catch (_: Exception) {} },
          (durationMs + 60).toLong()
        )
      } catch (_: Exception) {
        // Non-fatal: sidetone is best-effort.
      }
    }
  }
}

