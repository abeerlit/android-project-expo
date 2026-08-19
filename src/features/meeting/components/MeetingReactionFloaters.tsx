import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

export type FloatingMeetingReaction = {
  id: string;
  emoji: string;
  fromSessionId: string;
};

type Props = {
  items: FloatingMeetingReaction[];
  /**
   * `tile` — bottom-center inside a participant video box (default).
   * `stage` — full-stage strip (e.g. solo “only you” layout).
   */
  variant?: "tile" | "stage";
  /** Narrow thumbnails (screen-share rail): smaller emoji. */
  compact?: boolean;
};

/**
 * Web-style meeting reactions: emoji in a pill, fade in / fade out when removed from `items`.
 * Parent controls lifetime (e.g. remove after ~2.8s so `exiting` runs).
 */
export const MeetingReactionFloaters = ({
  items,
  variant = "tile",
  compact = false
}: Props) => {
  if (items.length === 0) return null;

  const wrapStyle = variant === "stage" ? styles.wrapStage : styles.wrapTile;

  return (
    <View style={wrapStyle} pointerEvents="none" accessibilityElementsHidden>
      {items.map((r) => (
        <Animated.View
          key={r.id}
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(420)}
          style={[styles.pill, compact && styles.pillCompact]}
        >
          <View
            style={[styles.emojiSlot, compact && styles.emojiSlotCompact]}
            pointerEvents="none"
          >
            <Text
              style={[styles.emoji, compact && styles.emojiCompact]}
              allowFontScaling={false}
            >
              {r.emoji}
            </Text>
          </View>
        </Animated.View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapTile: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "flex-end",
    alignContent: "flex-end",
    gap: 8,
    paddingHorizontal: 6,
    // Clear name badge (~bottom 8 + label + breathing room)
    paddingBottom: 40,
    zIndex: 6
  },
  wrapStage: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "flex-end",
    alignContent: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: "24%",
    zIndex: 25
  },
  pill: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center"
  },
  pillCompact: {
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  emojiSlot: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center"
  },
  emojiSlotCompact: {
    width: 30,
    height: 30
  },
  emoji: {
    fontSize: 40,
    lineHeight: 40,
    textAlign: "center",
    ...Platform.select({
      ios: {
        transform: [{ translateY: 6 }]
      },
      android: {
        textAlignVertical: "center",
        includeFontPadding: false
      }
    })
  },
  emojiCompact: {
    fontSize: 26,
    lineHeight: 26,
    ...Platform.select({
      ios: {
        transform: [{ translateY: 4 }]
      },
      android: {
        textAlignVertical: "center",
        includeFontPadding: false
      }
    })
  }
});

