import { StyleSheet } from "react-native";

export const offDutyStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center"
  },
  rightHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 14
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8
  },
  modalContainer: {
    padding: 20,
    borderRadius: 8
  },
  modalTitle: {
    marginBottom: 16
  },
  buttonGroup: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24
  },
  button: {
    width: "48%"
  }
});

export const agentStatusDrawerStyles = StyleSheet.create({
  container: {
    alignItems: "flex-start"
  },
  headerText: {
    fontWeight: "600",
    width: "100%",
    marginBottom: 20
  },
  divider: {
    borderStyle: "solid",
    borderWidth: 0.5,
    width: "100%"
  },
  statusLabel: {
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  statusOption: {
    width: "100%",
    alignItems: "flex-start"
  },
  optionText: {
    paddingHorizontal: 16,
    paddingVertical: 12
  }
});
