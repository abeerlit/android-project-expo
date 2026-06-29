// React Imports
import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  TextStyle,
  ActivityIndicator,
  Alert,
  Platform
} from "react-native";

// Hooks
import { useTheme } from "hooks/use-theme.ts";
import { navigate } from "core/navigation/utils/Ref.ts"; // Use the global navigation function
import { useSelector, useDispatch } from "react-redux";

// Redux
import { updateUser } from "store/users/actions.ts";
import { LOG_OUT } from "store/authentication/actions.ts";

// Components
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";
import Icon from "shared/components/Icon.tsx";
import { Button } from "shared/components/Button.tsx";
import { resetPassword } from "shared/api/users/methods.ts";
import { toast } from "@backpackapp-io/react-native-toast";
import { Logger } from "shared/utils/Logger.ts";
import { State } from "store/types.ts";
import { Dropdown } from "shared/components/Dropdown.tsx";
import { MFAMode } from "shared/api/authentication/types.ts";
import { Routes } from "core/navigation/types/types.ts";
import {
  disableMFA,
  disableMFAMode,
  enableMFA
} from "shared/api/authentication/methods.ts";
import { TextInput } from "shared/components/TextInput.tsx";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { useNotifications } from "hooks/use-notifications.ts";

export const SecurityPage: React.FC = () => {
  // Constants
  const logger = new Logger("SecurityPage: ");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const options = [
    { label: "Email", value: "email" },
    { label: "SMS/Text Message", value: "sms" },
    { label: "Authenticator App", value: "app" }
  ];

  // Hooks
  const theme = useTheme();
  const dispatch = useDispatch();
  const accessToken = useSelector(
    ({ authReducer }: State) => authReducer.accessToken
  );
  const { isLoggedIn } = useSelector(({ authReducer }: State) => authReducer);
  const user = useSelector(({ userReducer }: State) => userReducer.user);
  useEffect(() => {
    if (isLoggingOut && !isLoggedIn) {
      setIsLoggingOut(false);
    }
  }, [isLoggingOut, isLoggedIn]);
  const savedMfaState = useSelector(
    ({ authReducer }: State) => authReducer.mfaSetupState
  );

  // State
  const [password, setPassword] = useState("");
  const [preferredMethod, setPreferredMethod] = useState<MFAMode | undefined>(
    undefined
  );
  const [appVerified, setAppVerified] = useState<number>(0);
  const [smsVerified, setSmsVerified] = useState<number>(0);

  const { sendbirdInstance } = useSendbirdContext();
  const { tokens } = useNotifications();

  // Set initial state from user data
  useEffect(() => {
    if (user) {
      setPreferredMethod(user.mfaMode);
      setAppVerified(user.mfaAppVerified || 0);
      setSmsVerified(user.mfaSmsVerified || 0);
    }
  }, [user]);

  // Methods
  const filterOptions = () => {
    return options.filter((option) => {
      if (option.value === "sms" && !smsVerified) return false;
      if (option.value === "app" && !appVerified) return false;
      return true;
    });
  };

  const handleSave = async () => {
    try {
      if (password.length >= 8) {
        await resetPassword(password, accessToken);
        setPassword("");
      } else if (password.length > 0) {
        toast.error("Password should be at least 8 characters");
      }

      if (user?.mfaMode !== preferredMethod && preferredMethod) {
        await enableMFA({ mode: preferredMethod }, accessToken);

        // Update store after successful API call
        dispatch(
          updateUser({
            mfaMode: preferredMethod,
            mfaEnabled: 1
          })
        );
      }
      toast.success("Changes saved successfully");
    } catch (e: any) {
      logger.error(e.message);
      toast.error("Error saving changes");
    }
  };

  const handleAddAuthenticator = () => {
    navigate(Routes.TwoFactorSetup, {
      token: accessToken,
      mode: "app" as MFAMode
    });
  };

  const handleEditSMS = () => {
    if (savedMfaState?.token && savedMfaState?.mode === "sms") {
      navigate(Routes.TwoFactorVerify, {
        token: savedMfaState.token,
        mode: savedMfaState.mode,
        phoneNumber: savedMfaState.phoneNumber,
        setup: savedMfaState.setup
      });
      return;
    }

    navigate(Routes.TwoFactorSetup, {
      token: accessToken,
      mode: "sms" as MFAMode,
      phoneNumber: user?.mfaPhoneNumber || ""
    });
  };

  const handleDisableMFA = async () => {
    try {
      if (!preferredMethod) return;

      await disableMFA(accessToken);
      setPreferredMethod(undefined);

      // Update store after successful API call
      dispatch(
        updateUser({
          mfaMode: undefined,
          mfaEnabled: 0,
          mfaAppVerified: 0,
          mfaSmsVerified: 0
        })
      );

      toast.success("MFA Disabled");
    } catch (e: any) {
      logger.error(e.message);
    }
  };

  const _handleDisableMFAMode = async (mode: MFAMode) => {
    try {
      await disableMFAMode({ mode }, accessToken);

      // Update local state
      if (mode === "sms") {
        setSmsVerified(0);
      } else if (mode === "app") {
        setAppVerified(0);
      }

      // Update store when disabling specific MFA mode
      if (mode === "sms") {
        dispatch(updateUser({ mfaSmsVerified: 0 }));
      } else if (mode === "app") {
        dispatch(updateUser({ mfaAppVerified: 0 }));
      }

      toast.success("MFA Mode Disabled");
    } catch (e: any) {
      logger.error(e.message);
    }
  };

  // Handle delete mfa method.
  const handleDeleteMFAMethod = (mode: MFAMode) => {
    setPreferredMethod(mode);

    const methodName = mode === "app" ? "Authenticator App" : "SMS";
    Alert.alert(
      "Disable 2FA",
      `Are you sure you want to disable ${methodName}? This will disable two-factor authentication.`,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => setPreferredMethod(user?.mfaMode)
        },
        {
          text: "Continue",
          style: "destructive",
          onPress: async () => {
            try {
              await disableMFA(accessToken);
              setPreferredMethod(undefined);
              dispatch(
                updateUser({
                  mfaMode: undefined,
                  mfaEnabled: 0,
                  mfaAppVerified: 0,
                  mfaSmsVerified: 0
                })
              );
              toast.success("MFA Disabled");
            } catch (e: any) {
              logger.error(e.message);
            }
          }
        }
      ]
    );
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    // Unregister all push tokens on Sendbird before LOG_OUT (platform-specific APIs).
    if (sendbirdInstance) {
      try {
        for (const tokenInfo of tokens) {
          try {
            if (
              tokenInfo.tokenType === "ios_remote_notifications" ||
              tokenInfo.tokenType === "ios_voip"
            ) {
              await sendbirdInstance.unregisterAPNSPushTokenForCurrentUser(
                tokenInfo.token
              );
              logger.debug(
                "✅ Unregistered iOS push token:",
                tokenInfo.tokenType
              );
            } else if (
              Platform.OS === "android" &&
              tokenInfo.tokenType === "android_fcm"
            ) {
              await sendbirdInstance.unregisterFCMPushTokenForCurrentUser(
                tokenInfo.token
              );
              logger.debug("✅ Unregistered Android FCM push token");
            }
          } catch (error) {
            logger.error("⚠️ Error unregistering push token:", error);
          }
        }
      } catch (error) {
        logger.debug("⚠️ Error during token cleanup:", error);
      }
    }

    // ✅ CRITICAL: Capture accessToken BEFORE dispatching LOG_OUT
    // The reducer clears it immediately, so we pass it in the action payload
    const tokenToDelete = accessToken;

    requestAnimationFrame(() => {
      setTimeout(() => {
        dispatch({ type: LOG_OUT, payload: { accessToken: tokenToDelete } });
      }, 100);
    });
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView
        style={[
          styles.container,
          {
            backgroundColor: theme.colors["color-colors-background-bg-primary"]
          }
        ]}
        contentContainerStyle={{ paddingBottom: padding["4xl"] * 2 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Password Reset Section */}
        <Text
          weight="semiBold"
          size={fontSize.md}
          color="colors-text-text-secondary"
          align="left"
          style={styles.sectionTitle}
        >
          Password reset
        </Text>

        <Text
          weight="medium"
          size={fontSize.sm}
          color="color-colors-text-text-secondary"
          align="left"
          style={styles.fieldLabel}
        >
          Password
        </Text>

        <TextInput
          style={[
            styles.input,
            {
              borderColor: theme.colors["colors-border-border-primary"],
              color: theme.colors["color-colors-text-text-primary"],
              alignItems: "center",
              backgroundColor:
                theme.colors["color-colors-background-bg-primary"]
            }
          ]}
          value={password}
          placeholder="**********"
          onChangeText={(text) => {
            setPassword(text);
          }}
          secureTextEntry={true}
          placeholderColor={"colors-text-text-placeholder"}
        />

        <Text
          size={fontSize.xs}
          color="color-colors-text-text-secondary"
          align="left"
          style={styles.helperText}
        >
          Must be at least 8 characters
        </Text>

        <WhiteSpace
          style={{
            borderStyle: "solid",
            borderWidth: 0.5,
            borderColor: theme.colors["color-colors-border-border-secondary"],
            marginVertical: padding["xl"]
          }}
        />

        {/* Multi-factor Authentication Section */}
        <View style={styles.mfaHeader}>
          <Text
            weight="semiBold"
            size={fontSize.md}
            color="colors-text-text-secondary"
            align="left"
          >
            Multi-factor authentication
          </Text>
          {preferredMethod && (
            <Button
              style={{ flex: 0, paddingHorizontal: padding.lg }}
              textStyle={
                {
                  fontWeight: "600",
                  fontSize: fontSize.sm
                } as TextStyle
              }
              onPress={handleDisableMFA}
            >
              Disable
            </Button>
          )}
        </View>

        <Text
          weight="medium"
          size={fontSize.sm}
          color="color-colors-text-text-secondary"
          align="left"
          style={styles.fieldLabel}
        >
          Preferred 2FA method
        </Text>

        {/* Dropdown Selector */}
        <Dropdown
          options={filterOptions()}
          value={preferredMethod}
          onChange={async (value) => {
            try {
              const mfaMode = value as MFAMode;
              await enableMFA({ mode: mfaMode }, accessToken);
              setPreferredMethod(mfaMode);

              // Update store after successful API call
              dispatch(
                updateUser({
                  mfaMode: mfaMode,
                  mfaEnabled: 1
                })
              );
            } catch (error) {
              logger.error("Error changing mode", error);
              toast.error("Error changing two-factor method");
            }
          }}
          placeholder="Select 2FA method"
        />

        {/* Two-factor Methods Section */}
        <View
          style={[
            styles.twoFactorContainer,
            { borderColor: theme.colors["colors-border-border-primary"] }
          ]}
        >
          <View style={[styles.twoFactorContainerHeader, {}]}>
            <Text
              weight="medium"
              size={fontSize.xs}
              color="color-colors-text-text-secondary"
              align="left"
              style={styles.subSectionTitle}
            >
              Two-factor methods
            </Text>
          </View>

          <WhiteSpace
            height={1}
            style={{
              backgroundColor: theme.colors["colors-border-border-primary"]
            }}
          />

          {/* Authenticator App Option */}
          <View
            style={[
              styles.methodItem,
              {
                backgroundColor:
                  theme.colors["color-colors-background-bg-primary"]
              }
            ]}
          >
            <View style={styles.methodIconTextContainer}>
              <Icon
                name="phone-02"
                size={24}
                style={{
                  color: theme.colors["color-colors-text-text-secondary"]
                }}
              />
              <View style={styles.methodTextContainer}>
                <Text
                  weight="semiBold"
                  size={fontSize.xs}
                  color="primary"
                  align="left"
                >
                  Authenticator app
                </Text>
                <Text
                  weight="regular"
                  size={fontSize.xs}
                  color="color-colors-text-text-secondary"
                  align="left"
                >
                  Use an authentication app
                </Text>
              </View>
            </View>
            {appVerified ? (
              <View
                style={{
                  display: "flex",
                  flexDirection: "row",
                  gap: padding["md"]
                }}
              >
                <TouchableOpacity
                  onPress={handleAddAuthenticator}
                  style={{
                    padding: padding.sm,
                    borderWidth: 1,
                    borderColor: theme.colors["colors-border-border-primary"],
                    backgroundColor:
                      theme.colors["color-colors-background-bg-primary"],
                    borderRadius: borderRadius.xs
                  }}
                >
                  <Icon name={"edit-05"} size={fontSize.lg} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteMFAMethod("app")}
                  style={{
                    padding: padding.sm,
                    borderWidth: 1,
                    borderColor: theme.colors["colors-border-border-primary"],
                    backgroundColor:
                      theme.colors["color-colors-background-bg-primary"],
                    borderRadius: borderRadius.xs
                  }}
                >
                  <Icon name={"trash-01"} size={fontSize.lg} color="#D92D20" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  styles.button,
                  {
                    borderColor: theme.colors["colors-border-border-primary"],
                    backgroundColor:
                      theme.colors["color-colors-background-bg-primary"]
                  }
                ]}
                onPress={handleAddAuthenticator}
              >
                <Text
                  weight="semiBold"
                  size={fontSize.sm}
                  color="primary"
                  align="center"
                >
                  Add
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <WhiteSpace
            height={1}
            style={{
              backgroundColor: theme.colors["colors-border-border-primary"]
            }}
          />

          {/* SMS Option */}
          <View
            style={[
              styles.methodItem,
              {
                backgroundColor:
                  theme.colors["color-colors-background-bg-primary"]
              }
            ]}
          >
            <View style={styles.methodIconTextContainer}>
              <Icon
                name="message-text-square-01"
                size={24}
                style={{
                  color: theme.colors["color-colors-text-text-secondary"]
                }}
              />
              <View style={styles.methodTextContainer}>
                <Text
                  weight="semiBold"
                  size={fontSize.xs}
                  color="primary"
                  align="left"
                >
                  SMS/Text message
                </Text>
                <Text
                  weight="regular"
                  size={fontSize.xs}
                  color="color-colors-text-text-secondary"
                  align="left"
                >
                  Receive one-time codes via SMS
                </Text>
              </View>
            </View>
            {smsVerified ? (
              <View
                style={{
                  display: "flex",
                  flexDirection: "row",
                  gap: padding["md"]
                }}
              >
                <TouchableOpacity
                  onPress={handleEditSMS}
                  style={{
                    padding: padding.sm,
                    borderWidth: 1,
                    borderColor: theme.colors["colors-border-border-primary"],
                    backgroundColor:
                      theme.colors["color-colors-background-bg-primary"],
                    borderRadius: borderRadius.xs
                  }}
                >
                  <Icon name={"edit-05"} size={fontSize.lg} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteMFAMethod("sms")}
                  style={{
                    padding: padding.sm,
                    borderWidth: 1,
                    borderColor: theme.colors["colors-border-border-primary"],
                    backgroundColor:
                      theme.colors["color-colors-background-bg-primary"],
                    borderRadius: borderRadius.xs
                  }}
                >
                  <Icon name={"trash-01"} size={fontSize.lg} color="#D92D20" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  styles.button,
                  {
                    borderColor: theme.colors["colors-border-border-primary"],
                    backgroundColor:
                      theme.colors["color-colors-background-bg-primary"]
                  }
                ]}
                onPress={handleEditSMS}
              >
                <Text
                  weight="semiBold"
                  size={fontSize.sm}
                  color="primary"
                  align="center"
                >
                  Add
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={styles.buttonContainer}>
          <Button
            disabled={password.length < 8 && user?.mfaMode === preferredMethod}
            onPress={handleSave}
          >
            Save Changes
          </Button>
          <WhiteSpace height={padding.xl} />
          <TouchableOpacity
            onPress={isLoggingOut ? undefined : handleLogout}
            activeOpacity={0.8}
            style={{
              borderRadius: 8,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 20,
              paddingVertical: 10,
              backgroundColor: "#000000",
              minHeight: 44,
              opacity: 1
            }}
          >
            {isLoggingOut ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text
                color="color-component-colors-components-buttons-primary-button-primary-fg"
                size={16}
                weight="regular"
                align="center"
              >
                Logout
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: padding["4xl"],
    paddingVertical: padding.lg
  },
  sectionTitle: {
    marginBottom: padding.xl,
    width: "100%"
  },
  fieldLabel: {
    marginBottom: 8
  },
  input: {
    fontSize: fontSize.md,
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 8
  },
  helperText: {
    marginBottom: padding.md
  },
  mfaHeader: {
    marginBottom: padding.xl,
    width: "100%",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  dropdown: {
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  twoFactorContainer: {
    borderWidth: 1,
    borderRadius: 8,
    marginTop: padding.xl,
    overflow: "hidden"
  },
  twoFactorContainerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: padding.lg
  },
  subSectionTitle: {
    padding: padding.md
  },
  methodItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: padding.md
  },
  methodIconTextContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: padding.md,
    padding: padding.md
  },
  methodTextContainer: {
    flex: 1
  },
  button: {
    paddingHorizontal: padding.lg,
    paddingVertical: padding.sm,
    borderRadius: 6,
    borderWidth: 1
  },
  buttonContainer: {
    marginTop: padding["3xl"]
  }
});

export default SecurityPage;
