import React, { useState, useMemo, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  Alert,
  TouchableOpacity,
  FlatList,
  Platform,
  TextInput
} from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { padding, borderRadius, fontSize } from "core/theme/theme.ts";
import { Button } from "shared/components/Button.tsx";
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { useSoftphone } from "core/softphone/useSoftphone.ts";
import Icon from "shared/components/Icon.tsx";
import { phoneNumberFormatter } from "shared/utils/utils.ts";
import { mmkvStorage } from "store/utils/storage.ts";
import { useSelector } from "react-redux";
import { State } from "store/types.ts";
import { Avatar } from "shared/components/Avatar.tsx";
import { findContactByPhoneNumber } from "../utils/contact-lookup.ts";
import { useNavigation } from "@react-navigation/native";

interface ContactPreviewItem {
  name: string;
  number: string;
  avatarPath?: string | null;
  type: "company" | "personal" | "phone";
}

interface KeypadButtonProps {
  digit: string;
  letters?: string;
  onPress: (digit: string) => void;
}

function KeypadButton({ digit, letters, onPress }: KeypadButtonProps) {
  const theme = useTheme();

  return (
    <Button
      onPress={() => onPress(digit)}
      containerStyle={[
        styles.keypadButton,
        {
          backgroundColor: theme.colors["colors-background-bg-secondary"],
          borderRadius: borderRadius.full
        }
      ]}
      size={70}
    >
      <View style={styles.buttonContent}>
        <Text
          color={"color-colors-text-text-tertiary"}
          size={30}
          lineHeight={38}
          weight="bold"
          align="center"
        >
          {digit}
        </Text>
        {letters && (
          <Text
            color="color-colors-text-text-tertiary"
            size={fontSize.xs}
            weight={"semiBold"}
            align="center"
          >
            {letters}
          </Text>
        )}
      </View>
    </Button>
  );
}

const LAST_DIALED_NUMBER_KEY = "lastDialedNumber";
const MAX_PREVIEW_RESULTS = 2;

export function DialerKeypad() {
  const theme = useTheme();
  const navigation = useNavigation();
  const inputRef = useRef<TextInput>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const { makeCall, isInitializing, isRegistering, activeCallId, hasOngoingCall } =
    useSoftphone();

  const {
    directory,
    personalContacts,
    companyContacts,
    phoneContacts
  } = useSelector((state: State) => state.directoryReducer);

  const matchingContacts = useMemo((): ContactPreviewItem[] => {
    if (!phoneNumber || phoneNumber.length < 2) return [];

    const searchTerm = phoneNumber.toLowerCase().replace(/\D/g, "");
    const results: ContactPreviewItem[] = [];
    const seenByNormalizedNumber = new Map<string, ContactPreviewItem>();

    const normalizeKey = (num: string) => {
      const clean = num?.replace(/\D/g, "") || "";
      return clean.length >= 10 ? clean.slice(-10) : clean;
    };

    const addOrReplace = (item: ContactPreviewItem) => {
      const key = normalizeKey(item.number);
      const existing = seenByNormalizedNumber.get(key);
      const hasAvatar = !!(item.avatarPath && item.avatarPath.trim());
      const existingHasAvatar = !!(existing?.avatarPath && existing.avatarPath.trim());
      // Prefer the one with avatar; skip duplicate without avatar
      if (!existing) {
        seenByNormalizedNumber.set(key, item);
        results.push(item);
      } else if (hasAvatar && !existingHasAvatar) {
        seenByNormalizedNumber.set(key, item);
        const idx = results.indexOf(existing);
        if (idx >= 0) results[idx] = item;
      }
    };

    // Search directory
    for (const contact of directory) {
      if (results.length >= MAX_PREVIEW_RESULTS) break;
      const contactNumber = contact.number?.replace(/\D/g, "") || "";
      if (
        contactNumber.includes(searchTerm) ||
        contact.name?.toLowerCase().includes(phoneNumber.toLowerCase())
      ) {
        addOrReplace({
          name: contact.name,
          number: contact.number,
          avatarPath: contact.avatarThumbnailPath || contact.avatarPath,
          type: "company"
        });
      }
    }

    // Search company contacts (separate from directory - may have different set)
    for (const contact of companyContacts) {
      if (results.length >= MAX_PREVIEW_RESULTS) break;
      const contactNumber = contact.number?.replace(/\D/g, "") || "";
      const directDials = contact.directDials?.map((d) => d.replace(/\D/g, "")) || [];
      const matchesNumber =
        contactNumber.includes(searchTerm) ||
        directDials.some((dd) => dd.includes(searchTerm));
      const matchesName = contact.name?.toLowerCase().includes(phoneNumber.toLowerCase());
      if (matchesNumber || matchesName) {
        addOrReplace({
          name: contact.name,
          number: contact.number,
          avatarPath: contact.avatarThumbnailPath || contact.avatarPath,
          type: "company"
        });
      }
    }

    // Search personal contacts
    for (const contact of personalContacts) {
      if (results.length >= MAX_PREVIEW_RESULTS) break;
      const contactNumber = contact.number?.replace(/\D/g, "") || "";
      if (
        contactNumber.includes(searchTerm) ||
        contact.name?.toLowerCase().includes(phoneNumber.toLowerCase())
      ) {
        addOrReplace({
          name: contact.name,
          number: contact.number,
          avatarPath: contact.avatarThumbnailPath || contact.avatarPath,
          type: "personal"
        });
      }
    }

    // Search phone contacts
    for (const contact of phoneContacts) {
      if (results.length >= MAX_PREVIEW_RESULTS) break;
      for (const phone of contact.phoneNumbers || []) {
        if (results.length >= MAX_PREVIEW_RESULTS) break;
        const contactNumber = phone.number?.replace(/\D/g, "") || "";
        if (
          contactNumber.includes(searchTerm) ||
          contact.displayName?.toLowerCase().includes(phoneNumber.toLowerCase())
        ) {
          addOrReplace({
            name: contact.displayName,
            number: phone.number,
            avatarPath: contact.thumbnailPath || null,
            type: "phone"
          });
        }
      }
    }

    return results;
  }, [
    phoneNumber,
    directory,
    companyContacts,
    personalContacts,
    phoneContacts,
    MAX_PREVIEW_RESULTS
  ]);

  const handleContactSelect = useCallback((contact: ContactPreviewItem) => {
    setPhoneNumber(contact.number.replace(/\D/g, ""));
  }, []);

  const handleKeypadPress = (digit: string) => {
    if (phoneNumber.length < 15) {
      setPhoneNumber((prev) => prev + digit);
    }
  };

  const handleBackspace = () => {
    setPhoneNumber((prev) => prev.slice(0, -1));
  };

  const handleCall = async () => {
    if (isInitializing || isRegistering) {
      Alert.alert("Please wait", "Softphone is still initializing...");
      return;
    }

    if (activeCallId === "testing") {
      Alert.alert(
        "Call in progress",
        "Please end the current call before making a new one."
      );
      return;
    }

    if (hasOngoingCall) {
      Alert.alert(
        "Call in progress",
        "Please end the current call before making a new one."
      );
      return;
    }

    const numberToCall = phoneNumber.trim();
    if (!numberToCall) {
      return;
    }

    try {

      const cleanToCall = numberToCall.replace(/\D/g, "");
      const previewContact = matchingContacts.find(
        (c) => c.number?.replace(/\D/g, "") === cleanToCall
      );
      const contactInfo =
        previewContact ||
        findContactByPhoneNumber(
          numberToCall,
          personalContacts,
          companyContacts,
          directory,
          phoneContacts
        );

      // Navigate immediately to show "Dialing..." shell (matches ios-project).
      // @ts-ignore
      navigation.navigate("InCallScreen" as never, {
        callId: "dialing",
        destination: numberToCall,
        ...(contactInfo?.name ? { displayName: contactInfo.name } : {}),
        ...(contactInfo?.avatarPath ? { avatarPath: contactInfo.avatarPath } : {})
      });

      const callOptions = {
        ...(contactInfo?.name && { displayName: contactInfo.name }),
        ...(contactInfo?.avatarPath && { avatarPath: contactInfo.avatarPath })
      };
      void makeCall(numberToCall, callOptions).catch((error: unknown) => {
        console.error("[DialerKeypad] makeCall failed:", error);
        const message =
          error instanceof Error ? error.message : "Unable to place the call.";
        Alert.alert("Call Failed", message, [{ text: "OK" }]);
        if (navigation.canGoBack()) {
          navigation.goBack();
        }
      });

      await mmkvStorage.setItem(LAST_DIALED_NUMBER_KEY, numberToCall);

      // Clear the input field
      setPhoneNumber("");
    } catch (error) {
      console.error("Failed to make call:", error);
      Alert.alert("Call Failed", "Unable to place the call. Please try again.");
    }
  };

  const keypadData = [
    [
      { digit: "1", letters: "" },
      { digit: "2", letters: "ABC" },
      { digit: "3", letters: "DEF" }
    ],
    [
      { digit: "4", letters: "GHI" },
      { digit: "5", letters: "JKL" },
      { digit: "6", letters: "MNO" }
    ],
    [
      { digit: "7", letters: "PQRS" },
      { digit: "8", letters: "TUV" },
      { digit: "9", letters: "WXYZ" }
    ],
    [
      { digit: "*", letters: "" },
      { digit: "0", letters: "" },
      { digit: "#", letters: "" }
    ]
  ];

  return (
    <View style={styles.container}>
      {/* Main Content */}
      <View
        style={[
          styles.content,
          Platform.OS === "android" && styles.contentAndroid
        ]}
      >
        {/* Phone Number Display */}
        <WhiteSpace
          height={Platform.OS === "android" ? padding.md : padding["3xl"]}
        />
        <View
          style={[
            styles.numberDisplay,
            {
              backgroundColor:
                theme.colors["color-colors-background-bg-primary"],
              borderColor: theme.colors["colors-border-border-primary"]
            }
          ]}
        >
          <View style={styles.placeholder} />

          <TextInput
            ref={inputRef}
            value={phoneNumberFormatter(phoneNumber)}
            onChangeText={(text) => {
              // Strip non-dial characters so paste works (keeps digits, *, #)
              const cleaned = text.replace(/[^0-9*#]/g, "");
              if (cleaned.length <= 15) {
                setPhoneNumber(cleaned);
              }
            }}
            style={[
              styles.numberInput,
              {
                color: phoneNumber
                  ? theme.colors["color-colors-text-text-primary"]
                  : theme.colors["color-colors-text-text-secondary"],
              }
            ]}
            placeholder=""
            keyboardType="phone-pad"
            textAlign="center"
            caretHidden={true}
            showSoftInputOnFocus={false}
            contextMenuHidden={false}
            autoCorrect={false}
            spellCheck={false}
            inputAccessoryViewID="none"
            selectionColor="transparent"
          />

          {phoneNumber.length > 0 ? (
            <TouchableOpacity
              onPress={handleBackspace}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ padding: 8 }}
            >
              <Icon
                name="delete"
                color={theme.colors["color-colors-text-text-primary"]}
                size={32}
                type="solid"
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.placeholder} />
          )}
        </View>

        <WhiteSpace
          height={Platform.OS === "android" ? padding.xs : padding.md}
        />

        {/* Contact Preview */}
        <View style={[{ flex: 1 }]}>
          {matchingContacts.length > 0 ? (
            <View
              style={[
                styles.previewContainer,
                {
                  backgroundColor:
                    theme.colors["color-colors-background-bg-secondary"],
                  borderColor:
                    theme.colors["color-colors-border-border-secondary"]
                }
              ]}
            >
              <FlatList
                data={matchingContacts}
                keyExtractor={(item, index) => `${item.number}-${index}`}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.previewItem}
                    onPress={() => handleContactSelect(item)}
                  >
                    <Avatar
                      source={item.avatarPath || undefined}
                      name={item.name}
                      size={36}
                      borderRadius={borderRadius.md}
                    />
                    <View style={styles.previewTextContainer}>
                      <Text
                        size={fontSize.sm}
                        weight="semiBold"
                        color="color-colors-text-text-primary"
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      <Text
                        size={fontSize.xs}
                        color="color-colors-text-text-tertiary"
                        numberOfLines={1}
                      >
                        {phoneNumberFormatter(item.number)}
                      </Text>
                    </View>
                    <Icon
                      name="phone-02"
                      size={18}
                      color={
                        theme.colors[
                          "color-component-colors-components-buttons-primary-button-primary-bg"
                        ]
                      }
                    />
                  </TouchableOpacity>
                )}
              />
            </View>
          ) : null}
        </View>

        {/* Keypad Grid */}
        <View
          style={[
            styles.keypadGrid,
            Platform.OS === "android" && styles.keypadGridAndroid,
            Platform.OS === "android" &&
              matchingContacts.length === 2 &&
              styles.keypadGridAndroidTwoSuggestions
          ]}
        >
          {keypadData.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.keypadRow}>
              {row.map((key) => (
                <KeypadButton
                  key={key.digit}
                  digit={key.digit}
                  letters={key.letters}
                  onPress={handleKeypadPress}
                />
              ))}
            </View>
          ))}
        </View>
      </View>

      {/* Bottom Call Button */}
      <View style={styles.bottomSection}>
        <Button
          type="primary"
          onPress={handleCall}
          disabled={!phoneNumber.trim()}
          loading={
            isInitializing || isRegistering || activeCallId === "dialing"
          }
          containerStyle={[
            styles.callButton,
            {
              backgroundColor: !phoneNumber.trim()
                ? theme.colors["color-colors-background-bg-disabled"]
                : theme.colors[
                    "color-component-colors-components-buttons-primary-button-primary-bg"
                  ]
            }
          ]}
          size={18}
          weight="semiBold"
        >
          {isInitializing || isRegistering ? "Initializing..." : "Call"}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: padding["3xl"],
    justifyContent: "space-between"
  },
  content: {
    flex: 1
  },
  numberDisplay: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 40
  },
  placeholder: {
    width: 24,
    height: 24
  },
  numberInput: {
    flex: 1,
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    paddingVertical: 0,
    textAlign: "center",
  },
  keypadGrid: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    alignSelf: "center"
  },
  keypadRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: padding["4xl"],
    paddingVertical: Platform.OS === "ios" ? padding.lg : padding.md,
    width: "100%"
  },
  keypadButton: {
    width: 70,
    height: 70,
    paddingHorizontal: 0
  },
  buttonContent: {
    alignItems: "center",
    justifyContent: "center"
  },
  statusSection: {
    marginTop: padding["2xl"],
    alignItems: "center"
  },
  statusText: {
    fontStyle: "italic",
    marginBottom: padding.sm
  },
  errorText: {
    fontStyle: "italic"
  },
  bottomSection: {
    paddingTop: padding.lg,
    paddingBottom: padding.xl,
    marginBottom: padding.lg
  },
  callButton: {
    paddingVertical: padding.lg,
    borderRadius: borderRadius.lg
  },
  previewContainer: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: "hidden"
  },
  previewItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: padding.sm,
    paddingHorizontal: padding.md,
    gap: padding.sm
  },
  previewTextContainer: {
    flex: 1,
    marginLeft: padding.xs
  },
  keypadGridAndroid: {
    marginTop: -padding["4xl"]
  },
  keypadGridAndroidTwoSuggestions: {
    marginTop: padding.lg
  },
  contentAndroid: {
    paddingTop: 0
  }
});
