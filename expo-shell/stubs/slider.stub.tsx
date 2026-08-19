import React from "react";
import { View, type ViewStyle } from "react-native";

type SliderProps = {
  value?: number;
  minimumValue?: number;
  maximumValue?: number;
  onValueChange?: (v: number) => void;
  style?: ViewStyle;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
};

/** Expo dev shell placeholder — install @react-native-community/slider in dev client for real scrubber. */
export default function Slider({ style }: SliderProps) {
  return <View style={[{ height: 4, flex: 1, backgroundColor: "#ccc", borderRadius: 2 }, style]} />;
}
