import type { Store } from "@reduxjs/toolkit";

type RegisteredStore = {
  store: Store;
  rehydratePromise: Promise<void>;
};

let registered: RegisteredStore | null = null;

/** Expo boot: wire piecemeal store before any module imports global-store. */
export function registerAppStore(store: Store, rehydratePromise: Promise<void>) {
  registered = { store, rehydratePromise };
}

export function isAppStoreRegistered(): boolean {
  return registered != null;
}

export function getAppStore(): Store {
  if (!registered) {
    throw new Error("[app-store] Store not registered");
  }
  return registered.store;
}

export function getAppRehydratePromise(): Promise<void> {
  if (!registered) {
    throw new Error("[app-store] Store not registered");
  }
  return registered.rehydratePromise;
}

function bindStore(store: Store, prop: string | symbol) {
  const value = (store as unknown as Record<string | symbol, unknown>)[prop];
  return typeof value === "function"
    ? (value as (...args: unknown[]) => unknown).bind(store)
    : value;
}

/** Live view of the active store (expo-registered or bare-init). */
export const store = new Proxy({} as Store, {
  get(_target, prop) {
    return bindStore(getAppStore(), prop);
  }
});

/** Thenable proxy so `await rehydratePromise` works before/after registration. */
export const rehydratePromise: Promise<void> = {
  then(onFulfilled, onRejected) {
    return getAppRehydratePromise().then(onFulfilled, onRejected);
  },
  catch(onRejected) {
    return getAppRehydratePromise().catch(onRejected);
  },
  finally(onFinally) {
    return getAppRehydratePromise().finally(onFinally);
  },
  [Symbol.toStringTag]: "Promise"
} as Promise<void>;
