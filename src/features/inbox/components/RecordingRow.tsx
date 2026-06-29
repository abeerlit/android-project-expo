// React Imports
import React from "react";
import {
  formatRelativeTime,
  phoneNumberFormatter
} from "shared/utils/utils.ts";
import { useSelector } from "react-redux";
import {
  getDispositionColor,
  getDispositionIcon
} from "features/inbox/utils/call-utils.ts";
import { useTheme } from "hooks/use-theme.ts";
import { fontSize } from "core/theme/theme.ts";
import { inboxStyles } from "features/inbox/styles/inbox-styles.ts";
import { getContactName } from "features/inbox/utils/inbox-utils.ts";

// Type Imports
import { State } from "store/types.ts";
import { StyleSheet } from "react-native";
import { CallData } from "shared/api/inbox/types.ts";

// Component Imports
import Icon from "shared/components/Icon.tsx";
import { Pressable, View } from "react-native";
import { Text } from "shared/components/Text.tsx";

type RecordingRowProps = {
  recording: CallData;
  handlePress: (recording: CallData) => void;
};

export const RecordingRow = ({ recording, handlePress }: RecordingRowProps) => {
  // Hooks
  const theme = useTheme();

  // App State
  const directory = useSelector(
    ({ directoryReducer }: State) => directoryReducer.directory
  );
  const personalContacts = useSelector(
    ({ directoryReducer }: State) => directoryReducer.personalContacts ?? []
  );

  return (
    <Pressable
      onPress={() => handlePress(recording)}
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
          name={getDispositionIcon(recording.direction)}
          size={25}
          type="outline"
          stroke={getDispositionColor(recording.disposition, theme)}
          strokeWidth={1.5}
        />
        <View>
          <Text
            size={fontSize.sm}
            style={[
              styles.text,
              { color: theme.colors["color-colors-text-text-primary"] }
            ]}
          >
            {recording.direction === "inbound"
              ? getContactName(
                  recording.callerIdNum,
                  recording.callerIdName,
                  directory,
                  personalContacts
                )
              : getContactName(
                  recording.dialedNum,
                  recording.dialedName,
                  directory,
                  personalContacts
                )}
          </Text>
          <Text
            size={fontSize.sm}
            style={[
              styles.text,
              { color: theme.colors["color-colors-text-text-primary"] }
            ]}
          >
            {recording.direction === "inbound"
              ? phoneNumberFormatter(recording.callerIdNum)
              : phoneNumberFormatter(recording.dialedNum)}
          </Text>
        </View>
      </View>

      <Text
        size={fontSize.sm}
        style={{ color: theme.colors["color-colors-text-text-primary"] }}
      >
        {formatRelativeTime(recording.endTime)}
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
