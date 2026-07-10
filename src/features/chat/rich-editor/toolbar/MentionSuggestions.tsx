import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { padding, borderRadius } from "core/theme/theme.ts";
import { MentionItem } from "./MentionItem.tsx";
import { MentionSuggestionsProps } from "../types.ts";

export const MentionSuggestions: React.FC<MentionSuggestionsProps> = ({
  mentionList,
  onMentionPress
}) => {
  const theme = useTheme();

  if (mentionList.length === 0) return null;

  return (
    <View
      style={[
        styles.mentionContainer,
        {
          backgroundColor: theme.colors["color-colors-background-bg-primary"],
          borderColor: theme.colors["colors-border-border-primary"]
        }
      ]}
    >
      <ScrollView>
        {mentionList.map((item, index) => (
          <MentionItem item={item} key={index} onPress={onMentionPress} />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  mentionContainer: {
    width: "100%",
    maxHeight: 220,
    borderWidth: 0.25,
    marginTop: padding.sm,
    padding: padding.lg,
    borderRadius: borderRadius.lg
  }
});
