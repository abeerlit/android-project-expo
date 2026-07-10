import React from "react";
import { Image, StyleProp, ImageStyle } from "react-native";

/** Synced from tenant `APP_ICON` via `npm run ui-branding:sync` (also runs on postinstall). */
import appIcon from "assets/branding/app-icon.png";

type Props = {
  size?: number;
  style?: StyleProp<ImageStyle>;
};

export function BrandingLogo({ size = 40, style }: Props) {
  return (
    <Image
      source={appIcon}
      style={[{ width: size, height: size, alignSelf: "center" }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="App logo"
    />
  );
}
