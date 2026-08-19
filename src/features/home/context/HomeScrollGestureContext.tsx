import { createContext, useContext } from "react";
import type { NativeGesture } from "react-native-gesture-handler";

/** Native scroll gesture for Home ScrollView — share with ReanimatedSwipeable rows. */
export const HomeScrollGestureContext = createContext<NativeGesture | undefined>(
  undefined
);

export function useHomeScrollNativeGesture(): NativeGesture | undefined {
  return useContext(HomeScrollGestureContext);
}
