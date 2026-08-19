import React from "react";
import { Dimensions, StyleSheet, View, Platform } from "react-native";
import Dialog from "react-native-dialog";

const { width: screenWidth } = Dimensions.get("window");
import { toast } from "@backpackapp-io/react-native-toast";
import { useTheme } from "hooks/use-theme.ts";
import { padding } from "core/theme/theme.ts";
import { Text } from "shared/components/Text.tsx";
import { LinkDialogProps } from "../types.ts";

export const LinkDialog: React.FC<LinkDialogProps> = ({
  state,
  onStateChange,
  onSave
}) => {
  const theme = useTheme();
  const isIOS = Platform.OS === "ios";
  const dialogBgColor = theme.colors["color-colors-background-bg-primary"];
  // Keep labels black in dark mode (like light mode) for visibility on dialog
  const textColor = theme.dark
    ? "#1A1A1E"
    : theme.colors["color-colors-text-text-primary"];

  const handleSave = () => {
    if (state.link) {
      onSave(state.link, state.title);
      onStateChange({ visible: false, link: "", title: "" });
    } else {
      toast.error("Could not set link");
      onStateChange({ ...state, visible: false });
    }
  };

  const handleCancel = () => {
    onStateChange({ visible: false, link: "", title: "" });
  };

  return (
    <Dialog.Container
      visible={state.visible}
      contentStyle={[styles.dialogContent, { backgroundColor: dialogBgColor }]}
      blurComponentIOS={isIOS ? null : undefined}
      buttonSeparatorStyle={isIOS ? { backgroundColor: "#e0e0e0" } : undefined}
    >
      <Dialog.Title style={{ color: textColor }}>Add Link</Dialog.Title>
      <View style={styles.dialogInputContainer}>
        <Text
          align={"left"}
          style={[styles.dialogLabel, { color: textColor }]}
          weight="medium"
        >
          Title
        </Text>
        <Dialog.Input
          style={[styles.dialogInput, { color: textColor }]}
          placeholder="Link title"
          placeholderTextColor={
            theme.dark
              ? "#51525C"
              : theme.colors["color-colors-text-text-tertiary"]
          }
          value={state.title}
          onChangeText={(title) => onStateChange({ ...state, title })}
        />
      </View>
      <View style={styles.dialogInputContainer}>
        <Text
          align={"left"}
          style={[styles.dialogLabel, { color: textColor }]}
          weight="medium"
        >
          Link
        </Text>
        <Dialog.Input
          style={[styles.dialogInput, { color: textColor }]}
          placeholder="https://"
          placeholderTextColor={
            theme.dark
              ? "#51525C"
              : theme.colors["color-colors-text-text-tertiary"]
          }
          value={state.link}
          onChangeText={(link) => onStateChange({ ...state, link })}
        />
      </View>
      <Dialog.Button label="Cancel" color={textColor} onPress={handleCancel} />
      <Dialog.Button label="Save" color={textColor} onPress={handleSave} />
    </Dialog.Container>
  );
};

const styles = StyleSheet.create({
  dialogContent: {
    flexDirection: "column",
    alignItems: "flex-start",
    marginBottom: padding.lg,
    width: screenWidth * 0.8,
    maxWidth: screenWidth * 0.8
  },
  dialogInputContainer: {
    alignSelf: "stretch",
    width: "100%",
    paddingHorizontal: padding.md
  },
  dialogLabel: {
    marginLeft: Platform.OS === "ios" ? padding["2xl"] : 9,
    paddingBottom: padding.lg
  },
  dialogInput: {
    width: "100%"
  }
});
