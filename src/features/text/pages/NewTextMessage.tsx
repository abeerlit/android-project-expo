import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "hooks/use-theme.ts";
import { Text } from "shared/components/Text.tsx";
import { TextInput } from "shared/components/TextInput.tsx";
import { TextMessageComposer } from "../components/TextMessageComposer.tsx";
import { State } from "store/types.ts";
import * as textActions from "store/text/actions.ts";
import { padding } from "core/theme/theme.ts";
import Icon from "shared/components/Icon.tsx";
import { TopBar } from "shared/components/TopBar.tsx";
import { Avatar } from "shared/components/Avatar.tsx";

interface DirectoryContact {
  userId?: number;
  name?: string;
  number?: string;
  phoneNumber?: string;
  email?: string;
  avatarPath?: string | null;
  id?: string;
}

const Screen = ({ children }: { children: React.ReactNode }) => (
  <View style={{ flex: 1 }}>{children}</View>
);

export const NewTextMessage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigation = useNavigation();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<DirectoryContact[]>(
    []
  );

  const { selectedDidNumber } = useSelector(
    (state: State) => state.textReducer
  );
  const { directory } = useSelector((state: State) => state.directoryReducer);

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return directory.slice(0, 50);

    const query = searchQuery.toLowerCase();
    return directory
      .filter(
        (contact: DirectoryContact) =>
          contact.name?.toLowerCase().includes(query) ||
          contact.number?.includes(query) ||
          contact.email?.toLowerCase().includes(query)
      )
      .slice(0, 50);
  }, [directory, searchQuery]);

  const handleContactSelect = (contact: DirectoryContact) => {
    const isSelected = selectedContacts.some(
      (c) => c.userId === contact.userId || c.number === contact.number
    );

    if (isSelected) {
      setSelectedContacts(
        selectedContacts.filter(
          (c) => c.userId !== contact.userId && c.number !== contact.number
        )
      );
    } else {
      setSelectedContacts([...selectedContacts, contact]);
    }
  };

  const handleSend = async (messageText: string, mediaUris: string[]) => {
    if (!selectedDidNumber || selectedContacts.length === 0) return;

    const recipients = selectedContacts
      .map((c) => c.number || c.phoneNumber)
      .filter((num): num is string => !!num)
      .map((num) => num.replace(/^1+/, ""));

    const sender = selectedDidNumber.number.replace(/^1+/, "");

    dispatch(
      textActions.sendTextMessage(recipients, sender, messageText, mediaUris)
    );

    setTimeout(() => {
      dispatch(textActions.setNewTextMode(false));
      navigation.goBack();
    }, 500);
  };

  const renderContact = ({ item }: { item: DirectoryContact }) => {
    const isSelected = selectedContacts.some(
      (c) => c.userId === item.userId || c.number === item.number
    );

    return (
      <TouchableOpacity
        style={styles.contactRow}
        onPress={() => handleContactSelect(item)}
      >
        <Avatar
          name={item.name}
          source={item.avatarPath || undefined}
          size={40}
        />
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.name}</Text>
          {item.number && (
            <Text style={styles.contactNumber}>{item.number}</Text>
          )}
        </View>
        {isSelected && (
          <Icon
            name="check-circle"
            size={24}
            color={theme.colors["colors-background-bg-brand-solid"]}
          />
        )}
      </TouchableOpacity>
    );
  };

  const keyExtractor = (item: DirectoryContact) =>
    item.userId?.toString() || item.number || item.id || "unknown";

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors["color-colors-background-bg-primary"]
    },
    selectedContainer: {
      paddingHorizontal: padding.lg,
      paddingVertical: padding.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors["color-colors-border-border-secondary"]
    },
    selectedLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.colors["colors-text-text-secondary"],
      marginBottom: padding.sm
    },
    selectedList: {
      flexDirection: "row",
      flexWrap: "wrap"
    },
    selectedChip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors["colors-background-bg-brand-secondary"],
      borderRadius: 16,
      paddingHorizontal: padding.md,
      paddingVertical: padding.xs,
      marginRight: padding.sm,
      marginBottom: padding.sm
    },
    selectedChipText: {
      fontSize: 14,
      color: theme.colors["colors-text-text-brand-primary"],
      marginRight: padding.xs
    },
    searchContainer: {
      paddingHorizontal: padding.lg,
      paddingVertical: padding.md
    },
    contactRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: padding.lg,
      paddingVertical: padding.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors["color-colors-border-border-secondary"]
    },
    contactInfo: {
      flex: 1,
      marginLeft: padding.md
    },
    contactName: {
      fontSize: 16,
      fontWeight: "500",
      color: theme.colors["color-colors-text-text-primary"],
      marginBottom: 2
    },
    contactNumber: {
      fontSize: 14,
      color: theme.colors["colors-text-text-secondary"]
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: padding.xl
    },
    emptyText: {
      fontSize: 16,
      color: theme.colors["colors-text-text-secondary"],
      textAlign: "center"
    }
  });

  const canSend = selectedContacts.length > 0 && !!selectedDidNumber;

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <TopBar title="New Message" />

        {selectedContacts.length > 0 && (
          <View style={styles.selectedContainer}>
            <Text style={styles.selectedLabel}>
              To: {selectedContacts.length}
            </Text>
            <View style={styles.selectedList}>
              {selectedContacts.map((contact) => (
                <View
                  key={contact.userId || contact.number}
                  style={styles.selectedChip}
                >
                  <Text style={styles.selectedChipText}>{contact.name}</Text>
                  <TouchableOpacity
                    onPress={() => handleContactSelect(contact)}
                  >
                    <Icon
                      name="x-close"
                      size={16}
                      color={theme.colors["colors-text-text-brand-primary"]}
                    />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.searchContainer}>
          <TextInput
            placeholder="Search contacts..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            before={
              <Icon
                name="search-sm"
                size={20}
                color={theme.colors["color-colors-text-text-tertiary"]}
              />
            }
          />
        </View>

        {filteredContacts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery ? "No contacts found" : "No contacts available"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredContacts}
            renderItem={renderContact}
            keyExtractor={keyExtractor}
          />
        )}

        <TextMessageComposer
          onSend={handleSend}
          disabled={!canSend}
          placeholder={
            canSend
              ? "Type a message..."
              : selectedContacts.length === 0
              ? "Select contacts first"
              : "Select a number to send"
          }
        />
      </KeyboardAvoidingView>
    </Screen>
  );
};
