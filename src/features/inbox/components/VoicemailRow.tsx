// React Imports
import { useSelector } from "react-redux";
import { useTheme } from "hooks/use-theme.ts";
import { fontSize } from "core/theme/theme.ts";
import { inboxStyles } from "features/inbox/styles/inbox-styles.ts";
import { formatVMTime } from "features/inbox/utils/voicemail-utils.ts";
import { getCallerNameFromVoicemailCallerId } from "features/inbox/utils/inbox-utils.ts";

// Type Imports
import React from "react";
import { State } from "store/types.ts";
import { VoicemailMessage } from "shared/api/voicemails/types.ts";

// Component Imports
import { Pressable, View } from "react-native";
import { Text } from "shared/components/Text.tsx";

type VoicemailRowProps = {
  item: VoicemailMessage;
  handlePress: (voicemail: VoicemailMessage) => void;
  /** When true, show light red background (e.g. row opened from voicemail notification) */
  highlight?: boolean;
};

export const VoicemailRow = ({ item, handlePress, highlight = false }: VoicemailRowProps) => {
  // Hooks
  const theme = useTheme();

  // App State
  const directory = useSelector(
    ({ directoryReducer }: State) => directoryReducer.directory
  );

  return (
    <Pressable
      onPress={() => handlePress(item)}
      style={({ pressed }) => [
        inboxStyles.pressableStyle,
        {
          borderColor: theme.colors["color-colors-border-border-secondary"],
          backgroundColor: pressed
            ? theme.colors["color-colors-background-bg-primary-hover"]
            : highlight
              ? "rgba(255, 0, 0, 0.08)"
              : "transparent"
        }
      ]}
    >
      {/* Unread dot */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            width: 20,
            height: 20,
            justifyContent: "center"
          }}
        >
          {item.status !== "read" && (
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 5,
                backgroundColor:
                  theme.colors["color-colors-foreground-fg-error-primary"]
              }}
            />
          )}
        </View>

        {/* Formatted name */}
        <View>
          <Text
            size={fontSize.sm}
            style={{
              alignSelf: "flex-start",
              color: theme.colors["color-colors-text-text-primary"]
            }}
          >
            {getCallerNameFromVoicemailCallerId(item.callerId, directory)}
          </Text>
        </View>
      </View>

      {/* Time formatted from UNIX */}
      <Text
        size={fontSize.sm}
        style={{
          color: theme.colors["color-colors-text-text-primary"]
        }}
      >
        {formatVMTime(item.origTime)}
      </Text>
    </Pressable>
  );
};
