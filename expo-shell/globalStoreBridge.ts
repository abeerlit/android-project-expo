import type { BootStoreBundle } from "./BootStoreContext";

let bridge: BootStoreBundle | null = null;

export function setGlobalStoreBridge(bundle: BootStoreBundle): BootStoreBundle {
  bridge = bundle;
  return bundle;
}

export function getGlobalStoreBridge(): BootStoreBundle | null {
  return bridge;
}
