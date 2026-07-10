import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Login from "features/authentication/pages/AuthenticationLogin.tsx";
import {
  ForceTwoFactorParams,
  Routes,
  TwoFactorSetupParams,
  TwoFactorVerifyParams
} from "core/navigation/types/types.ts";
import { AuthenticationTwoFactorVerify } from "features/authentication/pages/AuthenticationTwoFactorVerify.tsx";
import { AuthenticationForgotPassword } from "features/authentication/pages/AuthenticationForgotPassword.tsx";
import { ForgotPasswordBody } from "shared/api/users/types.ts";
import { AuthenticationForgotPasswordConfirmation } from "features/authentication/pages/AuthenticationForgotPasswordConfirmation.tsx";
import { AuthenticationForceTwoFactor } from "features/authentication/pages/AuthenticationForceTwoFactor.tsx";
import { AuthenticationTwoFactorSetup } from "features/authentication/pages/AuthenticationTwoFactorSetup.tsx";

export type UnauthenticatedParams = {
  Login: undefined;
  TwoFactorVerify: TwoFactorVerifyParams;
  ForceTwoFactor: ForceTwoFactorParams;
  TwoFactorSetup: TwoFactorSetupParams;
  ForgotPassword: undefined;
  ForgotPasswordConfirmation: ForgotPasswordBody;
};

const UnauthenticatedStack =
  createNativeStackNavigator<UnauthenticatedParams>();

export const UnauthenticatedStackNavigator = () => {
  return (
    <>
      <UnauthenticatedStack.Navigator
        initialRouteName={Routes.Login}
        screenOptions={{
          headerShown: false
        }}
      >
        <UnauthenticatedStack.Screen name={Routes.Login} component={Login} />
        <UnauthenticatedStack.Screen
          name={Routes.TwoFactorVerify}
          component={AuthenticationTwoFactorVerify}
        />
        <UnauthenticatedStack.Screen
          name={Routes.ForceTwoFactor}
          component={AuthenticationForceTwoFactor}
        />
        <UnauthenticatedStack.Screen
          name={Routes.ForgotPassword}
          component={AuthenticationForgotPassword}
        />
        <UnauthenticatedStack.Screen
          name={Routes.ForgotPasswordConfirmation}
          component={AuthenticationForgotPasswordConfirmation}
        />
        <UnauthenticatedStack.Screen
          name={Routes.TwoFactorSetup}
          component={AuthenticationTwoFactorSetup}
        />
      </UnauthenticatedStack.Navigator>
    </>
  );
};
