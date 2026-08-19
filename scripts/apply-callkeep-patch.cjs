#!/usr/bin/env node
/**
 * Applies react-native-callkeep patches for kill-state support.
 * Used instead of patch-package due to parse errors with the patch file.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const PKG_DIR = path.join(__dirname, '../node_modules/react-native-callkeep');

function patchFile(relativePath, replacements) {
  const filePath = path.join(PKG_DIR, relativePath);
  if (!fs.existsSync(filePath)) {
    console.warn('[apply-callkeep-patch] File not found:', relativePath);
    return false;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  for (const [from, to] of replacements) {
    if (content.includes(from) && !content.includes(to)) {
      content = content.replace(from, to);
      modified = true;
    }
  }
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log('[apply-callkeep-patch] Patched:', relativePath);
  }
  return modified;
}

// RNCallKeepModule: dismiss heads-up when call is answered from in-app
// When user answers from InCallScreen (not from heads-up buttons), VoiceConnection.onAnswer() is never
// called, so cancelIncomingCallNotification never runs. setCurrentCallActive is the JS-triggered path,
// so we must cancel the incoming-call heads-up here (same as deinitConnection does on hangup).
patchFile('android/src/main/java/io/wazo/callkeep/RNCallKeepModule.java', [
  [
    `    @ReactMethod
    public void setCurrentCallActive(String uuid) {
        Log.d(TAG, "[RNCallKeepModule] setCurrentCallActive, uuid: " + uuid);
        Connection conn = VoiceConnectionService.getConnection(uuid);
        if (conn == null) {
            Log.w(TAG, "[RNCallKeepModule] setCurrentCallActive ignored because no connection found, uuid: " + uuid);
            return;
        }

        conn.setConnectionCapabilities(conn.getConnectionCapabilities() | Connection.CAPABILITY_HOLD);
        conn.setActive();
    }`,
    `    @ReactMethod
    public void setCurrentCallActive(String uuid) {
        Log.d(TAG, "[RNCallKeepModule] setCurrentCallActive, uuid: " + uuid);
        Connection conn = VoiceConnectionService.getConnection(uuid);
        if (conn == null) {
            Log.w(TAG, "[RNCallKeepModule] setCurrentCallActive ignored because no connection found, uuid: " + uuid);
            return;
        }

        // Dismiss incoming-call heads-up when answering from in-app (VoiceConnection.onAnswer not called)
        VoiceConnectionService.cancelIncomingCallNotification(uuid);

        conn.setConnectionCapabilities(conn.getConnectionCapabilities() | Connection.CAPABILITY_HOLD);
        conn.setActive();
    }`,
  ],
]);

// RNCallKeepModule: telephonyManager null check
patchFile('android/src/main/java/io/wazo/callkeep/RNCallKeepModule.java', [
  [
    `    public void listenToNativeCallsState() {
        Log.d(TAG, "[RNCallKeepModule] listenToNativeCallsState");
        Context context = this.getAppContext();`,
    `    public void listenToNativeCallsState() {
        Log.d(TAG, "[RNCallKeepModule] listenToNativeCallsState");
        if (telephonyManager == null) {
            Log.w(TAG, "[RNCallKeepModule] listenToNativeCallsState skipped: TelephonyManager is null (e.g. kill state before setup)");
            return;
        }
        Context context = this.getAppContext();`,
  ],
]);

// VoiceConnectionService: reachability timeout skip when killed
patchFile('android/src/main/java/io/wazo/callkeep/VoiceConnectionService.java', [
  [
    `        startForegroundService();

        if (timeout != null) {
            this.checkForAppReachability(callUUID, timeout);
        }

        return incomingCallConnection;`,
    `        startForegroundService();

        // Only schedule reachability timeout when React bridge is available. When app is killed,
        // RNCallKeepModule.instance is null and isReachable stays false, so the timeout would
        // disconnect the call and remove the native UI (green/red banner).
        if (timeout != null && RNCallKeepModule.instance != null) {
            this.checkForAppReachability(callUUID, timeout);
        } else if (timeout != null) {
            Log.w(TAG, "[VoiceConnectionService] SKIP reachability timeout - instance null (kill state); native UI will stay until user answers/rejects");
        }

        return incomingCallConnection;`,
  ],
  [
    `        Activity currentActivity = RNCallKeepModule.instance.getCurrentReactActivity();
        if (currentActivity != null) {
            Intent notificationIntent = new Intent(this, currentActivity.getClass());`,
    `        // Null-check: when app is killed and FCM wakes process, RNCallKeepModule.instance is null
        // (React Native bridge not loaded). Avoid NPE - use MainActivity fallback when no activity.
        Class<?> activityClass = null;
        try {
            if (RNCallKeepModule.instance != null) {
                Activity currentActivity = RNCallKeepModule.instance.getCurrentReactActivity();
                if (currentActivity != null) {
                    activityClass = currentActivity.getClass();
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "[VoiceConnectionService] getCurrentReactActivity failed (e.g. kill state), using MainActivity", t);
        }
        if (activityClass == null) {
            try {
                activityClass = Class.forName(getPackageName() + ".MainActivity");
            } catch (ClassNotFoundException e) {
                Log.w(TAG, "[VoiceConnectionService] MainActivity not found for notification intent");
            }
        }
        if (activityClass != null) {
            Intent notificationIntent = new Intent(this, activityClass);`,
  ],
  [
    `        if(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Context context = getApplicationContext();
            TelecomManager telecomManager = (TelecomManager) context.getSystemService(context.TELECOM_SERVICE);
            PhoneAccount phoneAccount = telecomManager.getPhoneAccount(request.getAccountHandle());

            //If the phone account is self managed, then this connection must also be self managed.
            if((phoneAccount.getCapabilities() & PhoneAccount.CAPABILITY_SELF_MANAGED) == PhoneAccount.CAPABILITY_SELF_MANAGED) {
                Log.d(TAG, "[VoiceConnectionService] PhoneAccount is SELF_MANAGED, so connection will be too");
                connection.setConnectionProperties(Connection.PROPERTY_SELF_MANAGED);
            }
            else {
                Log.d(TAG, "[VoiceConnectionService] PhoneAccount is not SELF_MANAGED, so connection won't be either");
            }
        }`,
    `        if(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Context context = getApplicationContext();
                TelecomManager telecomManager = (TelecomManager) context.getSystemService(context.TELECOM_SERVICE);
                PhoneAccount phoneAccount = telecomManager != null ? telecomManager.getPhoneAccount(request.getAccountHandle()) : null;

                if (phoneAccount != null) {
                    //If the phone account is self managed, then this connection must also be self managed.
                    if((phoneAccount.getCapabilities() & PhoneAccount.CAPABILITY_SELF_MANAGED) == PhoneAccount.CAPABILITY_SELF_MANAGED) {
                        Log.d(TAG, "[VoiceConnectionService] PhoneAccount is SELF_MANAGED, so connection will be too");
                        connection.setConnectionProperties(Connection.PROPERTY_SELF_MANAGED);
                    }
                    else {
                        Log.d(TAG, "[VoiceConnectionService] PhoneAccount is not SELF_MANAGED, so connection won't be either");
                    }
                } else {
                    Log.w(TAG, "[VoiceConnectionService] PhoneAccount null (e.g. READ_PHONE_NUMBERS not granted); assuming SELF_MANAGED");
                    connection.setConnectionProperties(Connection.PROPERTY_SELF_MANAGED);
                }
            } catch (SecurityException e) {
                Log.w(TAG, "[VoiceConnectionService] getPhoneAccount SecurityException (READ_PHONE_NUMBERS?); assuming SELF_MANAGED", e);
                connection.setConnectionProperties(Connection.PROPERTY_SELF_MANAGED);
            } catch (Throwable t) {
                Log.w(TAG, "[VoiceConnectionService] getPhoneAccount failed; assuming SELF_MANAGED", t);
                connection.setConnectionProperties(Connection.PROPERTY_SELF_MANAGED);
            }
        }`,
  ],
]);

console.log('[apply-callkeep-patch] Done');
