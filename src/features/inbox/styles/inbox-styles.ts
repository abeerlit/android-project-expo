import { StyleSheet } from "react-native";
import { padding } from "core/theme/theme.ts";

export const inboxStyles = StyleSheet.create({
  pressableStyle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: padding["3xl"],
    paddingHorizontal: padding["3xl"],
    borderBottomWidth: 1
  }
});
