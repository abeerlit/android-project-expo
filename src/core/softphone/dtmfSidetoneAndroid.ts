import { NativeModules, Platform } from "react-native";

type VoxoDtmfSidetoneNative = {
  playSidetone: (digit: string) => void;
};

/** Android local DTMF sidetone (best-effort). */
export function playDtmfSidetoneAndroid(tones: string): void {
  if (Platform.OS !== "android" || !tones?.length) return;
  const mod = NativeModules.VoxoDtmfSidetone as VoxoDtmfSidetoneNative | undefined;
  if (!mod?.playSidetone) return;
  const ch = tones[0];
  if (!/[0-9*#ABCD]/i.test(ch)) return;
  try {
    mod.playSidetone(ch);
  } catch {
    /* ignore */
  }
}

