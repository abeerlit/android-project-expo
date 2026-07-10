import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, Platform } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from "react-native-reanimated";
import { useTheme } from "hooks/use-theme.ts";

interface LoadingSpinnerProps {
  size?: number;
  color?: string;
  style?: any;
}

const STROKE_WIDTH = 3;
const ARC_RATIO = 0.25;

function AndroidSvgSpinner({
  size,
  arcColor,
  trackColor,
  style
}: {
  size: number;
  arcColor: string;
  trackColor: string;
  style?: any;
}) {
  const rotation = useSharedValue(0);
  const radius = (size - STROKE_WIDTH) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * ARC_RATIO;

  useEffect(() => {
    rotation.value = 0;
    rotation.value = withRepeat(
      withTiming(360, { duration: 1000, easing: Easing.linear }),
      -1,
      false
    );
  }, [rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }]
  }));

  return (
    <View style={[styles.container, style, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={STROKE_WIDTH}
          fill="none"
        />
      </Svg>
      <Reanimated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, animatedStyle]}
      >
        <Svg width={size} height={size}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={arcColor}
            strokeWidth={STROKE_WIDTH}
            fill="none"
            strokeDasharray={`${arcLength} ${circumference - arcLength}`}
            strokeLinecap="round"
            rotation={-90}
            originX={center}
            originY={center}
          />
        </Svg>
      </Reanimated.View>
    </View>
  );
}

export function LoadingSpinner({
  size = 40,
  color,
  style
}: LoadingSpinnerProps) {
  const theme = useTheme();
  const spinValue = useRef(new Animated.Value(0)).current;

  const arcColor = color || theme.colors.primary || "#03171F";
  const trackColor =
    theme.colors["color-colors-border-border-secondary"] || "#E4E4E7";

  useEffect(() => {
    if (Platform.OS === "android") {
      return;
    }

    const spin = () => {
      spinValue.setValue(0);
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true
      }).start(() => spin());
    };
    spin();
  }, [spinValue]);

  const rotate = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"]
  });

  if (Platform.OS === "android") {
    return (
      <AndroidSvgSpinner
        size={size}
        arcColor={arcColor}
        trackColor={trackColor}
        style={style}
      />
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Animated.View
        style={[
          styles.spinner,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: trackColor,
            borderTopColor: arcColor,
            transform: [{ rotate }]
          }
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center"
  },
  spinner: {
    borderWidth: STROKE_WIDTH
  }
});
