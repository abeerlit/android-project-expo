// React Imports
import React from "react";
import {
  formatRelativeTime,
  phoneNumberFormatter
} from "shared/utils/utils.ts";
import { useTheme } from "hooks/use-theme.ts";
import { fontSize } from "core/theme/theme.ts";
import { inboxStyles } from "features/inbox/styles/inbox-styles.ts";
import { getContactName } from "features/inbox/utils/inbox-utils.ts";

// Type Imports
import { StyleSheet } from "react-native";
import { Fax } from "shared/api/faxes/types.ts";
import { PersonalContact } from "shared/api/directory/types.ts";

// Component Imports
import Icon from "shared/components/Icon.tsx";
import { Pressable, View } from "react-native";
import { Text } from "shared/components/Text.tsx";

type FaxRowProps = {
  fax: Fax;
  directory: any;
  personalContacts?: PersonalContact[];
  onPress: (fax: Fax) => void;
};

export const FaxRow = ({
  fax,
  directory,
  personalContacts = [],
  onPress
}: FaxRowProps) => {
  // Hooks
  const theme = useTheme();

  // Methods
  const getDirectionIcon = (direction: string) => {
    return direction === "OUT" ? "arrow-down-left" : "arrow-up-right";
  };

  const rawPhoneNumber =
    fax.direction === "OUT" ? fax.destNum : fax.sourceNum;

  const contactName =
    fax.direction === "OUT"
      ? getContactName(fax.destNum, fax.destNum, directory, personalContacts)
      : getContactName(fax.sourceNum, fax.sourceName, directory, personalContacts);

  const formattedPhoneNumber = phoneNumberFormatter(rawPhoneNumber || "");

  // Check if contact name is just the formatted number (no contact found)
  const hasContact =
    contactName !== formattedPhoneNumber && contactName !== rawPhoneNumber;

  return (
    <Pressable
      onPress={() => onPress(fax)}
      style={({ pressed }) => [
        inboxStyles.pressableStyle,
        {
          borderColor: theme.colors["color-colors-border-border-secondary"],
          backgroundColor: pressed
            ? theme.colors["color-colors-background-bg-primary-hover"]
            : "transparent"
        }
      ]}
    >
      <View style={styles.leftContent}>
        <Icon
          name={getDirectionIcon(fax.direction)}
          size={25}
          type="outline"
          strokeWidth={1.5}
        />
        <View>
          {hasContact ? (
            <>
              <Text
                size={fontSize.sm}
                style={[
                  styles.text,
                  { color: theme.colors["color-colors-text-text-primary"] }
                ]}
              >
                {contactName}
              </Text>
              <Text
                size={fontSize.sm}
                style={[
                  styles.text,
                  { color: theme.colors["color-colors-text-text-primary"] }
                ]}
              >
                {formattedPhoneNumber}
              </Text>
            </>
          ) : (
            <Text
              size={fontSize.sm}
              style={[
                styles.text,
                { color: theme.colors["color-colors-text-text-primary"] }
              ]}
            >
              {formattedPhoneNumber}
            </Text>
          )}
        </View>
      </View>

      <Text
        size={fontSize.sm}
        style={{ color: theme.colors["color-colors-text-text-primary"] }}
      >
        {formatRelativeTime(fax.date)}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  leftContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  text: {
    alignSelf: "flex-start"
  }
});
