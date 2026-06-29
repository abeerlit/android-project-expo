import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { UnauthenticatedParams } from "core/navigation/navigators/UnauthenticatedStack.tsx";
import { Routes } from "core/navigation/types/types.ts";

//Navigation Props
export type ForgotPasswordNavigationProp = NativeStackNavigationProp<
  UnauthenticatedParams,
  Routes.TwoFactorVerify
>;

export type ForgotPasswordConfirmationNavigationProp =
  NativeStackNavigationProp<UnauthenticatedParams, Routes.TwoFactorVerify>;

export type LoginScreenNavigationProp = NativeStackNavigationProp<
  UnauthenticatedParams,
  Routes.TwoFactorVerify
>;

export type ForceTwoFactorNavigationProp = NativeStackNavigationProp<
  UnauthenticatedParams,
  Routes.ForceTwoFactor
>;

// Component Props
