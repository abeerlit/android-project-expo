// React Imports
import React from "react";
import { Dimensions } from "react-native";
import { useParams } from "hooks/use-params.ts";
import { useNavigation } from "@react-navigation/core";
import { toast } from "@backpackapp-io/react-native-toast";
import { requestPasswordReset } from "shared/api/users/methods.ts";
import { openInbox } from "react-native-email-link";
import { Logger } from "shared/utils/Logger.ts";

// Type Imports
import { Routes } from "core/navigation/types/types.ts";
import { UnauthenticatedParams } from "core/navigation/navigators/UnauthenticatedStack.tsx";
import { authenticationStyles } from "features/authentication/styles/authentication.styles.ts";
import { ForgotPasswordConfirmationNavigationProp } from "features/authentication/types/authentication.types.ts";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { Screen } from "shared/components/utils/Screen.tsx";
import Icon from "shared/components/Icon.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { Button } from "shared/components/Button.tsx";
import { IconBackgroundHeader } from "shared/components/IconBackgroundHeader.tsx";

export function AuthenticationForgotPasswordConfirmation() {
  // Navigation Params
  const params =
    useParams<UnauthenticatedParams[Routes.ForgotPasswordConfirmation]>();
  const email = params?.email || "";

  // Constants
  const logger = new Logger("ForgotPasswordConfirmationScreen");
  const { width } = Dimensions.get("window");

  // Hooks
  const navigation = useNavigation<ForgotPasswordConfirmationNavigationProp>();

  // Methods
  const handleResend = async () => {
    if (!email) {
      toast.error("Error resending request");
      return;
    }
    try {
      await requestPasswordReset({ email });
      toast.success("Reset instructions sent successfully");
    } catch (error) {
      toast.error("Error resetting password");
      logger.error("Reset Password Error: ", error);
    }
  };

  return (
    <Screen paddingHorizontal>
      <IconBackgroundHeader
        icon={"mail-03"}
        bg={"box"}
        mainHeader={"Check your email"}
        secondHeader={
          <Text size={15}>
            We sent a password reset link to{" "}
            <Text weight={"regular"}>{email}</Text>
          </Text>
        }
        iconWidth={width}
        iconHeight={350}
        backgroundStyle={authenticationStyles.backgroundIconContainer}
      />
      <WhiteSpace height={30} />
      <Button
        onPress={async () => {
          try {
            await openInbox();
          } catch (error) {
            toast.error("Error opening email client");
            logger.error("Error opening email client: ", error);
          }
        }}
      >
        Open email app
      </Button>
      <WhiteSpace height={30} />
      <Text size={14}>
        Did not receive the email?{" "}
        <Text onPress={handleResend} color={"textButton"}>
          Click to resend
        </Text>
      </Text>
      <WhiteSpace height={30} />
      <Button
        iconSpacing={5}
        type={"text"}
        icon={<Icon name={"arrow-left"} size={16} />}
        onPress={() => navigation.navigate(Routes.Login)}
      >
        Back to login
      </Button>
    </Screen>
  );
}
