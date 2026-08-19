// Type Imports
import React from "react";

// Component Imports
import { View } from "react-native";
import { CachedImage } from "shared/components/CachedImage.tsx";

export function ContactDrawerBanner({
  src,
  width = "100%",
  height = 120
}: {
  src: string | null;
  name?: string;
  width?: any;
  height?: any;
}) {
  if (!src) {
    return (
      <View
        style={{
          height: height,
          backgroundColor: "#8EC5FC",
          width: width
        }}
      ></View>
    );
  }

  return (
    <CachedImage
      uri={src}
      style={{
        height: height,
        backgroundColor: "#8EC5FC",
        width: width
      }}
      resizeMode="cover"
    />
  );
}
