import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
  TouchableOpacity
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "hooks/use-theme.ts";
import { Text } from "shared/components/Text.tsx";
import { TextConversationRow } from "../components/TextConversationRow.tsx";
import { State } from "store/types.ts";
import * as textActions from "store/text/actions.ts";
import { TextConversation } from "shared/api/messaging/types.ts";
import { padding } from "core/theme/theme.ts";
import Icon from "shared/components/Icon.tsx";
import { Routes } from "core/navigation/types/types.ts";
import { EmptyState } from "shared/components/EmptyState.tsx";

const Screen = ({ children }: { children: React.ReactNode }) => (
  <View style={{ flex: 1 }}>{children}</View>
);

export const TextConversations: React.FC = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);

  const { conversations, provisionedNumbers } = useSelector(
    (state: State) => state.textReducer
  );

  useEffect(() => {
    // Fetch conversations and provisioned numbers on mount
    dispatch(textActions.fetchConversations());
    dispatch(textActions.fetchProvisionedNumbers());
  }, [dispatch]);

  const handleRefresh = async () => {
    setRefreshing(true);
    dispatch(textActions.fetchConversations());
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleConversationPress = (conversation: TextConversation) => {
    dispatch(textActions.setCurrentConversation(conversation));
    dispatch(textActions.fetchConversationMessages(conversation.id));
    // @ts-expect-error Navigation type not fully defined
    navigation.navigate(Routes.TextThread, {
      conversationId: conversation.id
    });
  };

  const handleNewMessage = () => {
    dispatch(textActions.setCurrentConversation(null));
    dispatch(textActions.setNewTextMode(true));
    // @ts-expect-error Navigation type not fully defined
    navigation.navigate(Routes.NewTextMessage);
  };

  const renderConversation = ({ item }: { item: TextConversation }) => (
    <TextConversationRow
      conversation={item}
      onPress={() => handleConversationPress(item)}
    />
  );

  const keyExtractor = (item: TextConversation) => item.id.toString();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors["color-colors-background-bg-primary"]
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: padding.lg,
      paddingVertical: padding.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors["color-colors-border-border-secondary"]
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: "bold",
      color: theme.colors["color-colors-text-text-primary"]
    },
    newMessageButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors["colors-background-bg-brand-solid"],
      alignItems: "center",
      justifyContent: "center"
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: padding.xl
    },
    warningContainer: {
      backgroundColor: theme.colors["colors-background-bg-warning-secondary"],
      padding: padding.md,
      margin: padding.lg,
      borderRadius: 8,
      flexDirection: "row",
      alignItems: "center"
    },
    warningText: {
      flex: 1,
      marginLeft: padding.sm,
      fontSize: 14,
      color: theme.colors["colors-foreground-fg-warning-secondary"]
    }
  });

  const canText = provisionedNumbers && provisionedNumbers.length > 0;

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Messages</Text>
          {canText && (
            <TouchableOpacity
              style={styles.newMessageButton}
              onPress={handleNewMessage}
            >
              <Icon name="edit-05" size={20} color={theme.colors.white} />
            </TouchableOpacity>
          )}
        </View>

        {!canText && (
          <View style={styles.warningContainer}>
            <Icon
              name="alert-triangle"
              size={20}
              color={theme.colors["colors-foreground-fg-warning-secondary"]}
            />
            <Text style={styles.warningText}>
              No phone numbers available for texting. Contact your
              administrator.
            </Text>
          </View>
        )}

        {conversations.length === 0 ? (
          <EmptyState
            icon="message-text-square-02"
            title="No conversations"
            subtext={
              canText
                ? "Start a new conversation by tapping the + button"
                : "You need a provisioned number to send messages"
            }
          />
        ) : (
          <FlatList
            data={conversations}
            renderItem={renderConversation}
            keyExtractor={keyExtractor}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
              />
            }
          />
        )}
      </View>
    </Screen>
  );
};
