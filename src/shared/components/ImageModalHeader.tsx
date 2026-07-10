import React from "react";
import {
  Platform,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View
} from "react-native";
import Icon from "shared/components/Icon.tsx";
import { Text } from "shared/components/Text.tsx";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";
import {
  copyImageToClipboard,
  saveImageToCameraRoll
} from "shared/utils/imageModalActions.ts";

type ImageModalHeaderProps = {
  onClose: () => void;
  imageUrl: string;
  authToken?: string;
};

export function ImageModalHeader({
  onClose,
  imageUrl,
  authToken
}: ImageModalHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.leftRow}>
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.tapTarget, styles.iconBox]}
          onPress={() => {
            onClose();
            void saveImageToCameraRoll(imageUrl, authToken);
          }}
        >
          <Icon name="download-cloud-02" size={25} color="white" />
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.tapTarget, styles.iconBox]}
          onPress={() => {
            onClose();
            void copyImageToClipboard(imageUrl, authToken);
          }}
        >
          <Icon name="copy-01" size={24} color="white" />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.tapTarget, styles.iconBox]}
        onPress={onClose}
      >
        <Text size={fontSize["2xl"]} weight="bold" style={styles.closeText}>
          ×
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop:
      Platform.OS === "android"
        ? padding.lg
        : StatusBar.currentHeight
          ? StatusBar.currentHeight + padding["6xl"]
          : padding["6xl"],
    marginHorizontal: padding.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  leftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: padding.md
  },
  tapTarget: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center"
  },
  iconBox: {
    backgroundColor: "#000000",
    borderRadius: borderRadius.md,
    overflow: "hidden"
  },
  closeText: {
    color: "white",
    textAlign: "center",
    lineHeight: fontSize["2xl"] + 4
  }
});
