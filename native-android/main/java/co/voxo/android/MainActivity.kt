package co.voxo.android

import android.content.Intent
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.util.TypedValue
import android.view.View
import co.voxo.android.VoxoConnectFirebaseService
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import java.lang.ref.WeakReference

class MainActivity : ReactActivity() {

  companion object {
    private const val TAG = "MainActivity"
    private var instanceRef: WeakReference<MainActivity>? = null

    @JvmStatic
    fun getInstance(): MainActivity? = instanceRef?.get()

    private fun attachInstance(activity: MainActivity?) {
      instanceRef = activity?.let { WeakReference(it) }
    }
  }

  override fun onResume() {
    super.onResume()
    attachInstance(this)
    applySystemGestureExclusionIfSupported()
  }

  override fun onDestroy() {
    if (instanceRef?.get() === this) {
      attachInstance(null)
    }
    super.onDestroy()
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "VOXOConnect"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {
        override fun getLaunchOptions(): Bundle? = getLaunchFromAnswerBundle()
      }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    // Store for JS native module fallback (when root component doesn't remount)
    getLaunchFromAnswerBundle()?.let { LaunchFromAnswerStore.store(it) }
  }

  /**
   * For React Native Navigation
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    // Store launch-from-answer for JS native module fallback
    getLaunchFromAnswerBundle()?.let { LaunchFromAnswerStore.store(it) }
  }

  private fun applySystemGestureExclusionIfSupported() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
    try {
      val root = findViewById<View>(android.R.id.content) ?: return
      root.post {
        val edgeDp = 24f
        val edgePx = TypedValue.applyDimension(
          TypedValue.COMPLEX_UNIT_DIP,
          edgeDp,
          resources.displayMetrics
        ).toInt()
        val rect = Rect(0, 0, edgePx, root.height)
        root.systemGestureExclusionRects = listOf(rect)
        Log.i(TAG, "Applied systemGestureExclusionRects: left=$edgePx px height=${root.height}")
      }
    } catch (e: Exception) {
      Log.e(TAG, "applySystemGestureExclusionIfSupported failed", e)
    }
  }

  private fun getLaunchFromAnswerBundle(): Bundle? {
    val extras = intent?.extras ?: return null
    if (!extras.getBoolean("LAUNCH_FROM_ANSWER", false)) return null
    val callUuid = extras.getString("CALL_UUID") ?: return null
    val inboundBundle = VoxoConnectFirebaseService.IncomingCallBundles[callUuid]
    val callerName = inboundBundle?.getString("callerName") ?: "Unknown Caller"
    val callerNumber = inboundBundle?.getString("callerNumber") ?: "Unknown"
    return Bundle().apply {
      putBoolean("launchFromAnswer", true)
      putString("callUuid", callUuid)
      putString("callerName", callerName)
      putString("callerNumber", callerNumber)
    }
  }

  /**
   * Removes LAUNCH_FROM_ANSWER from the activity intent when it referred to this call,
   * so onCreate/onResume cannot repopulate [LaunchFromAnswerStore] after the call has ended.
   */
  fun clearLaunchFromAnswerForUuid(endedCallUuid: String) {
    try {
      val ex = intent?.extras ?: return
      if (!ex.getBoolean("LAUNCH_FROM_ANSWER", false)) return
      val u = ex.getString("CALL_UUID") ?: return
      if (u != endedCallUuid) return
      intent.removeExtra("LAUNCH_FROM_ANSWER")
      intent.removeExtra("CALL_UUID")
      Log.i(TAG, "clearLaunchFromAnswerForUuid: cleared for $endedCallUuid")
    } catch (e: Exception) {
      Log.e(TAG, "clearLaunchFromAnswerForUuid FAILED", e)
    }
  }

  fun clearLaunchFromAnswerIntentFully() {
    try {
      intent?.removeExtra("LAUNCH_FROM_ANSWER")
      intent?.removeExtra("CALL_UUID")
    } catch (e: Exception) {
      Log.e(TAG, "clearLaunchFromAnswerIntentFully FAILED", e)
    }
  }
}
