import { AZURE_CLIENT_ID } from "@env";
import { Platform } from "react-native";
import { getMicrosoftOAuthRedirectUrl } from "shared/branding/appBrand.ts";

// export const microsoftConfig = {
//   issuer:
//     "https://login.microsoftonline.com/0f4fc4eb-8d48-4f7a-9dff-988af7dcbad9",
//   clientId: AZURE_CLIENT_ID,
//   redirectUrl:
//     Platform.OS === "android"
//       ? "co.voxo.android://co.voxo.android/android/callback"
//       : "co.voxo.voxo-ios://co.voxo.voxo-ios/ios/callback",
//   scopes: ["openid", "profile", "email"],
//   serviceConfiguration: {
//     authorizationEndpoint:
//       "https://login.microsoftonline.com/0f4fc4eb-8d48-4f7a-9dff-988af7dcbad9/oauth2/v2.0/authorize",
//     tokenEndpoint:
//       "https://login.microsoftonline.com/0f4fc4eb-8d48-4f7a-9dff-988af7dcbad9/oauth2/v2.0/token"
//   }
// };

export const microsoftConfig = {
  issuer:
    "https://login.microsoftonline.com/common",
  clientId: AZURE_CLIENT_ID,
  redirectUrl:
    Platform.OS === "android"
      ? getMicrosoftOAuthRedirectUrl()
      : "co.voxo.voxo-ios://co.voxo.voxo-ios/ios/callback",
  scopes: ["openid", "profile", "email", "User.Read"],
  serviceConfiguration: {
    authorizationEndpoint:
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenEndpoint:
      "https://login.microsoftonline.com/common/oauth2/v2.0/token"
  }
};
