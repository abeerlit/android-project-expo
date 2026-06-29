import { StyleSheet } from "react-native";
import { padding } from "core/theme/theme.ts";

export const homeStyles = StyleSheet.create({
  centeredMessageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: padding.xl
  },
  centeredMessageText: {
    textAlign: "center"
  },
  searchResultsContainer: {
    paddingVertical: padding.xl
  },
  switchContainer: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }]
  },
  searchBarContainer: {
    marginHorizontal: padding.xl
  },
  scrollContentContainer: {
    flexGrow: 1
  },
  accordionContainer: {
    marginBottom: 20
  },
  actionButton: {
    marginTop: 10
  },
  queueItem: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: padding["3xl"],
    marginVertical: 8,
    gap: 8
  },
  queueTitleContainer: {
    gap: padding.lg,
    alignItems: "center",
    flexDirection: "row",
    display: "flex"
  },
  dndSwitch: {
    // height: 20,
    // width: 32
  }
});
