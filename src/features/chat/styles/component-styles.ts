import { StyleSheet } from "react-native";
import { padding } from "core/theme/theme.ts";

export const channelListRowStyles = StyleSheet.create({
  containerStyle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: padding["3xl"],
    paddingRight: 12,
    paddingVertical: 8,
    gap: 8
  },
  badgeContainer: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: padding.md,
    paddingVertical: padding.xxs,
    alignItems: "center",
    justifyContent: "center"
  }
});
