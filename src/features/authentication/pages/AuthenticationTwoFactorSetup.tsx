// React Imports
import { useDispatch, useSelector } from "react-redux";
import { Logger } from "shared/utils/Logger.ts";
import { useTheme } from "hooks/use-theme.ts";
import { useParams } from "hooks/use-params.ts";
import React, { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/core";
import { phoneNumberFormatter } from "shared/utils/utils.ts";
import { toast } from "@backpackapp-io/react-native-toast";
import { LOGIN_SUCCESS } from "store/authentication/actions.ts";
import { updateUser } from "store/users/actions.ts";
import {
  setupMFA,
  setupAuthMFA,
  verifyMFA,
  verifyMFAAuth
} from "shared/api/authentication/methods.ts";
import { authenticationStyles } from "features/authentication/styles/authentication.styles.ts";
import { State } from "store/types.ts";

// Type Imports
import { Routes } from "core/navigation/types/types.ts";
import { MFAMode, MFAVerifyBody } from "shared/api/authentication/types.ts";
import { UnauthenticatedParams } from "core/navigation/navigators/UnauthenticatedStack.tsx";
import { LoginScreenNavigationProp } from "features/authentication/types/authentication.types.ts";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { Button } from "shared/components/Button.tsx";
import { Screen } from "shared/components/utils/Screen.tsx";
import { TextInput } from "shared/components/TextInput.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { Dimensions, Image, Platform, TouchableOpacity, View } from "react-native";
import { IconBackgroundHeader } from "shared/components/IconBackgroundHeader.tsx";
import {
  CodeField,
  Cursor,
  useClearByFocusCell
} from "react-native-confirmation-code-field";
import { borderRadius, padding } from "core/theme/theme.ts";
import Icon from "shared/components/Icon.tsx";
import Clipboard from "@react-native-clipboard/clipboard";

export function AuthenticationTwoFactorSetup() {
  // Navigation Params
  const params = useParams<UnauthenticatedParams[Routes.TwoFactorSetup]>();
  const { token, mode } = params;

  // Constants
  const logger = new Logger("TwoFactorSetupScreen");
  const { width: iconWidth } = Dimensions.get("window");
  const dispatch = useDispatch();
  const secondHeader: { [key: string]: string } = {
    sms: "Get authentication codes by SMS on your mobile phone when signing in",
    email:
      "Get a one-time code sent to you via Email to complete authentication requests.",
    app: "Authenticator apps and browser extensions like 1Password, Authy, Microsoft Authenticator allow for scanning the below QR code to verify"
  };

  const icon: { [key: string]: string } = {
    sms: "message-text-square-01",
    email: "mail-03",
    app: "lock-01"
  };

  // Redux state
  const isAuthenticated = useSelector(
    (state: State) => state.userReducer.user !== null
  );
  const accessToken = useSelector(
    (state: State) => state.authReducer.accessToken
  );

  // Local State
  const [code, setCode] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [props, getCellOnLayoutHandler] = useClearByFocusCell({
    value: code,
    setValue: setCode
  });

  // Hooks
  const theme = useTheme();
  const navigation = useNavigation<LoginScreenNavigationProp>();

  // SMS State
  const [phoneNumber, setPhoneNumber] = useState<string>(
    params.phoneNumber || ""
  );
  const [qrcode, setQrCode] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [mfaVerifyToken, setMfaVerifyToken] = useState<string>("");

  // Methods
  const handleSMSSetup = async () => {
    if (!phoneNumber) {
      toast.error("Phone number is required");
      return;
    }
    try {
      let response;
      // Remove any formatting from phone number if present
      const formattedNumber = phoneNumber.replace(/\D/g, "");
      if (!formattedNumber) {
        toast.error("Invalid phone number");
        return;
      }
      console.log("formattedNumber", formattedNumber);

      // If already authenticated, use setupAuthMFA with access token
      if (isAuthenticated) {
        response = await setupAuthMFA(
          {
            mode: mode,
            phoneNumber: formattedNumber
          },
          accessToken
        );

        // Store the phone number in the local state for consistency
        setPhoneNumber(formattedNumber);
      } else {
        // Not authenticated, use setupMFA with token
        response = await setupMFA({
          token: token,
          mode: mode,
          phoneNumber: formattedNumber
        });
      }

      toast.success("Code sent successfully");
      navigation.navigate(Routes.TwoFactorVerify, {
        token: String(response?.mfaVerifyToken),
        mode: response?.mode as MFAMode,
        phoneNumber: String(response?.phoneNumber || formattedNumber),
        setup: true
      });
    } catch (e) {
      toast.error("Error sending OTP");
      logger.error("Error Sending SMS OTP: ", e, phoneNumber);
    }
  };

  const verifyAuthenticationApp = async (): Promise<void> => {
    if (isVerifying) return;
    setIsVerifying(true);

    try {
      const body: MFAVerifyBody = {
        mode,
        otp: code
      };

      if (body.mode === "app") {
        body.secret = secret;
      }

      // If mfaVerifyToken exists (from unauthenticated flow), include it
      if (mfaVerifyToken) {
        body.token = mfaVerifyToken;
      }

      logger.debug("MFA Verification Body: ", body);

      if (isAuthenticated) {
        // For authenticated users
        await verifyMFAAuth(body, accessToken);

        // Update Redux store with MFA app verification status
        dispatch(
          updateUser({
            mfaAppVerified: 1
            // Note: we don't set mfaMode here as that's a separate user preference
          })
        );

        toast.success("Two-factor authentication set up successfully");
        navigation.goBack();
      } else {
        // For unauthenticated users
        const response = await verifyMFA(body);
        logger.debug("MFA Verification Response: ", response);
        dispatch({
          type: LOGIN_SUCCESS,
          payload: response
        });
      }
    } catch (e) {
      toast.error("Error Verifying MFA");
      logger.error("Error Verifying MFA: ", e);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCopySecret = () => {
    try {
      Clipboard.setString(secret);
      toast.success("Secret copied to clipboard!");
    } catch (e) {
      logger.error("Error copying code", e);
      toast.error("Error copying secret to clipboard!");
    }
  };

  const renderSms = () => {
    return (
      <View>
        <WhiteSpace height={10} />
        <Text size={15} weight={"regular"} align={"left"}>
          Your phone number
        </Text>
        <WhiteSpace height={5} />
        <TextInput
          accessibilityLabel="Phone number"
          placeholder={"Enter your number"}
          placeholderColor={"lightGrey"}
          autoCapitalize="none"
          autoCorrect={false}
          value={phoneNumberFormatter(phoneNumber)}
          onChangeText={setPhoneNumber}
          textContentType="telephoneNumber"
          autoComplete="tel"
          returnKeyType="done"
          returnKeyLabel="Done"
          enablesReturnKeyAutomatically={true}
        />
        <WhiteSpace height={40} />
        <Button onPress={handleSMSSetup}>Send authentication code</Button>
      </View>
    );
  };

  const renderApp = () => {
    const screenPadding = padding.xl * 2;
    const cellCount = 6;
    const marginBetweenCells = Platform.OS === "android" ? 3 : 5;
    const totalMargins = marginBetweenCells * (cellCount - 1);
    const availableWidth = iconWidth - screenPadding - totalMargins;
    const calculatedCellWidth = Platform.OS === "android" 
      ? Math.max(45, Math.floor(availableWidth / cellCount))
      : 58;
    const calculatedCellHeight = Platform.OS === "android" ? 60 : 70;

    return (
      <View>
        <WhiteSpace height={20} />
        <View
          style={{
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.colors["colors-background-bg-secondary"],
            padding: 20,
            borderRadius: 8
          }}
        >
          <Image style={{ width: 150, height: 150 }} src={qrcode} />
        </View>
        <WhiteSpace height={padding["2xl"]} />
        <View
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            borderRadius: borderRadius.md,
            borderWidth: 1,
            padding: padding.lg,
            borderColor: theme.colors["color-colors-border-border-brand-solid"]
          }}
        >
          <View />
          <Text>{secret}</Text>
          <TouchableOpacity
            onPress={handleCopySecret}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ padding: 8 }}
          >
            <Icon name={"copy-01"} />
          </TouchableOpacity>
        </View>
        <WhiteSpace height={padding["2xl"]} />

        <Text size={15} weight={"regular"} align={"left"}>
          Verify the code from the app
        </Text>

        <WhiteSpace height={5} />

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
                  marginRight: index === cellCount - 1 ? 0 : marginBetweenCells,
                  lineHeight: calculatedCellHeight
                }
              ]}
              onLayout={getCellOnLayoutHandler(index)}
              size={Platform.OS === "android" ? 24 : 30}
              weight={"regular"}
            >
              {/*@ts-ignore*/}
              {symbol || (isFocused ? <Cursor /> : null)}
            </Text>
          )}
          cellCount={6}
          value={code}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          onChangeText={setCode}
          autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
          {...props}
        />
        <WhiteSpace height={30} />
        <View style={authenticationStyles.buttonContainer}>
          <Button
            type={"outline"}
            onPress={() => navigation.goBack()}
            style={authenticationStyles.button}
            disabled={isVerifying}
          >
            Cancel
          </Button>
          <Button
            style={authenticationStyles.button}
            onPress={verifyAuthenticationApp}
            loading={isVerifying}
            disabled={isVerifying}
          >
            Confirm
          </Button>
        </View>
      </View>
    );
  };

  const renderInput = () => {
    switch (mode) {
      case "sms":
        return renderSms();
      case "app":
        return renderApp();
      default:
        return <Text>Hello</Text>;
    }
  };

  useEffect(() => {
    const initializeAuthenticationApp = async () => {
      try {
        if (mode === "app") {
          let response;

          // If already authenticated, use setupAuthMFA with access token
          if (isAuthenticated) {
            response = await setupAuthMFA(
              {
                mode: "app"
              },
              accessToken
            );

            if (!response.secret || !response.qrcode) {
              toast.error("Error setting up MFA");
              return;
            }

            setSecret(response.secret);
            setQrCode(response.qrcode);
          } else {
            // Not authenticated, use setupMFA with token
            response = await setupMFA({
              token,
              mode: "app"
            });

            if (
              !response.secret ||
              !response.qrcode ||
              !response.mfaVerifyToken
            ) {
              toast.error("Error setting up MFA");
              return;
            }

            setSecret(response.secret);
            setQrCode(response.qrcode);
            setMfaVerifyToken(response.mfaVerifyToken);
          }
        }
      } catch (e: any) {
        logger.error(e.message);
      }
    };

    initializeAuthenticationApp();
  }, []);

  return (
    <Screen paddingHorizontal avoidKeyboard scroll>
      <IconBackgroundHeader
        icon={icon[mode]}
        bg={"circle"}
        mainHeader={mode === "app" && "Setup two-factor authentication"}
        secondHeader={<Text size={15}>{secondHeader[mode]}</Text>}
        iconWidth={iconWidth}
        iconHeight={385}
        backgroundStyle={[
          authenticationStyles.twoFactorBackgroundIconContainer,
          { left: -15 }
        ]}
      />
      <WhiteSpace height={20} />
      {renderInput()}
    </Screen>
  );
}
