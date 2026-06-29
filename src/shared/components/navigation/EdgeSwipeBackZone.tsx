import React, { useCallback, useMemo } from "react";
import {
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Routes } from "core/navigation/types/types.ts";

const EDGE_INSET_PX = 16;
/** Pan gesture hit target (captures touches in this band). */
const EDGE_GESTURE_WIDTH_PX = 56;
/** Wider dev overlay; pointerEvents none so taps pass through outside gesture band. */
const EDGE_OVERLAY_WIDTH_PX = 100;
const SWIPE_MIN_TRANSLATION_PX = 40;
const SWIPE_MIN_VELOCITY_X = 400;
/** Keep in sync with chat header band for `edges="screen"` (matches android-project). */
const HEADER_GUARD_PX = 100;
const TAB_BAR_CONTENT_HEIGHT_PX = 70;

const GESTURE_ZONE_OVERLAY_COLOR = "rgba(255, 120, 120, 0.22)";
const SHOW_EDGE_SWIPE_ZONE_OVERLAY = __DEV__;

export type EdgeSwipeBackZoneEdges = "screen" | "content";

type EdgeSwipeBackZoneProps = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * `screen` — full-screen overlay (withEdgeSwipeBack); narrow strip, wide dev tint.
   * `content` — scoped to a flex region (optional; prefer screen-level HOC for chat).
   */
  edges?: EdgeSwipeBackZoneEdges;
};

/**
 * Android left-edge swipe-back. Dev overlay is wider than the gesture strip so buttons
 * under the red zone still receive taps (matches android-project).
 */
export function EdgeSwipeBackZone({
  children,
  style,
  edges = "content"
}: EdgeSwipeBackZoneProps) {
  const navigation = useNavigation<any>();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const bottomTabGuardPx = TAB_BAR_CONTENT_HEIGHT_PX + safeBottom + 30;

  const goBackOrFallback = useCallback(() => {
    const canGoBack = navigation?.canGoBack?.() === true;
    if (canGoBack) {
      navigation.goBack();
      return;
    }
    navigation?.navigate?.(Routes.BottomTabNavigator);
  }, [navigation]);

  const backTriggered = useSharedValue(false);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);

  const pan = useMemo(() => {
    if (Platform.OS !== "android") {
      return Gesture.Pan().enabled(false);
    }

    const triggerBack = () => {
      "worklet";
      if (backTriggered.value) return;
      backTriggered.value = true;
      runOnJS(goBackOrFallback)();
    };

    return Gesture.Pan()
      .enabled(true)
      .manualActivation(true)
      .activeOffsetX([8, 9999])
      .failOffsetY([-24, 24])
      .onBegin(() => {
        backTriggered.value = false;
      })
      .onTouchesDown((e, state) => {
        "worklet";
        const t = e.allTouches[0];
        if (t) {
          touchStartX.value = t.x;
          touchStartY.value = t.y;
        }
      })
      .onTouchesMove((e, state) => {
        "worklet";
        const t = e.allTouches[0];
        if (!t) return;
        const dx = t.x - touchStartX.value;
        const dy = t.y - touchStartY.value;
        if (dx > 8 && Math.abs(dy) < 24) {
          state.activate();
        }
      })
      .onTouchesUp((_, state) => {
        "worklet";
        state.fail();
      })
      .onTouchesCancelled((_, state) => {
        "worklet";
        state.fail();
      })
      .onUpdate((e) => {
        const ok =
          e.translationX > SWIPE_MIN_TRANSLATION_PX ||
          e.velocityX > SWIPE_MIN_VELOCITY_X;
        if (!ok) return;
        triggerBack();
      })
      .onEnd((e) => {
        const ok =
          e.translationX > SWIPE_MIN_TRANSLATION_PX ||
          e.velocityX > SWIPE_MIN_VELOCITY_X;
        if (!ok) return;
        triggerBack();
      });
  }, [goBackOrFallback, backTriggered, touchStartX, touchStartY]);

  const edgeBandInsets = useMemo(() => {
    if (edges === "content") {
      return { top: 0, bottom: 0 };
    }
    return { top: HEADER_GUARD_PX, bottom: bottomTabGuardPx };
  }, [edges, bottomTabGuardPx]);

  return (
    <View style={[styles.zone, style]}>
      {children}
      {Platform.OS === "android" ? (
        <>
          {SHOW_EDGE_SWIPE_ZONE_OVERLAY ? (
            <View
              pointerEvents="none"
              style={[
                styles.edgeOverlay,
                edgeBandInsets,
                { backgroundColor: GESTURE_ZONE_OVERLAY_COLOR }
              ]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ) : null}
          <GestureDetector gesture={pan}>
            <View
              style={[styles.edgeGestureStrip, edgeBandInsets]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              collapsable={false}
            />
          </GestureDetector>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    flex: 1,
    overflow: "hidden",
    pointerEvents: "box-none"
  },
  edgeOverlay: {
    position: "absolute",
    left: EDGE_INSET_PX,
    width: EDGE_OVERLAY_WIDTH_PX,
    zIndex: 999
  },
  edgeGestureStrip: {
    position: "absolute",
    left: EDGE_INSET_PX,
    width: EDGE_GESTURE_WIDTH_PX,
    zIndex: 1000,
    backgroundColor: "transparent",
    pointerEvents: "auto"
  }
});
