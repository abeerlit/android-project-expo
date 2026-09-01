package co.voxo.android

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log

/**
 * Lightweight share trampoline.
 *
 * Sharesheet (Photos/WhatsApp) often starts the share target inside the *sharer's* task.
 * If that target is MainActivity, React boots in the wrong task and then finish()/relaunch
 * looks like "opens then minimizes" (and can SIGKILL the process).
 *
 * This activity has no React — it only forwards the intent into our MainActivity task.
 */
class ShareReceiverActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      val launch =
        Intent(intent).apply {
          setClass(this@ShareReceiverActivity, MainActivity::class.java)
          addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
              Intent.FLAG_ACTIVITY_CLEAR_TOP or
              Intent.FLAG_ACTIVITY_SINGLE_TOP or
              Intent.FLAG_GRANT_READ_URI_PERMISSION
          )
        }
      startActivity(launch)
      Log.i(TAG, "Forwarded share ${intent?.action} ${intent?.type} → MainActivity")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to forward share intent", e)
    } finally {
      finish()
    }
  }

  companion object {
    private const val TAG = "ShareReceiver"
  }
}
