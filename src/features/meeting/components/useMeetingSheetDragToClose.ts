import { useCallback, useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import {
  runOnJS,
  type SharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated";

/** Match DrawerProvider swipe-to-dismiss thresholds. */
export const MEETING_SHEET_SWIPE_CLOSE_TRANSLATION_Y = 100;
export const MEETING_SHEET_SWIPE_CLOSE_VELOCITY_Y = 800;

type UseMeetingSheetDragToCloseOptions = {
  translateY: SharedValue<number>;
  sheetMaxY: SharedValue<number>;
  dragStartY: SharedValue<number>;
  onClose: () => void;
  /** When false, pan is disabled (e.g. keyboard open). */
  enabled?: boolean;
};

export function useMeetingSheetDragToClose({
  translateY,
  sheetMaxY,
  dragStartY,
  onClose,
  enabled = true
}: UseMeetingSheetDragToCloseOptions) {
  const finishClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const closeAnimated = useCallback(() => {
    const maxY = sheetMaxY.value;
    translateY.value = withTiming(maxY, { duration: 220 }, (finished) => {
      if (finished) {
        runOnJS(finishClose)();
      }
    });
  }, [finishClose, sheetMaxY, translateY]);

  const sheetPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetY(6)
        .failOffsetX([-24, 24])
        .onBegin(() => {
          dragStartY.value = translateY.value;
        })
        .onUpdate((event) => {
          const newY = dragStartY.value + Math.max(0, event.translationY);
          translateY.value = Math.min(newY, sheetMaxY.value);
        })
        .onEnd((event) => {
          const shouldClose =
            event.translationY > MEETING_SHEET_SWIPE_CLOSE_TRANSLATION_Y ||
            event.velocityY > MEETING_SHEET_SWIPE_CLOSE_VELOCITY_Y;
          if (shouldClose) {
            translateY.value = withTiming(
              sheetMaxY.value,
              { duration: 220 },
              (finished) => {
                if (finished) {
                  runOnJS(finishClose)();
                }
              }
            );
            return;
          }
          translateY.value = withSpring(0, {
            damping: 20,
            stiffness: 300
          });
        }),
    [enabled, finishClose, dragStartY, sheetMaxY, translateY]
  );

  return { sheetPanGesture, closeAnimated };
}
