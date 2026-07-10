// React Imports
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Switch,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView
} from "react-native";
import { useSelector, useDispatch } from "react-redux";

// Hooks
import { useTheme } from "hooks/use-theme.ts";

// Redux
import { updateUser } from "store/users/actions.ts";

// API
import {
  getForwardingSettings,
  setExtensionForwarding
} from "shared/api/user-settings/methods.ts";
import { toggleUserDND } from "shared/api/users/methods.ts";
import { handleApiError } from "shared/api/utils/api-error-wrapper.ts";
import { toast } from "@backpackapp-io/react-native-toast";

// Components
import { Text } from "shared/components/Text.tsx";
import { componentSize, fontSize, padding } from "core/theme/theme.ts";
import { AdvancedCheckbox } from "react-native-advanced-checkbox";
import { Logger } from "shared/utils/Logger.ts";
import { State } from "store/types.ts";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { phoneNumberFormatter } from "shared/utils/utils.ts";
import { Button } from "shared/components/Button.tsx";
import { TextInput } from "shared/components/TextInput.tsx";
import { isDndEnabled } from "shared/utils/user-dnd.ts";

export const CallsPage: React.FC = () => {
  // Constants
  const logger = new Logger("CallsPage: ");

  // Refs
  const scrollViewRef = useRef<ScrollView>(null);

  // Hooks
  const theme = useTheme();
  const dispatch = useDispatch();
  const accessToken = useSelector(
    ({ authReducer }: State) => authReducer.accessToken
  );
  const user = useSelector(({ userReducer }: State) => userReducer.user);

  // State for call settings (sync when Redux user.dnd updates from server / Home extDND)
  const [ignoreAllCalls, setIgnoreAllCalls] = useState(() =>
    isDndEnabled(user?.dnd)
  );
  const [forwardCalls, setForwardCalls] = useState(false);
  const [forwardingNumber, setForwardingNumber] = useState("");
  const [voicemailPin, setVoicemailPin] = useState(
    user?.voicemailSettings.password
  );
  const [voicemailEmail, setVoicemailEmail] = useState(
    user?.voicemailSettings.email
  );
  const [isSaving, setIsSaving] = useState(false);

  // State to track original server values
  const [originalForwarding, setOriginalForwarding] = useState(false);
  const [originalNumber, setOriginalNumber] = useState("");

  useEffect(() => {
    setIgnoreAllCalls(isDndEnabled(user?.dnd));
  }, [user?.dnd]);

  // Load initial settings
  useEffect(() => {
    if (!accessToken || !user) {
      return;
    }
    const fetchSettings = async () => {
      try {
        // Fetch forwarding settings
        const settings = await getForwardingSettings(accessToken);
        setForwardCalls(settings.forwarding);
        setOriginalForwarding(settings.forwarding);

        if (settings.number) {
          setForwardingNumber(settings.number);
          setOriginalNumber(settings.number);
        }
      } catch (error) {
        const apiError = error as any;
        if (apiError?.code !== 401) {
          handleApiError(apiError);
          logger.error("Failed to fetch initial settings", error);
        }
      }
    };

    void fetchSettings();
  }, [accessToken, user]);

  // Check if there are unsaved changes
  const hasChanges = () => {
    return (
      originalForwarding !== forwardCalls ||
      (forwardCalls && originalNumber !== forwardingNumber)
    );
  };

  // Handle DND toggle (Ignore all calls)
  const handleDndToggle = async (value: boolean) => {
    try {
      setIgnoreAllCalls(value);
      await toggleUserDND(value, accessToken);

      // Update store after a successful API call
      dispatch(
        updateUser({
          dnd: value ? "1" : "0"
        })
      );
    } catch (error) {
      // Revert UI change on error
      setIgnoreAllCalls(!value);
      handleApiError(error as any);
      logger.error("Could not ignore calls", error);
    }
  };

  // Handle forwarding toggle
  const handleForwardingToggle = (checked: boolean) => {
    setForwardCalls(checked);
  };

  // Handle number change
  const handleNumberChange = (text: string) => {
    // Only allow numbers
    setForwardingNumber(text);
  };

  // Save changes for forwarding settings
  const saveForwardingChanges = async () => {
    if (forwardCalls && !forwardingNumber) {
      toast.error("Please enter a forwarding number");
      return;
    }

    setIsSaving(true);
    try {
      await setExtensionForwarding(forwardCalls, forwardingNumber, accessToken);
      setOriginalForwarding(forwardCalls);
      setOriginalNumber(forwardingNumber);
      toast.success("Changes saved");
    } catch (error) {
      handleApiError(error as any);
      logger.error("Failed to update changes", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Focus handler for the email field to ensure it's visible
  const handleEmailFocus = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{
        flex: 1,
        backgroundColor: theme.colors["color-colors-background-bg-primary"]
      }}
      keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: 250
        }}
        showsVerticalScrollIndicator={true}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View
            style={[
              styles.container,
              {
                gap: padding["xl"]
              }
            ]}
          >
            {/* Incoming Calls Section */}
            <View>
              <Text
                weight="semiBold"
                size={fontSize.md}
                color="colors-text-text-secondary"
                align="left"
                style={styles.sectionTitle}
              >
                Incoming Calls
              </Text>

              <View style={styles.toggleRow}>
                <Text
                  weight="medium"
                  size={fontSize.sm}
                  color="primary"
                  align="left"
                >
                  Ignore all calls
                </Text>
                <Switch
                  trackColor={{
                    false: theme.colors["color-colors-border-border-disabled-subtle"],
                    true: theme.colors["colors-background-bg-brand-solid"]
                  }}
                  value={ignoreAllCalls}
                  onValueChange={handleDndToggle}
                />
              </View>
            </View>

            <WhiteSpace
              style={{
                borderStyle: "solid",
                borderWidth: 0.5,
                borderColor:
                  theme.colors["color-colors-border-border-secondary"]
              }}
            />

            {/* Call Forwarding Section */}
            <View>
              <Text
                weight="semiBold"
                size={fontSize.md}
                color="colors-text-text-secondary"
                align="left"
                style={styles.sectionTitle}
              >
                Call Forwarding
              </Text>

              <View style={styles.checkboxContainer}>
                <AdvancedCheckbox
                  value={forwardCalls}
                  onValueChange={(value: boolean | string) =>
                    handleForwardingToggle(
                      typeof value === "boolean" ? value : false
                    )
                  }
                  size={componentSize.lg}
                  containerStyle={styles.checkbox}
                  checkedColor={
                    theme.colors["colors-background-bg-brand-solid"]
                  }
                  uncheckedColor={
                    theme.colors["colors-background-bg-brand-solid"]
                  }
                  animationType="fade"
                />
                <View style={styles.checkboxTextContainer}>
                  <Text
                    weight="medium"
                    size={fontSize.sm}
                    color="primary"
                    align="left"
                    style={styles.checkboxLabel}
                  >
                    Forward all calls
                  </Text>
                  <Text
                    weight="regular"
                    size={fontSize.sm}
                    color="color-colors-text-text-secondary"
                    align="left"
                  >
                    All incoming calls will be forwarded to the number below
                  </Text>
                </View>
              </View>

              {forwardCalls && (
                <TextInput
                  style={[
                    styles.input,
                    {
                      borderColor: theme.colors["colors-border-border-primary"],
                      color: theme.colors["color-colors-text-text-primary"],
                      backgroundColor:
                        theme.colors["color-colors-background-bg-primary"]
                    }
                  ]}
                  value={phoneNumberFormatter(forwardingNumber)}
                  onChangeText={handleNumberChange}
                  placeholder="Enter phone number"
                  placeholderColor={"colors-text-text-placeholder"}
                  keyboardType="phone-pad"
                />
              )}
            </View>

            <WhiteSpace
              style={{
                borderStyle: "solid",
                borderWidth: 0.5,
                borderColor:
                  theme.colors["color-colors-border-border-secondary"]
              }}
            />

            {/* Voicemail Section */}
            <View style={{ gap: padding.md }}>
              <Text
                weight="semiBold"
                size={fontSize.md}
                color="colors-text-text-secondary"
                align="left"
                style={styles.sectionTitle}
              >
                Voicemail
              </Text>

              <View>
                <Text
                  weight="medium"
                  size={fontSize.sm}
                  color="color-colors-text-text-secondary"
                  align="left"
                  style={styles.fieldLabel}
                >
                  PIN
                </Text>

                <TextInput
                  secureTextEntry={true}
                  textContentType={"password"}
                  autoComplete="password"
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
                  inputMode="numeric"
                  value={voicemailPin}
                  onChangeText={setVoicemailPin}
                  placeholder="***********"
                  placeholderColor={"colors-text-text-placeholder"}
                />
              </View>

              <View>
                <Text
                  weight="medium"
                  size={fontSize.sm}
                  color="color-colors-text-text-secondary"
                  align="left"
                  style={styles.fieldLabel}
                >
                  Email
                </Text>

                <TextInput
                  style={[
                    styles.input,
                    {
                      borderColor: theme.colors["colors-border-border-primary"],
                      color: theme.colors["color-colors-text-text-primary"],
                      backgroundColor:
                        theme.colors["color-colors-background-bg-primary"]
                    }
                  ]}
                  value={voicemailEmail}
                  onChangeText={setVoicemailEmail}
                  placeholder="user@voxo.co"
                  placeholderColor={"colors-text-text-placeholder"}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={handleEmailFocus}
                />
              </View>
            </View>
            <View style={styles.buttonContainer}>
              <Button
                disabled={!hasChanges()}
                loading={isSaving}
                onPress={saveForwardingChanges}
              >
                Save Changes
              </Button>
            </View>

            {/* Added this to prevent the keyboard from covering the screen */}
            <WhiteSpace height={padding["4xl"]} />
          </View>
        </TouchableWithoutFeedback>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    flex: 1,
    paddingHorizontal: padding["4xl"],
    paddingVertical: padding.lg,
    flexDirection: "column"
  },
  sectionTitle: {
    marginBottom: padding.md,
    width: "100%"
  },
  toggleRow: {
    flexDirection: "row",
    gap: padding.lg,
    alignItems: "center"
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: padding.md,
    gap: padding.md
  },
  checkbox: {
    marginTop: 2
  },
  checkboxTextContainer: {
    flex: 1
  },
  checkboxLabel: {
    marginBottom: 2
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16
  },
  fieldLabel: {
    marginBottom: 8
  },
  buttonContainer: {
    marginTop: padding.lg
  }
});

export default CallsPage;
