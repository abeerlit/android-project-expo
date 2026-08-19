import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "hooks/use-theme.ts";
import {
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  View,
  Keyboard,
  BackHandler
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
  useDerivedValue
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  DrawerContext,
  OpenDrawerOptions
} from "core/drawer/DrawerContext.tsx";

export const DrawerProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const theme = useTheme();
  const { height: screenHeight } = Dimensions.get("window");

  // State
  const [isOpen, setIsOpen] = useState(false);
  const [overlayActive, setOverlayActive] = useState(false);
  const [drawerContent, setDrawerContent] = useState<React.ReactNode>(null);
  const [currentHeightPercent, setCurrentHeightPercent] = useState(0.9);
  const [preventBackdropClose, setPreventBackdropClose] = useState(false);

  const drawerOptionsRef = useRef<OpenDrawerOptions | undefined>(undefined);
  /**
   * Bumps on every `openDrawer`. Close animations capture the value at dismiss start and only call
   * `resetDrawerState` if it still matches — avoids wiping content when MainDrawer closes then
   * VideoDrawer opens before the previous close spring finishes (blank sheet).
   */
  const drawerSessionRef = useRef(0);

  // Animation - start fully closed (at screen height)
  const translateY = useSharedValue(screenHeight);
  const startPosition = useSharedValue(0);
  const openSnapY = useSharedValue(0);
  const preventSwipeCloseSV = useSharedValue(0);

  // Derived value: is the drawer visibly open?
  const isVisible = useDerivedValue(() => translateY.value < screenHeight);

  const resetDrawerState = useCallback(() => {
    setIsOpen(false);
    setOverlayActive(false);
    setDrawerContent(null);
    drawerOptionsRef.current = undefined;
    preventSwipeCloseSV.value = 0;
    setPreventBackdropClose(false);
  }, []);

  const finishCloseIfSameSession = useCallback(
    (sessionWhenClosing: number) => {
      if (drawerSessionRef.current !== sessionWhenClosing) return;
      resetDrawerState();
    },
    [resetDrawerState]
  );

  const openDrawer = (
    content: React.ReactNode,
    heightPercent: number = 0.9,
    options?: OpenDrawerOptions
  ) => {
    Keyboard.dismiss();
    drawerSessionRef.current += 1;
    const targetPosition = screenHeight * (1 - heightPercent);

    drawerOptionsRef.current = options;
    openSnapY.value = targetPosition;
    preventSwipeCloseSV.value = options?.preventSwipeClose ? 1 : 0;
    setPreventBackdropClose(!!options?.preventBackdropClose);

    setDrawerContent(content);
    setIsOpen(true);
    setOverlayActive(true);
    setCurrentHeightPercent(heightPercent);

    translateY.value = withSpring(targetPosition, {
      damping: 25,
      stiffness: 200
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    const onBack = () => {
      const cb = drawerOptionsRef.current?.onHardwareBackPress;
      if (cb) {
        cb();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [isOpen]);

  const closeDrawer = useCallback(() => {
    Keyboard.dismiss();
    const sessionWhenClosing = drawerSessionRef.current;
    setOverlayActive(false);
    translateY.value = withSpring(
      screenHeight,
      {
        damping: 40,
        stiffness: 150,
        restDisplacementThreshold: 1,
        restSpeedThreshold: 2,
        mass: 0.4
      },
      (finished) => {
        if (finished) {
          runOnJS(finishCloseIfSameSession)(sessionWhenClosing);
        }
      }
    );
  }, [finishCloseIfSameSession, screenHeight]);

  /** Same close spring as `closeDrawer`, for pan-dismiss; must run on JS to capture session. */
  const closeDrawerFromPanGesture = useCallback(() => {
    const sessionWhenClosing = drawerSessionRef.current;
    setOverlayActive(false);
    translateY.value = withSpring(
      screenHeight,
      {
        damping: 40,
        stiffness: 150,
        restDisplacementThreshold: 1,
        restSpeedThreshold: 2,
        mass: 0.4
      },
      (finished) => {
        if (finished) {
          runOnJS(finishCloseIfSameSession)(sessionWhenClosing);
        }
      }
    );
  }, [finishCloseIfSameSession, screenHeight]);

  // Pan is attached only to the top handle strip so list/content can scroll.
  const panGesture = Gesture.Pan()
    .activeOffsetY(6)
    .failOffsetX([-24, 24])
    .onBegin(() => {
      startPosition.value = translateY.value;
    })
    .onUpdate((event) => {
      if (preventSwipeCloseSV.value === 1) {
        translateY.value = startPosition.value;
        return;
      }
      const newY = startPosition.value + Math.max(0, event.translationY);
      translateY.value = Math.min(newY, screenHeight);
    })
    .onEnd((event) => {
      if (preventSwipeCloseSV.value === 1) {
        translateY.value = withSpring(openSnapY.value, {
          damping: 20,
          stiffness: 300
        });
        return;
      }

      const shouldClose = event.translationY > 100 || event.velocityY > 800;

      if (shouldClose) {
        runOnJS(closeDrawerFromPanGesture)();
      } else {
        translateY.value = withSpring(openSnapY.value, {
          damping: 20,
          stiffness: 300
        });
      }
    });

  // Drawer position style
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }]
  }));

  // Overlay opacity animation
  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: isVisible.value ? 1 : 0
  }));

  return (
    <DrawerContext.Provider
      value={{
        openDrawer,
        closeDrawer,
        setSnapPoint: () => {},
        isOpen,
        currentSnapPoint: 0
      }}
    >
      {children}

      {/* Always render overlay; animate opacity */}
      <Animated.View
        style={[styles.overlay, overlayAnimatedStyle]}
        pointerEvents={overlayActive ? "auto" : "none"}
      >
        {preventBackdropClose ? (
          <View style={styles.backdrop} pointerEvents="box-none" />
        ) : (
          <TouchableOpacity
            style={styles.backdrop}
            onPress={closeDrawer}
            activeOpacity={1}
          />
        )}

        <Animated.View
          style={[
            styles.drawer,
            animatedStyle,
            {
              height: screenHeight * currentHeightPercent,
              backgroundColor:
                drawerOptionsRef.current?.backgroundColor ??
                theme.colors["color-colors-background-bg-secondary"],
              borderColor:
                drawerOptionsRef.current?.borderColor ??
                theme.colors["color-colors-border-border-secondary"]
            }
          ]}
        >
          <GestureDetector gesture={panGesture}>
            <View style={styles.handleStrip}>
              <View
                style={[
                  styles.handle,
                  drawerOptionsRef.current?.handleColor
                    ? { backgroundColor: drawerOptionsRef.current.handleColor }
                    : null
                ]}
              />
            </View>
          </GestureDetector>
          <View style={[styles.content]}>{drawerContent}</View>
        </Animated.View>
      </Animated.View>
    </DrawerContext.Provider>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)"
  },
  drawer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowOffset: {
      width: 0,
      height: -3
    },
    elevation: 6
  },
  handleStrip: {
    width: "100%",
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 14,
    minHeight: 44
  },
  handle: {
    width: 40,
    height: 5,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 2.5,
    alignSelf: "center",
    marginTop: 0,
    marginBottom: 0
  },
  content: {
    flex: 1,
    paddingBottom: 20
  }
});
