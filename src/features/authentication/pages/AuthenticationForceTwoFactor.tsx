// React Imports
import React from "react";
import { useParams } from "hooks/use-params.ts";
import { useNavigation } from "@react-navigation/core";
import { authenticationStyles } from "features/authentication/styles/authentication.styles.ts";

// Type Imports
import { MFAMode } from "shared/api/authentication/types.ts";
import { UnauthenticatedParams } from "core/navigation/navigators/UnauthenticatedStack.tsx";
import { ForceTwoFactorNavigationProp } from "features/authentication/types/authentication.types.ts";

// Component Imports
import Icon from "shared/components/Icon.tsx";
import { Text } from "shared/components/Text.tsx";
import { Logger } from "shared/utils/Logger.ts";
import { Routes } from "core/navigation/types/types.ts";
import { Button } from "shared/components/Button.tsx";
import { Dimensions, View } from "react-native";
import { Screen } from "shared/components/utils/Screen.tsx";
import { setupMFA } from "shared/api/authentication/methods.ts";
import { toast } from "@backpackapp-io/react-native-toast";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { IconBackgroundHeader } from "shared/components/IconBackgroundHeader.tsx";

export function AuthenticationForceTwoFactor() {
  // Constants
  const { width: iconWidth } = Dimensions.get("window");
  const logger = new Logger("ForceTwoFactor: ");

  // Navigation Params
  const params = useParams<UnauthenticatedParams[Routes.ForceTwoFactor]>();

  // Hooks
  const navigation = useNavigation<ForceTwoFactorNavigationProp>();

  // Methods
  const handleEmailTwoFactor = async () => {
    logger.debug("params: ", params);
    try {
      const response = await setupMFA({
        token: params.token,
        mode: "email"
      });

      logger.debug("response: ", response);

      const { mfaVerifyToken, secret, qrcode } = response;

      navigation.navigate(Routes.TwoFactorVerify, {
        token: String(mfaVerifyToken),
        mode: "email",
        email: String(params?.email),
        secret,
        qrcode,
        setup: true
      });
    } catch (e) {
      logger.debug("Error with setting up email: ", e);
      toast.error("Error with setting up email");
    }
  };

  const twoFactorSetup = (mode: MFAMode) => {
    logger.debug("params: ", params);
    navigation.navigate(Routes.TwoFactorSetup, {
      token: String(params.token),
      mode: mode,
      email: String(params.email)
    });
  };

  return (
    <Screen paddingHorizontal avoidKeyboard>
      <IconBackgroundHeader
        icon={"message-text-square-01"}
        bg={"box"}
        mainHeader={"Setup two-factor authentication"}
        secondHeader={
          <Text size={15}>
            Your organization requires you to setup a two factor authentication
            method, please select one from below
          </Text>
        }
        iconWidth={iconWidth}
        iconHeight={350}
        backgroundStyle={[
          authenticationStyles.twoFactorBackgroundIconContainer,
          { right: 0 }
        ]}
      />
      <WhiteSpace height={15} />
      <Button
        type={"outline"}
        style={[authenticationStyles.twoFaCard]}
        onPress={handleEmailTwoFactor}
      >
        <View style={authenticationStyles.cardIconContainer}>
          <Icon name={"mail-03"} />
          <WhiteSpace width={5} />
          <Text>Email</Text>
        </View>
        <Icon name={"chevron-right"} />
      </Button>
      <WhiteSpace height={15} />
      <Button
        type={"outline"}
        style={[authenticationStyles.twoFaCard]}
        onPress={() => twoFactorSetup("sms")}
      >
        <View style={authenticationStyles.cardIconContainer}>
          <Icon name={"message-text-square-01"} />
          <WhiteSpace width={5} />
          <Text>SMS</Text>
        </View>
        <Icon name={"chevron-right"} />
      </Button>
      <WhiteSpace height={15} />
      <Button
        style={[authenticationStyles.twoFaCard]}
        type={"outline"}
        onPress={() => twoFactorSetup("app")}
      >
        <View style={authenticationStyles.cardIconContainer}>
          <Icon name={"lock-01"} />
          <WhiteSpace width={5} />
          <Text>Authenticator App</Text>
        </View>
        <Icon name={"chevron-right"} />
      </Button>
    </Screen>
  );
}
