import React, { ReactNode, useRef } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  I18nManager,
  Platform
} from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import Swipeable, {
  type SwipeableMethods
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { useTheme } from "hooks/use-theme.ts";
import Icon from "shared/components/Icon.tsx";
import { useHomeScrollNativeGesture } from "features/home/context/HomeScrollGestureContext.tsx";

export type SwipeableListCoordinator = {
  onRightWillOpen: (instance: SwipeableMethods) => void;
  onClose: (instance: SwipeableMethods) => void;
};

type SwipeableDirectMessageRowProps = {
  children: ReactNode;
  onHide: () => void | Promise<void>;
  swipeDisabled?: boolean;
  coordinator?: SwipeableListCoordinator;
};

const ACTION_WIDTH = 48;

/** Android only: hide trash until swipe progress > 0 (Expo ReanimatedSwipeable peek bug). */
function HideActionIcon({
  progress,
  children
}: {
  progress: SharedValue<number>;
  children: ReactNode;
}) {
  if (Platform.OS !== "android") {
    return <>{children}</>;
  }
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value
  }));
  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

export const SwipeableDirectMessageRow: React.FC<
  SwipeableDirectMessageRowProps
> = ({ children, onHide, swipeDisabled, coordinator }) => {
  const theme = useTheme();
  const swipeRef = useRef<SwipeableMethods | null>(null);
  const homeScrollNativeGesture = useHomeScrollNativeGesture();

  if (swipeDisabled) {
    return <>{children}</>;
  }

  const renderRightActions = (
    progress: SharedValue<number>,
    _translation: SharedValue<number>,
    _methods: SwipeableMethods
  ) => (
    <View style={styles.actionsWrap} pointerEvents="box-none">
      <HideActionIcon progress={progress}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hide conversation"
          onPress={() => {
            swipeRef.current?.close();
            void Promise.resolve(onHide());
          }}
          style={({ pressed }) => [
            styles.actionBtn,
            { opacity: pressed ? 0.85 : 1 }
          ]}
        >
          <Icon
            name="trash-01"
            size={20}
            color={theme.colors["color-colors-foreground-fg-error-primary"]}
          />
        </Pressable>
      </HideActionIcon>
    </View>
  );

  return (
    <Swipeable
      ref={swipeRef}
      friction={1}
      overshootRight={false}
      renderRightActions={renderRightActions}
      dragOffsetFromRightEdge={Platform.OS === "ios" ? 20 : 24}
      dragOffsetFromLeftEdge={40}
      rightThreshold={ACTION_WIDTH / 2}
      simultaneousWithExternalGesture={homeScrollNativeGesture}
      childrenContainerStyle={styles.childrenContainer}
      containerStyle={styles.swipeContainer}
      onSwipeableWillOpen={(direction) => {
        if (direction === "left" && swipeRef.current && coordinator) {
          coordinator.onRightWillOpen(swipeRef.current);
        }
      }}
      onSwipeableClose={() => {
        if (swipeRef.current && coordinator) {
          coordinator.onClose(swipeRef.current);
        }
      }}
    >
      {children}
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  swipeContainer: {
    overflow: "hidden"
  },
  childrenContainer: {
    alignSelf: "stretch",
    width: "100%"
  },
  actionsWrap: {
    width: ACTION_WIDTH,
    flexDirection: I18nManager.isRTL ? "row-reverse" : "row"
  },
  actionBtn: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: ACTION_WIDTH
  }
});
