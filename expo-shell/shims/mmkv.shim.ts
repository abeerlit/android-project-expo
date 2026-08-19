/**
 * MMKV v4-style `createMMKV` for shared android-project/src on Expo (react-native-mmkv 2.x).
 */
import { MMKV, type MMKVConfiguration } from "react-native-mmkv-real";

export type MMKVInstance = {
  set: MMKV["set"];
  getString: MMKV["getString"];
  getBoolean: MMKV["getBoolean"];
  getNumber: MMKV["getNumber"];
  contains: MMKV["contains"];
  remove: (key: string) => void;
  delete: (key: string) => void;
  clearAll: MMKV["clearAll"];
  getAllKeys: MMKV["getAllKeys"];
};

function wrap(instance: MMKV): MMKVInstance {
  return {
    set: (key, value) => instance.set(key, value),
    getString: (key) => instance.getString(key),
    getBoolean: (key) => instance.getBoolean(key),
    getNumber: (key) => instance.getNumber(key),
    contains: (key) => instance.contains(key),
    remove: (key) => instance.delete(key),
    delete: (key) => instance.delete(key),
    clearAll: () => instance.clearAll(),
    getAllKeys: () => instance.getAllKeys()
  };
}

export function createMMKV(configuration?: MMKVConfiguration): MMKVInstance {
  return wrap(new MMKV(configuration));
}

export { MMKV };
