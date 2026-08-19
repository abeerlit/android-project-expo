import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View
} from "react-native";
import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";
import { fontSize, padding } from "core/theme/theme.ts";

export type MeetingSoloInvitePanelProps = {
  inviteLinkDisplay: string;
  inviteLinkToCopy: string;
  onCopy: () => void;
  onShare: () => void;
  /** Android diag: skip ScrollView (suspected blank-stage trigger). */
  usePlainContainer?: boolean;
};

export const MeetingSoloInvitePanel = ({
  inviteLinkDisplay,
  inviteLinkToCopy,
  onCopy,
  onShare,
  usePlainContainer = false
}: MeetingSoloInvitePanelProps) => {
  const body = (
    <>
      <Text
        size={fontSize.lg}
        weight="semiBold"
        color="white"
        align="left"
        style={styles.soloTitle}
      >
        {"You're the only one here"}
      </Text>
      <Text
        size={fontSize.sm}
        weight="medium"
        color="white"
        align="left"
        style={styles.soloSubtitle}
      >
        Share this joining info with others you want in the meeting
      </Text>
      <View style={styles.soloLinkRow}>
        <Text
          size={fontSize.md}
          weight="medium"
          color="white"
          align="left"
          style={styles.soloLinkText}
        >
          {inviteLinkDisplay || inviteLinkToCopy}
        </Text>
        <TouchableOpacity
          style={styles.soloCopyButton}
          onPress={onCopy}
          accessibilityRole="button"
          accessibilityLabel="Copy meeting link"
        >
          <Icon name="copy-01" size={22} color="#8ab4f8" />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={styles.soloShareButton}
        onPress={onShare}
        activeOpacity={0.85}
      >
        <Icon name="share-01" size={20} color="#174ea6" />
        <Text
          size={fontSize.sm}
          weight="semiBold"
          style={styles.soloShareButtonLabel}
        >
          Share invite
        </Text>
      </TouchableOpacity>
    </>
  );

  if (usePlainContainer) {
    return <View style={styles.plainContent}>{body}</View>;
  }

  return (
    <ScrollView
      style={styles.soloScroll}
      contentContainerStyle={styles.soloScrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {body}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  soloScroll: {
    flex: 1,
    width: "100%",
    marginTop: 50,
    ...Platform.select({
      android: { minHeight: 0 },
      default: {}
    })
  },
  soloScrollContent: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    paddingHorizontal: padding.lg,
    paddingTop: padding.lg,
    paddingBottom: 120
  },
  plainContent: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    paddingHorizontal: padding.lg,
    paddingTop: padding.lg,
    paddingBottom: padding.lg
  },
  soloTitle: {
    marginBottom: padding.sm,
    paddingHorizontal: padding.sm
  },
  soloSubtitle: {
    opacity: 0.92,
    marginBottom: padding.xl,
    maxWidth: 320,
    paddingHorizontal: padding.sm,
    lineHeight: 22
  },
  soloLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#2d2f31",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: padding.lg
  },
  soloLinkText: {
    flex: 1,
    marginRight: padding.sm
  },
  soloCopyButton: {
    padding: 6
  },
  soloShareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#c2e7ff",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 28,
    minWidth: 200
  },
  soloShareButtonLabel: {
    color: "#174ea6"
  }
});
