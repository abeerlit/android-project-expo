// React Imports
import React, { useState, useEffect } from "react";
import { Dimensions, Platform, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/core";
import { useParams } from "hooks/use-params.ts";
import { useTheme } from "hooks/use-theme.ts";
import { useDispatch, useSelector } from "react-redux";
import {
  resendOTP,
  validateMFA,
  verifyMFA,
  verifyMFAAuth,
  resendOTPAuth
} from "shared/api/authentication/methods.ts";
import { toast } from "@backpackapp-io/react-native-toast";
import { phoneNumberFormatter } from "shared/utils/utils.ts";
import { Logger } from "shared/utils/Logger.ts";
import {
  LOGIN_SUCCESS,
  SET_MFA_SETUP_STATE,
  CLEAR_MFA_SETUP_STATE
} from "store/authentication/actions.ts";
import { updateUser } from "store/users/actions.ts";
import { State } from "store/types.ts";

// Type Imports
import { UnauthenticatedParams } from "core/navigation/navigators/UnauthenticatedStack.tsx";
import { Routes } from "core/navigation/types/types.ts";
import { authenticationStyles } from "features/authentication/styles/authentication.styles.ts";
import { MFAMode, MFAVerifyBody } from "shared/api/authentication/types.ts";

// Component Imports
import { Screen } from "shared/components/utils/Screen.tsx";
import { Text } from "shared/components/Text.tsx";
import { Button } from "shared/components/Button.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { IconBackgroundHeader } from "shared/components/IconBackgroundHeader.tsx";
import {
  CodeField,
  Cursor,
  useClearByFocusCell
} from "react-native-confirmation-code-field";
import { StackActions } from "@react-navigation/native";
import { padding } from "core/theme/theme.ts";

function tokenPreview(t: string | undefined): string | undefined {
  if (t == null || t === "") return undefined;
  return `${t.slice(0, 8)}…(len=${t.length})`;
}

export function AuthenticationTwoFactorVerify() {
  const { width: iconWidth } = Dimensions.get("window");
  // Navigation Params
  const params = useParams<UnauthenticatedParams[Routes.TwoFactorVerify]>();

  // Redux state
  const isAuthenticated = useSelector(
    (state: State) => state.userReducer.user !== null
  );
  const accessToken = useSelector(
    (state: State) => state.authReducer.accessToken
  );
  const savedMfaState = useSelector(
    (state: State) => state.authReducer.mfaSetupState
  );

  const type = params?.mode || savedMfaState?.mode || "";
  const phoneNumber = params?.phoneNumber || savedMfaState?.phoneNumber || "";
  const email = params?.email || savedMfaState?.email || "";

  // Set 2FA Mode Info From Nav Params
  let method, contact, icon;
  switch (type) {
    case "email":
      method = "email";
      contact = email;
      icon = "mail-03";
      break;
    case "sms":
      method = "phone";
      contact = phoneNumberFormatter(phoneNumber);
      icon = "message-text-square-01";
      break;
    case "app":
      method = "authenticator app";
      contact = "your authenticator app";
      icon = "phone-02";
      break;
  }

  const secondHeader: { [key: string]: string } = {
    sms: `We've sent a code to`,
    email: `We've sent a code to`,
    app: "Enter the code from your authenticator app to verify"
  };

  // Constants
  const logger = new Logger("TwoFactorScreen");

  // Hooks
  const theme = useTheme();
  const navigation = useNavigation();
  const dispatch = useDispatch();

  // Local State
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string>("");
  const [token, setToken] = useState<string>(
    params?.token || savedMfaState?.token || ""
  );
  const [props, getCellOnLayoutHandler] = useClearByFocusCell({
    value: code,
    setValue: setCode
  });

  // Save MFA state to Redux on mount so user can navigate away and return.
  useEffect(() => {
    if (params?.token && params?.mode) {
      dispatch({
        type: SET_MFA_SETUP_STATE,
        payload: {
          token: params.token,
          mode: params.mode,
          phoneNumber: params.phoneNumber,
          email: params.email,
          setup: params.setup
        }
      });
    }
  }, [
    params?.token,
    params?.mode,
    params?.phoneNumber,
    params?.email,
    params?.setup,
    dispatch
  ]);

  // Methods
  const handleResend = async () => {
    try {
      let newMfaToken: string;
      if (isAuthenticated) {
        // Use authenticated resend
        const response = await resendOTPAuth(
          {
            mode: type as MFAMode,
            phoneNumber: type === "sms" ? phoneNumber : undefined
          },
          accessToken
        );
        newMfaToken = response.mfaVerifyToken;
      } else {
        // Use non-authenticated resend
        const response = await resendOTP({
          token,
          mode: type as MFAMode,
          phoneNumber: type === "sms" ? phoneNumber : undefined
        });
        newMfaToken = response.mfaVerifyToken;
      }

      setToken(newMfaToken);

      dispatch({
        type: SET_MFA_SETUP_STATE,
        payload: {
          token: newMfaToken,
          mode: type as MFAMode,
          phoneNumber: phoneNumber,
          email: email,
          setup: params?.setup || savedMfaState?.setup
        }
      });

      toast.success("Code sent successfully");
    } catch (error) {
      logger.error("Resend Error: ", error);
      toast.error("Error resending token");
    }
  };

  const handleSubmit = async () => {
    setLoading(true);

    if (code.length < 6) {
      setLoading(false);
      return toast.error("Invalid Code");
    }

    try {
      if (isAuthenticated) {
        // Authenticated flow
        const verifyData: MFAVerifyBody = {
          mode: params.mode as MFAMode,
          otp: code
        };

        if (params.phoneNumber) {
          verifyData.phoneNumber = params.phoneNumber;
        }

        await verifyMFAAuth(verifyData, accessToken);

        // Update Redux store based on MFA mode that was verified
        if (params.mode === "app") {
          dispatch(
            updateUser({
              mfaAppVerified: 1
            })
          );
        } else if (params.mode === "sms") {
          dispatch(
            updateUser({
              mfaSmsVerified: 1,
              mfaPhoneNumber: params.phoneNumber
            })
          );
        }

        // Success - go back to security page
        dispatch({ type: CLEAR_MFA_SETUP_STATE });
        toast.success("Two-factor authentication set up successfully");

        navigation.dispatch(StackActions.pop(2));
      } else {
        // Unauthenticated flow
        let response;
        const currentMode = params?.mode || savedMfaState?.mode;
        const currentPhoneNumber =
          params?.phoneNumber || savedMfaState?.phoneNumber;
        const isSetup = params?.setup || savedMfaState?.setup;

        if (isSetup) {
          const verifyPayload = {
            token,
            mode: currentMode as MFAMode,
            otp: code,
            phoneNumber: currentPhoneNumber
          };
          if (__DEV__) {
            console.warn("[AUTH][MFA] POST /v2/mfa/verify payload", {
              isAuthenticated: false,
              isSetup: true,
              mode: verifyPayload.mode,
              tokenPreview: tokenPreview(verifyPayload.token),
              otpLength: verifyPayload.otp?.length,
              hasPhoneNumber: !!verifyPayload.phoneNumber,
              hasSecret: !!(verifyPayload as { secret?: string }).secret
            });
          }
          response = await verifyMFA(verifyPayload);
        } else {
          const validatePayload = { token, otp: code };
          if (__DEV__) {
            console.warn("[AUTH][MFA] POST /v2/mfa/validate payload", {
              isAuthenticated: false,
              isSetup: false,
              tokenPreview: tokenPreview(validatePayload.token),
              otpLength: validatePayload.otp?.length
            });
          }
          response = await validateMFA(validatePayload);
        }
        dispatch({ type: CLEAR_MFA_SETUP_STATE });
        dispatch({
          type: LOGIN_SUCCESS,
          payload: response
        });
      }
    } catch (error) {
      setLoading(false);
      logger.error("OTP Validation Error: ", error);
      toast.error("Invalid Code");
    }
  };

  // Handle auto submitting if code reaches full length
  useEffect(() => {
    if (code.length === 6) {
      handleSubmit();
    }
  }, [code]);

  return (
    <Screen paddingHorizontal>
      <IconBackgroundHeader
        icon={icon}
        bg={"circle"}
        mainHeader={"Please check your " + method}
        secondHeader={
          <Text size={15}>
            {secondHeader[type]}{" "}
            {type === "sms" || type === "email" ? (
              <Text weight={"semiBold"}>{contact}</Text>
            ) : undefined}
          </Text>
        }
        iconWidth={iconWidth}
        iconHeight={385}
        backgroundStyle={[
          authenticationStyles.twoFactorBackgroundIconContainer,
          { left: -15 }
        ]}
      />
      <WhiteSpace height={30} />
      {(() => {
        const screenPadding = padding.xl * 2;
        const cellCount = 6;
        const marginBetweenCells = Platform.OS === "android" ? 3 : 5;
        const totalMargins = marginBetweenCells * (cellCount - 1);
        const availableWidth = iconWidth - screenPadding - totalMargins;
        const calculatedCellWidth =
          Platform.OS === "android"
            ? Math.max(45, Math.floor(availableWidth / cellCount))
            : 58;
        const calculatedCellHeight = Platform.OS === "android" ? 60 : 70;

        return (
          <CodeField
            renderCell={({ index, symbol, isFocused }) => (
              <Text
                key={index}
                style={[
                  authenticationStyles.cell,
                  {
                    borderColor:
                      theme.colors["color-colors-border-border-brand-solid"],
                    backgroundColor:
                      theme.colors["color-colors-background-bg-primary"],
                    color: theme.colors["color-colors-text-text-tertiary"],
                    width: calculatedCellWidth,
                    height: calculatedCellHeight,
                    marginRight:
                      index === cellCount - 1 ? 0 : marginBetweenCells,
                    lineHeight: calculatedCellHeight
                  }
                ]}
                onLayout={getCellOnLayoutHandler(index)}
                size={Platform.OS === "android" ? 24 : 30}
                weight={"regular"}
              >
                {/*@ts-ignore*/}
                {symbol || (isFocused && <Cursor />)}
              </Text>
            )}
            cellCount={6}
            value={code}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            onChangeText={setCode}
            autoComplete={
              Platform.OS === "android" ? "sms-otp" : "one-time-code"
            }
            {...props}
          />
        );
      })()}
      <WhiteSpace height={10} />
      {method !== "authenticator app" && (
        <View style={authenticationStyles.resentContainer}>
          <Text align={"left"} size={14}>
            Didn&apos;t get a code?
          </Text>
          <TouchableOpacity onPress={handleResend}>
            <Text style={{ textDecorationLine: "underline" }}>
              {" "}
              Click to Resend
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <WhiteSpace height={30} />
      <View style={authenticationStyles.buttonContainer}>
        <Button
          type={"outline"}
          onPress={() => {
            dispatch({ type: CLEAR_MFA_SETUP_STATE });
            navigation.dispatch(StackActions.pop(2));
          }}
          style={authenticationStyles.button}
        >
          Cancel
        </Button>
        <Button
          style={authenticationStyles.button}
          onPress={handleSubmit}
          loading={loading}
        >
          Confirm
        </Button>
      </View>
      <WhiteSpace height={15} />
      <Button
        type={"outline"}
        onPress={() => {
          navigation.navigate(Routes.Home as never);
        }}
      >
        Go to Home (View SMS Code)
      </Button>
    </Screen>
  );
}
