package co.voxo.android

import android.app.Application
import android.app.NotificationChannel
import android.app.Notification
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import co.voxo.android.clipboard.VoxoClipboardModulePackage
import co.voxo.android.calling.module.VoxoDtmfSidetoneModulePackage
import co.voxo.android.telecom.CallKeepBroadcastReceiver
import co.voxo.android.notifications.module.AndroidNotificationsModulePackage
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader
import io.wazo.callkeep.Constants.ACTION_ANSWER_CALL
import io.wazo.callkeep.Constants.ACTION_END_CALL
import io.wazo.callkeep.Constants.ACTION_ON_CREATE_CONNECTION_FAILED
import io.wazo.callkeep.Constants.ACTION_ONGOING_CALL
import io.wazo.callkeep.Constants.ACTION_SHOW_INCOMING_CALL_UI
import io.wazo.callkeep.Constants.ACTION_ON_SILENCE_INCOMING_CALL
import io.wazo.callkeep.VoiceConnectionService

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              add(AndroidNotificationsModulePackage())
              add(VoxoDtmfSidetoneModulePackage())
              add(VoxoClipboardModulePackage())
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    // RN 0.77+ loads many JNI libs from merged mappings.
    SoLoader.init(this, OpenSourceMergedSoMapping)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      load()
    }

    createNotificationChannels()
    initCallKeep()
    AppForegroundTracker.register(this)
  }

  private fun createNotificationChannels() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val notificationManager = getSystemService(NotificationManager::class.java)

      // Main notifications channel (SMS, Chat, etc.)
      val mainChannel = NotificationChannel(
        "voxo-notifications",
        "Voxo Notifications",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Notifications for messages and alerts"
        enableVibration(true)
        vibrationPattern = longArrayOf(300, 500)
        setSound(
          android.provider.Settings.System.DEFAULT_NOTIFICATION_URI,
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
      }
      notificationManager.createNotificationChannel(mainChannel)

      // Incoming calls: ring only via IncomingCallRingtonePlayer (channel sound would double-play).
      val incomingCallChannel = NotificationChannel(
        INCOMING_CALL_CHANNEL_ID,
        "Incoming Calls",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Incoming call notifications"
        setSound(null, null)
        enableLights(true)
        lightColor = Color.BLUE
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 1000, 500, 1000, 500)
      }
      notificationManager.createNotificationChannel(incomingCallChannel)

      // Ongoing calls channel - IMPORTANCE_LOW for Silent section, persistent
      val ongoingChannel = NotificationChannel(
        ONGOING_CALL_CHANNEL_ID,
        "Ongoing Calls",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Persistent call notifications"
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        setSound(null, null)
        enableVibration(false)
      }
      notificationManager.createNotificationChannel(ongoingChannel)
    }
  }

  private fun initCallKeep() {
    // setAvailable(true) so native CallKeep UI can show when app is killed
    VoiceConnectionService.setAvailable(true)
    VoiceConnectionService.setInitialized(true)

    val cName = ComponentName(applicationContext, io.wazo.callkeep.VoiceConnectionService::class.java)
    val appName = getApplicationName(applicationContext) ?: "VOXOConnect"
    val icon = Icon.createWithResource(applicationContext, R.mipmap.ic_launcher)

    val telephonyManager = applicationContext.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    telecomManager = applicationContext.getSystemService(Context.TELECOM_SERVICE) as TelecomManager

    phoneAccountHandle = PhoneAccountHandle(cName, appName)
    val account = PhoneAccount.Builder(phoneAccountHandle, appName)
      .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
      .setIcon(icon)
      .build()

    telecomManager!!.registerPhoneAccount(account)

    val intentFilter = IntentFilter().apply {
      addAction(ACTION_SHOW_INCOMING_CALL_UI)
      addAction(ACTION_END_CALL)
      addAction(ACTION_ANSWER_CALL)
      addAction(ACTION_ONGOING_CALL)
      addAction(ACTION_ON_SILENCE_INCOMING_CALL)
      addAction(ACTION_ON_CREATE_CONNECTION_FAILED)
    }
    LocalBroadcastManager.getInstance(applicationContext)
      .registerReceiver(CallKeepBroadcastReceiver(), intentFilter)
  }

  private fun getApplicationName(appContext: Context): String? {
    val applicationInfo = appContext.applicationInfo
    val stringId = applicationInfo.labelRes
    return if (stringId == 0) applicationInfo.nonLocalizedLabel.toString()
    else appContext.getString(stringId)
  }

  companion object {
    const val INCOMING_CALL_CHANNEL_ID = "VOXOCONNECT_INCOMING_CALLS_V2"
    const val ONGOING_CALL_CHANNEL_ID = "VOXOCONNECT_ONGOING_CALLS"

    var phoneAccountHandle: PhoneAccountHandle? = null
    var telecomManager: TelecomManager? = null
  }
}
