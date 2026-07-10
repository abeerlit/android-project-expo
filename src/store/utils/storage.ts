import { createMMKV } from "react-native-mmkv";

const storage = createMMKV();

interface Storage {
  setItem: (key: string, value: string) => Promise<void>;
  getItem: (key: string) => Promise<string | undefined>;
  removeItem: (key: string) => Promise<void>;
}

export const mmkvStorage: Storage = {
  setItem: async (key: string, value: string): Promise<void> => {
    storage.set(key, value);
  },
  getItem: async (key: string): Promise<string | undefined> => {
    return storage.getString(key);
  },
  removeItem: async (key: string): Promise<void> => {
    storage.remove(key);
  }
};
