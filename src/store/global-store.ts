import { persistStore, persistCombineReducers } from "redux-persist";
import createSagaMiddleware from "redux-saga";
import globalReducers from "./global-reducers.ts";
import { configureStore } from "@reduxjs/toolkit";
import { mmkvStorage } from "./utils/storage.ts";
import { setupAppForegroundListener } from "./setup-app-foreground-listener.ts";
import {
  isAppStoreRegistered,
  registerAppStore,
  store,
  rehydratePromise
} from "./app-store.ts";

export { registerAppStore, store, rehydratePromise };

let barePersistor: ReturnType<typeof persistStore> | undefined;

function initBareStore() {
  if (isAppStoreRegistered()) return;

  const config = {
    key: "root",
    storage: mmkvStorage,
    blacklist: ["loadingReducer"],
    debug: false,
    timeout: undefined
  };

  const sagaMiddleware = createSagaMiddleware();
  const reducers = persistCombineReducers(config, globalReducers);
  const bareStore = configureStore({
    reducer: reducers,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false
      }).concat(sagaMiddleware)
  });

  let rehydrated = () => {};
  const bareRehydratePromise = new Promise<void>((resolve) => {
    rehydrated = () => {
      console.warn(
        `📦 [STORE] ${new Date().toISOString()} rehydratePromise resolved`
      );
      resolve();
    };
  });

  registerAppStore(bareStore, bareRehydratePromise);

  barePersistor = persistStore(bareStore, null, () => {
    setupAppForegroundListener(bareStore);

    console.warn(
      `📦 [STORE] ${new Date().toISOString()} Store rehydrated from MMKV`
    );
    try {
      const {
        syncAndroidChatNotificationPrefsFromUser
      } = require("core/notifications/androidChatNotificationPrefsCache.ts");
      const user = bareStore.getState()?.userReducer?.user;
      syncAndroidChatNotificationPrefsFromUser(user);
    } catch (_e) {
      /* ignore */
    }
    try {
      const {
        syncSmsContactNameCacheFromStore
      } = require("core/notifications/androidSmsContactNameCache.ts");
      syncSmsContactNameCacheFromStore();
    } catch (_e) {
      /* ignore */
    }
    rehydrated();
  });

  const sagas = require("./global-sagas.ts").default;
  sagaMiddleware.run(sagas);
}

const ConfigureStore = () => {
  initBareStore();
  return { persistor: barePersistor, store, rehydratePromise };
};

// Bare Entrypoint / headless: create store if Expo has not registered yet.
initBareStore();

export default ConfigureStore;
