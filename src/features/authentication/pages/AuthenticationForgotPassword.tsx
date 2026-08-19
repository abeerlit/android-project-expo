// React Imports
import React, { useState } from "react";
import { Dimensions, View } from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { useNavigation } from "@react-navigation/core";
import { toast } from "@backpackapp-io/react-native-toast";
import { requestPasswordReset } from "shared/api/users/methods.ts";
import { Logger } from "shared/utils/Logger.ts";

// Type Imports
import { Routes } from "core/navigation/types/types.ts";
import { AuthenticationEnums } from "features/authentication/enums/authentication.enums.ts";
import { authenticationStyles } from "features/authentication/styles/authentication.styles.ts";
import { ForgotPasswordNavigationProp } from "features/authentication/types/authentication.types.ts";

// Component Imports
import { Screen } from "shared/components/utils/Screen.tsx";
import Icon from "shared/components/Icon.tsx";
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { TextInput } from "shared/components/TextInput.tsx";
import { Button } from "shared/components/Button.tsx";
import { IconBackgroundHeader } from "shared/components/IconBackgroundHeader.tsx";

export function AuthenticationForgotPassword() {
  // Constants
  const logger = new Logger("ForgotPasswordScreen");
  const { width } = Dimensions.get("window");

  // Hooks
  const theme = useTheme();
  const navigation = useNavigation<ForgotPasswordNavigationProp>();

  // Local State
  const [email, setEmail] = useState<string>("");

  // Methods
  const onSubmit = async () => {
    if (!email) {
      toast.error("Email is required");
      return;
    }

    try {
      await requestPasswordReset({ email });
      navigation.navigate(Routes.ForgotPasswordConfirmation, {
        email
      });
    } catch (error) {
      toast.error("Error resetting password");
      logger.error("Reset Password Error: ", error);
    }
  };

  return (
    <Screen paddingHorizontal>
      <View>
        <IconBackgroundHeader
          icon={"key-01"}
          bg={"box"}
          mainHeader={"Forgot password?"}
          secondHeader={"No worries, we'll send you reset instructions"}
          iconWidth={width}
          iconHeight={350}
          backgroundStyle={[
            authenticationStyles.backgroundIconContainer,
            { right: 0 }
          ]}
        />

        <WhiteSpace height={30} />

        <Text size={14} weight={"regular"} align={"left"}>
          {AuthenticationEnums.EMAIL}
        </Text>

        <WhiteSpace height={5} />

        <TextInput
          accessibilityLabel="Text input field"
          placeholder={AuthenticationEnums.EMAIL_PLACEHOLDER}
          placeholderTextColor={theme.colors.lightGrey}
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="done"
          returnKeyLabel="Login"
          enablesReturnKeyAutomatically={true}
        />

        <WhiteSpace height={20} />

        <Button onPress={onSubmit}>{AuthenticationEnums.RESET_PASSWORD}</Button>

        <WhiteSpace height={20} />

        <Button
          iconSpacing={5}
          type={"text"}
          icon={<Icon name={"arrow-left"} size={16} />}
          onPress={() => navigation.goBack()}
        >
          Back to login
        </Button>
      </View>
    </Screen>
  );
}
