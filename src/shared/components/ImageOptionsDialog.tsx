import React from "react";
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Text,
  ViewStyle
} from "react-native";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";

const LIGHT = {
  backdrop: "rgba(0,0,0,0.45)",
  card: "#FFFFFF",
  text: "#000000",
  separator: "rgba(60,60,67,0.12)"
};

export interface ImageOptionsDialogProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  hasCurrentImage: boolean;
  onUpload: () => void;
  onTakePhoto: () => void;
  onViewCurrent?: () => void;
  cardStyle?: ViewStyle;
}

export const ImageOptionsDialog: React.FC<ImageOptionsDialogProps> = ({
  visible,
  onClose,
  title: _title,
  hasCurrentImage,
  onUpload,
  onTakePhoto,
  onViewCurrent,
  cardStyle
}) => {
  const handleUpload = () => {
    onUpload();
  };

  const handleTakePhoto = () => {
    onTakePhoto();
  };

  const handleViewCurrent = () => {
    onClose();
    onViewCurrent?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <TouchableOpacity
          style={[styles.card, cardStyle]}
          activeOpacity={1}
          onPress={() => {}}
        >
          {/* <Text style={styles.title}>{title}</Text> */}

          <TouchableOpacity
            style={styles.option}
            activeOpacity={0.7}
            onPress={handleUpload}
          >
            <Text style={styles.optionText}>Upload from gallery</Text>
          </TouchableOpacity>
          <View style={styles.separator} />

          <TouchableOpacity
            style={styles.option}
            activeOpacity={0.7}
            onPress={handleTakePhoto}
          >
            <Text style={styles.optionText}>Take photo</Text>
          </TouchableOpacity>

          {hasCurrentImage && (
            <>
              <View style={styles.separator} />
              <TouchableOpacity
                style={styles.option}
                activeOpacity={0.7}
                onPress={handleViewCurrent}
              >
                <Text style={styles.optionText}>View current</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.breakLine} />
          <View style={styles.cancelGap} />
          <TouchableOpacity
            style={styles.cancelButton}
            activeOpacity={0.7}
            onPress={onClose}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: LIGHT.backdrop,
    justifyContent: "center",
    paddingHorizontal: padding.lg,
    paddingBottom: padding["2xl"] + padding.lg
  },
  card: {
    backgroundColor: LIGHT.card,
    borderRadius: borderRadius.xl,
    overflow: "hidden"
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: LIGHT.text,
    textAlign: "center",
    paddingVertical: padding.lg
  },
  option: {
    paddingVertical: padding.lg,
    paddingHorizontal: padding.xl,
    alignItems: "center"
  },
  optionText: {
    fontSize: fontSize.md,
    color: LIGHT.text,
    fontWeight: "500"
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: LIGHT.separator,
    marginLeft: padding.xl
  },
  breakLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: LIGHT.separator,
    marginHorizontal: padding.xl,
    marginTop: padding.sm
  },
  cancelGap: {
    height: padding.lg
  },
  cancelButton: {
    alignSelf: "center",
    paddingVertical: padding.lg,
    paddingHorizontal: padding["2xl"],
    alignItems: "center",
    justifyContent: "center"
  },
  cancelText: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: LIGHT.text
  }
});

/** Profile picture options dialog (white mode). Use on iOS and Android. */
export const ProfileImageOptionsDialog: React.FC<
  Omit<ImageOptionsDialogProps, "title">
> = (props) => <ImageOptionsDialog {...props} title="Profile picture" />;

/** Banner image options dialog (white mode). Use on iOS and Android. */
export const BannerImageOptionsDialog: React.FC<
  Omit<ImageOptionsDialogProps, "title">
> = (props) => <ImageOptionsDialog {...props} title="Banner image" />;
