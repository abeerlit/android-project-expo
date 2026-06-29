import React, { useMemo } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "shared/components/Text.tsx";
import { fontSize, padding } from "core/theme/theme.ts";

const MENU_W = 200;
const ROW_H = 48;

export type MeetingTileContextMenuProps = {
  visible: boolean;
  anchorX: number;
  anchorY: number;
  isPinned: boolean;
  canPin: boolean;
  /** At pin cap: show hint row instead of an empty menu. */
  pinBlocked?: boolean;
  onDismiss: () => void;
  onPin: () => void;
  onUnpin: () => void;
};

/**
 * Long-press anchored menu (Pin / Unpin). Position clamped to window + safe areas.
 */
export const MeetingTileContextMenu = ({
  visible,
  anchorX,
  anchorY,
  isPinned,
  canPin,
  pinBlocked = false,
  onDismiss,
  onPin,
  onUnpin
}: MeetingTileContextMenuProps) => {
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const menuHeight = useMemo(() => {
    let h = 0;
    if (canPin && !isPinned) h += ROW_H;
    if (pinBlocked && !isPinned) h += ROW_H;
    if (isPinned) h += ROW_H;
    return Math.max(h, ROW_H);
  }, [canPin, isPinned, pinBlocked]);

  const { left, top } = useMemo(() => {
    const pad = 8;
    const maxL = insets.left + pad;
    const maxT = insets.top + pad;
    const maxR = winW - insets.right - pad - MENU_W;
    const maxB = winH - insets.bottom - pad - menuHeight;

    let l = anchorX - MENU_W / 2;
    let t = anchorY - 8;
    if (l < maxL) l = maxL;
    if (l > maxR) l = maxR;
    if (t < maxT) t = maxT;
    if (t > maxB) t = maxB;
    return { left: l, top: t };
  }, [
    anchorX,
    anchorY,
    insets.bottom,
    insets.left,
    insets.right,
    insets.top,
    menuHeight,
    winH,
    winW
  ]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <View style={[styles.menu, { left, top, width: MENU_W }]} pointerEvents="box-none">
          <Pressable onPress={(e) => e.stopPropagation()}>
            {pinBlocked && !isPinned ? (
              <Pressable style={styles.row} onPress={onDismiss}>
                <Text
                  size={fontSize.sm}
                  weight="medium"
                  color="rgba(255,255,255,0.85)"
                >
                  Unpin someone to add another (max 4).
                </Text>
              </Pressable>
            ) : null}
            {canPin && !isPinned ? (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onPin();
                  onDismiss();
                }}
              >
                <Text size={fontSize.md} weight="medium" color="white">
                  Pin
                </Text>
              </Pressable>
            ) : null}
            {isPinned ? (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onUnpin();
                  onDismiss();
                }}
              >
                <Text size={fontSize.md} weight="medium" color="white">
                  Unpin
                </Text>
              </Pressable>
            ) : null}
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)"
  },
  menu: {
    position: "absolute",
    backgroundColor: "#1f1f21",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }
  },
  row: {
    minHeight: ROW_H,
    paddingHorizontal: padding.md,
    justifyContent: "center"
  }
});

