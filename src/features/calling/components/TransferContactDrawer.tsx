import React, { useState, useMemo, useCallback } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  TouchableOpacity,
  Pressable,
  TextInput as RNTextInput,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  useWindowDimensions
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "hooks/use-theme.ts";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";
import { useDebounceFn } from "ahooks";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { TextInput } from "shared/components/TextInput.tsx";
import { Button } from "shared/components/Button.tsx";
import Icon from "shared/components/Icon.tsx";
import { useSelector } from "react-redux";
import { State } from "store/types.ts";
import { Avatar } from "shared/components/Avatar.tsx";
import {
  phoneNumberFormatter,
  normalizeTransferDestination,
  isValidTransferDestination,
  MAX_TRANSFER_DESTINATION_LENGTH
} from "shared/utils/utils.ts";

// Context
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { TransferNumberKeypad } from "./TransferNumberKeypad.tsx";
import { findContactByPhoneNumber } from "../utils/contact-lookup.ts";

export interface TransferContact {
  name: string;
  number: string;
  avatarPath?: string;
}

interface TransferContactDrawerProps {
  onContactSelected: (contact: TransferContact) => void;
  onCancel: () => void;
  title?: string;
}

const NARROW_BREAKPOINT = 360;

export const TransferContactDrawer = ({
  onContactSelected,
  onCancel,
  title
}: TransferContactDrawerProps) => {
  const theme = useTheme();
  const { closeDrawer } = useDrawer();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isNarrow = windowWidth < NARROW_BREAKPOINT;

  const { directory, companyContacts, personalContacts, phoneContacts } =
    useSelector((state: State) => state.directoryReducer);

  // Memoize all contacts with phone numbers
  const allContacts = useMemo(() => {
    const contacts: TransferContact[] = [];

    directory
      .filter((contact) => contact.number && contact.number.trim())
      .forEach((contact) => {
        contacts.push({
          name: contact.name,
          number: contact.number,
          avatarPath:
            contact.avatarThumbnailPath || contact.avatarPath || undefined
        });
      });

    return contacts.sort((a, b) => a.name.localeCompare(b.name));
  }, [directory, companyContacts, personalContacts]);

  const [entryMode, setEntryMode] = useState<"contacts" | "keypad">("contacts");
  const [keypadDigits, setKeypadDigits] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<TransferContact[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (term: string) => {
    setIsSearching(true);

    if (!term.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const normalizedSearch = term.toLowerCase().trim();
    const results = allContacts.filter(
      (contact) =>
        contact.name.toLowerCase().includes(normalizedSearch) ||
        contact.number.includes(normalizedSearch)
    );

    setSearchResults(results);
    setIsSearching(false);
  };

  const { run: debouncedSearch } = useDebounceFn(handleSearch, {
    wait: 300
  });

  const handleTransferCancel = async () => {
    onCancel();
    closeDrawer();
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    debouncedSearch(value);
  };

  const handleContactPress = useCallback(
    (contact: TransferContact) => {
      closeDrawer();
      onContactSelected(contact);
    },
    [closeDrawer, onContactSelected]
  );

  const renderContact = useCallback(
    ({ item }: { item: TransferContact }) => (
      <TouchableOpacity
        style={styles.contactItem}
        onPress={() => handleContactPress(item)}
      >
        <Avatar
          source={item.avatarPath}
          name={item.name}
          size={40}
          borderRadius={borderRadius.md}
        />
        <Text size={fontSize.md} weight="medium">
          {item.name}
        </Text>
      </TouchableOpacity>
    ),
    [handleContactPress]
  );

  const keyExtractor = useCallback(
    (item: TransferContact, index: number) => `${item.number}-${index}`,
    []
  );

  const displayedContacts = searchTerm.trim() ? searchResults : allContacts;

  const keypadContinueEnabled = isValidTransferDestination(keypadDigits);

  /** Matches DialerKeypad: strip formatting on paste/edit; state stays raw dial chars. */
  const onKeypadDisplayChange = useCallback((text: string) => {
    const cleaned = text.replace(/[^0-9*#+]/g, "");
    if (cleaned.length <= MAX_TRANSFER_DESTINATION_LENGTH) {
      setKeypadDigits(cleaned);
    }
  }, []);

  const onKeypadDigit = useCallback((digit: string) => {
    setKeypadDigits((prev) => {
      if (prev.length >= MAX_TRANSFER_DESTINATION_LENGTH) {
        return prev;
      }
      return prev + digit;
    });
  }, []);

  const onKeypadBackspace = useCallback(() => {
    setKeypadDigits((prev) => prev.slice(0, -1));
  }, []);

  const handleOpenKeypad = useCallback(() => {
    setEntryMode("keypad");
    setKeypadDigits("");
  }, []);

  const handleBackToContacts = useCallback(() => {
    setEntryMode("contacts");
    setKeypadDigits("");
  }, []);

  const handleKeypadContinue = useCallback(() => {
    if (!isValidTransferDestination(keypadDigits)) {
      return;
    }
    const normalized = normalizeTransferDestination(keypadDigits);
    const matched = findContactByPhoneNumber(
      normalized,
      personalContacts,
      companyContacts,
      directory,
      phoneContacts
    );

    closeDrawer();
    if (matched) {
      onContactSelected({
        name: matched.name,
        number: normalized,
        avatarPath: matched.avatarPath ?? undefined
      });
    } else {
      onContactSelected({
        name: "",
        number: normalized
      });
    }
  }, [
    keypadDigits,
    closeDrawer,
    onContactSelected,
    personalContacts,
    companyContacts,
    directory,
    phoneContacts
  ]);

  const headerTitle = title ?? "Transfer";

  const searchInput = (
    <TextInput
      variant="text"
      placeholder="Search contacts..."
      placeholderSize={fontSize.md}
      textWeight="medium"
      placeholderWeight="medium"
      placeholderColor="color-component-colors-components-buttons-tertiary-button-tertiary-fg"
      value={searchTerm}
      onChangeText={handleSearchChange}
    />
  );

  const keypadOpenButton = (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Enter phone number with keypad"
      onPress={handleOpenKeypad}
      style={styles.keypadAffordance}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Icon
        name="dots-grid"
        size={24}
        color={theme.colors["color-colors-text-text-primary"]}
      />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <View style={styles.content}>
          <WhiteSpace height={3} />

          <Text
            size={fontSize.lg}
            style={[
              styles.title,
              { color: theme.colors["color-colors-text-text-primary"] }
            ]}
          >
            {headerTitle}
          </Text>

          <WhiteSpace
            style={[
              styles.divider,
              {
                borderColor: theme.colors["color-colors-border-border-secondary"]
              }
            ]}
          />

          {entryMode === "contacts" ? (
            <>
              {isNarrow ? (
                <View style={styles.searchFieldStack}>
                  <Text size={fontSize.md} weight="medium">
                    To:
                  </Text>
                  <View style={styles.searchRowInner}>
                    <View style={styles.inputContainer}>{searchInput}</View>
                    {keypadOpenButton}
                  </View>
                </View>
              ) : (
                <View style={styles.searchField}>
                  <Text size={fontSize.md} weight="medium">
                    To:
                  </Text>
                  <View style={styles.inputContainer}>{searchInput}</View>
                  {keypadOpenButton}
                </View>
              )}

              <WhiteSpace
                style={[
                  styles.divider,
                  {
                    borderColor:
                      theme.colors["color-colors-border-border-secondary"]
                  }
                ]}
              />

              <View style={styles.contactsContainer}>
                {isSearching ? (
                  <View style={styles.statusContainer}>
                    <Text size={fontSize.md} color="colors-text-text-secondary">
                      Searching...
                    </Text>
                  </View>
                ) : displayedContacts.length > 0 ? (
                  <FlatList
                    data={displayedContacts}
                    keyExtractor={keyExtractor}
                    renderItem={renderContact}
                    showsVerticalScrollIndicator={false}
                    style={styles.contactsList}
                    keyboardDismissMode="on-drag"
                    keyboardShouldPersistTaps="handled"
                  />
                ) : (
                  <View style={styles.statusContainer}>
                    <Text size={fontSize.md} color="colors-text-text-secondary">
                      {searchTerm.trim()
                        ? "No contacts found"
                        : "No contacts with phone numbers"}
                    </Text>
                  </View>
                )}
              </View>
            </>
          ) : (
            <ScrollView
              style={styles.keypadScroll}
              contentContainerStyle={styles.keypadScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <TouchableOpacity
                style={styles.backToContactsRow}
                onPress={handleBackToContacts}
                accessibilityRole="button"
                accessibilityLabel="Back to contacts"
              >
                <Icon
                  name="chevron-left"
                  size={22}
                  color={theme.colors["color-colors-text-text-primary"]}
                />
                <Text size={fontSize.md} weight="medium">
                  Contacts
                </Text>
              </TouchableOpacity>

              <WhiteSpace height={padding.md} />

              <View
                style={[
                  styles.digitsRow,
                  {
                    borderColor:
                      theme.colors["color-colors-border-border-secondary"],
                    backgroundColor:
                      theme.colors["color-colors-background-bg-secondary"]
                  }
                ]}
              >
                <View style={styles.digitsPlaceholder} />
                <RNTextInput
                  value={phoneNumberFormatter(keypadDigits)}
                  onChangeText={onKeypadDisplayChange}
                  style={[
                    styles.digitsInput,
                    {
                      color: keypadDigits
                        ? theme.colors["color-colors-text-text-primary"]
                        : theme.colors["color-colors-text-text-secondary"]
                    }
                  ]}
                  placeholder=""
                  keyboardType="phone-pad"
                  textAlign="center"
                  caretHidden
                  showSoftInputOnFocus={false}
                  autoCorrect={false}
                  spellCheck={false}
                  selectionColor="transparent"
                />
                {keypadDigits.length > 0 ? (
                  <Pressable
                    onPress={onKeypadBackspace}
                    accessibilityRole="button"
                    accessibilityLabel="Delete digit"
                    hitSlop={12}
                    style={styles.digitsDeleteHit}
                  >
                    <Icon
                      name="delete"
                      type="solid"
                      size={Platform.OS === "ios" ? 28 : 22}
                      color={theme.colors["color-colors-text-text-primary"]}
                    />
                  </Pressable>
                ) : (
                  <View style={styles.digitsPlaceholder} />
                )}
              </View>

              <WhiteSpace height={padding.md} />

              <View style={styles.keypadWrap}>
                <TransferNumberKeypad onDigitPress={onKeypadDigit} />
              </View>

              <WhiteSpace height={padding.md} />

              <Button
                type="primary"
                onPress={handleKeypadContinue}
                disabled={!keypadContinueEnabled}
              >
                Continue
              </Button>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>

      <View
        style={[
          styles.buttonContainer,
          { paddingBottom: Math.max(padding.lg, insets.bottom) }
        ]}
      >
        <Button onPress={handleTransferCancel} type="secondary">
          Cancel
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  keyboardAvoiding: {
    flex: 1
  },
  content: {
    flex: 1,
    paddingHorizontal: padding["2xl"]
  },
  title: {
    fontWeight: "600",
    marginBottom: padding["2xl"]
  },
  divider: {
    borderStyle: "solid",
    borderWidth: 0.5
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: padding.md,
    paddingVertical: padding.md
  },
  searchFieldStack: {
    paddingVertical: padding.md,
    gap: padding.sm
  },
  searchRowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: padding.md,
    width: "100%"
  },
  inputContainer: {
    flex: 1,
    minWidth: 0
  },
  keypadAffordance: {
    padding: padding.xs,
    justifyContent: "center",
    alignItems: "center"
  },
  backToContactsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: padding.xs,
    paddingVertical: padding.sm,
    marginVertical: padding.lg
  },
  digitsRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: padding.sm
  },
  digitsPlaceholder: {
    width: 28,
    height: 28
  },
  digitsInput: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    paddingVertical: Platform.OS === "ios" ? padding.sm : padding.xs
  },
  digitsDeleteHit: {
    padding: padding.xs
  },
  keypadScroll: {
    flex: 1
  },
  keypadScrollContent: {
    flexGrow: 1,
    paddingBottom: padding.md
  },
  keypadWrap: {
    alignItems: "center",
    marginTop: padding.lg
  },
  contactsContainer: {
    flex: 1,
    paddingTop: padding.md
  },
  contactsList: {
    flex: 1
  },
  statusContainer: {
    paddingVertical: padding.xl,
    alignItems: "center"
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: padding.md,
    paddingHorizontal: padding.xl,
    gap: padding.lg
  },

  numberText: {
    opacity: 0.8
  },
  buttonContainer: {
    paddingHorizontal: padding.xl,
    paddingTop: padding.lg
  }
});
