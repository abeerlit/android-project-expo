/**
 * Expo dev client: hide in-app LogBox and relax Reanimated strict logger (layout
 * animations during meeting rotation otherwise flood Metro).
 * Import from index.js before any other app modules.
 */
import { LogBox } from "react-native";
import {
  configureReanimatedLogger,
  ReanimatedLogLevel
} from "react-native-reanimated";

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false
});

LogBox.ignoreLogs([
  "[DBG",
  "[DBG B]",
  "[DBG C]",
  "[DBG D]",
  "[DBG E]",
  "[Reanimated] Reading from `value` during component render",
  "Reading from `value` during component render",
  "Saw setTimeout with duration 300000ms",
  "`new NativeEventEmitter()` was called",
  "EventEmitter.",
  "Require cycle:",
  "global-sagas",
  "Cannot convert undefined value to object",
  "rootSaga",
  "Error evaluating injectedJavaScript",
  "ImmutableStateInvariantMiddleware took",
  "[expo-shell]",
  "📦 [STORE]",
  "DeferredEntry]",
  "NavigationShell]"
]);

/** Hide yellow LogBox overlay in the running app (Metro may still log). */
LogBox.ignoreAllLogs();
