import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet } from "react-native";
import { useTheme } from "hooks/use-theme.ts";

interface LoadingSpinnerProps {
  size?: number;
  color?: string;
  style?: any;
}

export function LoadingSpinner({
  size = 40,
  color,
  style
}: LoadingSpinnerProps) {
  const theme = useTheme();
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
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

  const spinnerColor = color || theme.colors.primary;

  return (
    <View style={[styles.container, style]}>
      <Animated.View
        style={[
          styles.spinner,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: theme.colors["color-colors-border-border-secondary"],
            borderTopColor: spinnerColor,
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
    borderWidth: 3
  }
});
