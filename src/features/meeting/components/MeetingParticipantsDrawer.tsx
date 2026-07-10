import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef
} from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View
} from "react-native";
import {
  GestureDetector,
  GestureHandlerRootView
} from "react-native-gesture-handler";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { DailyParticipant } from "@daily-co/react-native-daily-js";
import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";
import { fontSize, padding } from "core/theme/theme.ts";
import { useMeetingSheetDragToClose } from "features/meeting/components/useMeetingSheetDragToClose.ts";

const WIN_H = Dimensions.get("window").height;
const SHEET_HEIGHT = Math.min(WIN_H * 0.58, 520);

const trackMediaLive = (
  track:
    | DailyParticipant["tracks"]["video"]
    | DailyParticipant["tracks"]["audio"]
    | undefined
): boolean => {
  if (!track) return false;
  const { state } = track;
  return (
    state === "playable" ||
    state === "loading" ||
    state === "sendable" ||
    state === "interrupted"
  );
};

export type MeetingParticipantsDrawerProps = {
  visible: boolean;
  onClose: () => void;
  participants: DailyParticipant[];
  bgPrimary: string;
  borderSecondary: string;
  textSecondary: string;
};

type SheetBodyProps = Omit<MeetingParticipantsDrawerProps, "visible"> & {
  hardwareBackRef: React.MutableRefObject<() => void>;
};

/**
 * Bottom sheet (same interaction pattern as MeetingBottomControls "more" menu).
 */
const MeetingParticipantsSheetBody = ({
  onClose,
  participants,
  bgPrimary: _bgPrimary,
  borderSecondary: _borderSecondary,
  textSecondary: _textSecondary,
  hardwareBackRef
}: SheetBodyProps) => {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(SHEET_HEIGHT);
  const dragStartY = useSharedValue(0);
  const sheetMaxY = useSharedValue(SHEET_HEIGHT);

  useEffect(() => {
    translateY.value = SHEET_HEIGHT;
    translateY.value = withTiming(0, { duration: 240 });
  }, [translateY]);

  const { sheetPanGesture, closeAnimated } = useMeetingSheetDragToClose({
    translateY,
    sheetMaxY,
    dragStartY,
    onClose
  });

  useLayoutEffect(() => {
    hardwareBackRef.current = closeAnimated;
  }, [closeAnimated, hardwareBackRef]);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }]
  }));

  const sorted = useMemo(() => {
    const list = [...participants];
    list.sort((a, b) => {
      if (a.local) return -1;
      if (b.local) return 1;
      return (a.user_name || "").localeCompare(b.user_name || "");
    });
    return list;
  }, [participants]);

  const bottomPad = padding.lg + insets.bottom;

  return (
    <View style={styles.modalRoot}>
      <Pressable style={styles.backdrop} onPress={closeAnimated} />
      <Reanimated.View
        style={[
          styles.sheet,
          {
            height: SHEET_HEIGHT,
            backgroundColor: "#1e1f20"
          },
          sheetAnimatedStyle
        ]}
      >
        <GestureDetector gesture={sheetPanGesture}>
          <View>
            <View style={styles.grabRow}>
              <View style={styles.grab} />
            </View>
            <View style={styles.panelHeader}>
              <Text size={fontSize.md} weight="semiBold" color="white">
                Participants ({sorted.length})
              </Text>
              <Pressable
                onPress={closeAnimated}
                hitSlop={12}
                style={styles.closeHit}
                accessibilityRole="button"
                accessibilityLabel="Close participants"
              >
                <Icon name="x-close" size={22} color="white" />
              </Pressable>
            </View>
          </View>
        </GestureDetector>
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.session_id}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
          renderItem={({ item }) => {
            const micOn = trackMediaLive(item.tracks?.audio);
            const camOn = trackMediaLive(item.tracks?.video);
            const screenOn = !!item.screen;
            const hand = !!(item.userData as Record<string, unknown> | undefined)?.hr;
            const label = item.local ? "You" : item.user_name || "Guest";
            return (
              <View style={styles.row}>
                <View style={styles.rowMain}>
                  <Text size={fontSize.sm} weight="medium" numberOfLines={1} color="white">
                    {label}
                  </Text>
                  <View style={styles.badges}>
                    {!micOn ? (
                      <Icon name="microphone-off-02" size={16} color="#ef4444" />
                    ) : null}
                    {!camOn ? (
                      <Icon name="video-recorder-off" size={16} color="#ef4444" />
                    ) : null}
                    {screenOn ? <Icon name="monitor-03" size={16} color="#60a5fa" /> : null}
                    {hand ? <Icon name="hand" size={16} color="#60a5fa" /> : null}
                  </View>
                </View>
              </View>
            );
          }}
        />
      </Reanimated.View>
    </View>
  );
};

export const MeetingParticipantsDrawer = ({
  visible,
  onClose,
  participants,
  bgPrimary,
  borderSecondary,
  textSecondary
}: MeetingParticipantsDrawerProps) => {
  const hardwareBackClose = useRef<() => void>(() => {
    onClose();
  });

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent={Platform.OS === "android"}
      onRequestClose={() => hardwareBackClose.current()}
    >
      <GestureHandlerRootView style={styles.safeFill}>
        <SafeAreaView
          edges={Platform.OS === "android" ? ["left", "right"] : ["top", "bottom", "left", "right"]}
          style={styles.safeFill}
        >
          <MeetingParticipantsSheetBody
            onClose={onClose}
            participants={participants}
            bgPrimary={bgPrimary}
            borderSecondary={borderSecondary}
            textSecondary={textSecondary}
            hardwareBackRef={hardwareBackClose}
          />
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeFill: {
    flex: 1
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end"
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.55)"
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden"
  },
  grabRow: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 8
  },
  grab: {
    width: 42,
    height: 4,
    borderRadius: 4,
    backgroundColor: "#3a3f44"
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: padding.lg,
    paddingBottom: padding.sm
  },
  closeHit: {
    padding: padding.xs
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: padding.sm
  },
  row: {
    paddingVertical: padding.sm,
    paddingHorizontal: padding.sm,
    backgroundColor: "#333537",
    borderRadius: 10,
    marginHorizontal: padding.sm,
    marginVertical: padding.xs
  },
  rowMain: {
    gap: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: padding.sm,
    backgroundColor: "#333537",
    paddingVertical: padding.lg,
    borderRadius: 10
  },
  badges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 0
  }
});
