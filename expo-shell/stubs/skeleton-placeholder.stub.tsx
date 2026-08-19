/**
 * JS shimmer stub — real react-native-skeleton-placeholder needs masked-view + linear-gradient
 * in the dev client binary (enable with EXPO_PUBLIC_NATIVE_FULL=1 + native rebuild).
 */
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle
} from "react-native";

const SHIMMER_BG = "#E1E9EE";
const SHIMMER_HIGHLIGHT = "#F2F8FC";

type ItemProps = ViewStyle & {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

function ShimmerBlock({ style }: { style?: StyleProp<ViewStyle> }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  return (
    <View style={[styles.shimmerRoot, style]}>
      <Animated.View
        style={[
          styles.shimmerBand,
          {
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-160, 360]
                })
              }
            ]
          }
        ]}
      />
    </View>
  );
}

function SkeletonItem({ children, style, ...layout }: ItemProps) {
  const layoutStyle: StyleProp<ViewStyle> = [layout, style];
  const hasChildNodes =
    children != null &&
    React.Children.toArray(children).some(
      (c) => c != null && (typeof c !== "string" || c.length > 0)
    );

  if (hasChildNodes) {
    return <View style={layoutStyle}>{children}</View>;
  }

  return <ShimmerBlock style={layoutStyle} />;
}

type SkeletonPlaceholderProps = ViewProps & {
  children?: React.ReactNode;
  borderRadius?: number;
  enabled?: boolean;
  backgroundColor?: string;
  highlightColor?: string;
  speed?: number;
};

function SkeletonPlaceholder({
  children,
  enabled = true,
  style
}: SkeletonPlaceholderProps) {
  if (!enabled) {
    return <>{children}</>;
  }
  return <View style={style}>{children}</View>;
}

SkeletonPlaceholder.Item = SkeletonItem;

export default SkeletonPlaceholder;

const styles = StyleSheet.create({
  shimmerRoot: {
    overflow: "hidden",
    backgroundColor: SHIMMER_BG
  },
  shimmerBand: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 120,
    backgroundColor: SHIMMER_HIGHLIGHT,
    opacity: 0.75
  }
});
