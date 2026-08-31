package co.voxo.android

import android.app.Activity
import android.app.Application
import android.os.Bundle

object AppForegroundTracker : Application.ActivityLifecycleCallbacks {
    @Volatile
    private var startedActivityCount = 0

    fun register(application: Application) {
        application.registerActivityLifecycleCallbacks(this)
    }

    fun isAppInForeground(): Boolean = startedActivityCount > 0

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}

    override fun onActivityStarted(activity: Activity) {
        startedActivityCount += 1
    }

    override fun onActivityResumed(activity: Activity) {}

    override fun onActivityPaused(activity: Activity) {}

    override fun onActivityStopped(activity: Activity) {
        startedActivityCount = (startedActivityCount - 1).coerceAtLeast(0)
    }

    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}

    override fun onActivityDestroyed(activity: Activity) {}
}
