import React from "react";
import { DimensionValue, StyleProp, View, ViewStyle } from "react-native";

export interface Props {
  height?: DimensionValue | undefined;
  width?: DimensionValue | undefined;
  style?: StyleProp<ViewStyle>;
}

export function WhiteSpace({ height, width = "auto", style }: Props) {
  return <View style={[{ width: width, height: height }, style]} />;
}
