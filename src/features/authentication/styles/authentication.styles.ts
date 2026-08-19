import { StyleSheet } from "react-native";

export const authenticationStyles = StyleSheet.create({
  loginHeaderContainer: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    paddingTop: 25,
    zIndex: 1
  },
  loginBackgroundIconContainer: {
    position: "absolute",
    top: -80,
    zIndex: -1
  },
  forgotRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "flex-end"
  },
  rememberRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center"
  },
  line: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flex: 1
  },
  backgroundIconContainer: {
    position: "absolute",
    top: -92.5,
    zIndex: -1
  },
  iconContainer: {
    width: 40,
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10
  },
  crossIcon: {
    position: "absolute",
    right: 20,
    top: 32.5,
    zIndex: 1
  },
  rippleBg: {
    zIndex: -1
  },
  cell: {
    width: 58,
    height: 70,
    marginRight: 5,
    borderRadius: 10,
    lineHeight: 70,
    borderWidth: 1,
    textAlign: "center"
  },
  resentContainer: {
    display: "flex",
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start"
  },
  buttonContainer: {
    width: "100%",
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  button: {
    width: "49%"
  },
  twoFactorBackgroundIconContainer: {
    position: "absolute",
    top: -72.5
  },
  twoFaCard: {
    display: "flex",
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 10,
    justifyContent: "space-between",
    padding: 10
  },
  cardIconContainer: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center"
  },
  appSetupKeyContainer: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7.5,
    marginHorizontal: "8.5%",
    borderRadius: 5
  },
  generateCodeCard: {
    paddingVertical: 2.5,
    paddingHorizontal: 15,
    borderRadius: 15,
    marginLeft: "22.5%"
  }
});
