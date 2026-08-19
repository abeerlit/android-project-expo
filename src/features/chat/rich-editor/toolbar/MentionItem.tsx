import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { borderRadius, padding } from "core/theme/theme.ts";
import { Avatar } from "shared/components/Avatar.tsx";
import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";
import { MentionItemProps } from "../types.ts";

export const MentionItem: React.FC<
  MentionItemProps & { onPress: (item: any) => void }
> = ({ item, onPress }) => {
  return (
    <TouchableOpacity onPress={() => onPress(item)} style={styles.mentionItem}>
      {item.channelMention ? (
        <View style={styles.channelMentionIcon}>
          <Icon name="announcement-03" size={20} />
        </View>
      ) : (
        <Avatar
          size={30}
          source={item.avatarPath || undefined}
          borderRadius={borderRadius.md}
          style={styles.mentionAvatar}
        />
      )}
      <Text
        weight={item.channelMention ? "semiBold" : "normal"}
        color="primary"
      >
        {item.channelMention ? "@" + item.name : item.name}
      </Text>
      {item.subText && (
        <Text
          style={styles.mentionSubText}
          color="color-colors-text-text-tertiary"
          size={12}
        >
          {item.subText}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  mentionItem: {
    flexDirection: "row",
    paddingVertical: padding.xs,
    alignItems: "center"
  },
  channelMentionIcon: {
    height: 24,
    width: 24,
    marginHorizontal: padding.sm,
    paddingTop: padding.xxs
  },
  mentionAvatar: {
    marginRight: padding.sm
  },
  mentionSubText: {
    marginLeft: padding.sm
  }
});
