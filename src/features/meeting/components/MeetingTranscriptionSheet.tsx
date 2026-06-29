import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef
} from "react";
import {
  Dimensions,
  FlatList,
  Modal,
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
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";
import { fontSize, padding } from "core/theme/theme.ts";
import { useMeetingSheetDragToClose } from "features/meeting/components/useMeetingSheetDragToClose.ts";

const WIN_H = Dimensions.get("window").height;
/** Match MeetingChatSheet closed height feel (~72% window, capped). */
const SHEET_HEIGHT = Math.min(WIN_H * 0.62, 580);

export type TranscriptionLine = {
  id: string;
  sender: string;
  content: string;
  date: string;
};

export type MeetingTranscriptionSheetProps = {
  visible: boolean;
  onClose: () => void;
  lines: TranscriptionLine[];
  transcriptionActive: boolean;
};

type SheetBodyProps = Omit<MeetingTranscriptionSheetProps, "visible"> & {
  hardwareBackRef: React.MutableRefObject<() => void>;
};

/**
 * Same presentation stack as MeetingChatSheet: native Modal + SafeAreaView
 * so the sheet appears above the more-actions Modal.
 */
const MeetingTranscriptionSheetBody = ({
  onClose,
  lines,
  transcriptionActive,
  hardwareBackRef
}: SheetBodyProps) => {
  const translateY = useSharedValue(SHEET_HEIGHT);
  const dragStartY = useSharedValue(0);
  const sheetMaxY = useSharedValue(SHEET_HEIGHT);

  useLayoutEffect(() => {
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

  return (
    <View style={styles.modalRoot}>
      <Pressable style={styles.backdrop} onPress={closeAnimated} />
      <Reanimated.View
        style={[
          styles.sheet,
          {
            height: SHEET_HEIGHT
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
                Transcription
              </Text>
              <View style={styles.headerRight}>
                {transcriptionActive ? (
                  <Text size={fontSize.xs} weight="medium" color="white" style={styles.liveLabel}>
                    Live
                  </Text>
                ) : null}
                <Pressable
                  onPress={closeAnimated}
                  hitSlop={12}
                  style={styles.closeHit}
                  accessibilityRole="button"
                  accessibilityLabel="Close transcription"
                >
                  <Icon name="x-close" size={22} color="white" />
                </Pressable>
              </View>
            </View>
          </View>
        </GestureDetector>
        <FlatList
          data={lines}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text
              size={fontSize.sm}
              weight="medium"
              color="white"
              style={styles.emptyHint}
            >
              No transcript lines yet. Final segments appear here while the
              meeting is transcribed.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.lineCard}>
              <Text size={fontSize.xs} weight="medium" color="white" style={styles.lineSender}>
                {item.sender}
              </Text>
              <Text size={fontSize.sm} color="white" style={styles.lineContent}>
                {item.content}
              </Text>
            </View>
          )}
        />
      </Reanimated.View>
    </View>
  );
};

export const MeetingTranscriptionSheet = ({
  visible,
  onClose,
  lines,
  transcriptionActive
}: MeetingTranscriptionSheetProps) => {
  const hardwareBackClose = useRef<() => void>(() => {
    onClose();
  });

  useEffect(() => {
    hardwareBackClose.current = () => onClose();
  }, [onClose]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={() => hardwareBackClose.current()}
    >
      <GestureHandlerRootView style={styles.safeFill}>
        <SafeAreaView style={styles.safeFill} edges={["top", "bottom", "left", "right"]}>
          <MeetingTranscriptionSheetBody
            onClose={onClose}
            lines={lines}
            transcriptionActive={transcriptionActive}
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
    backgroundColor: "#1e1f20",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden"
  },
  grabRow: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6
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
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  liveLabel: {
    opacity: 0.85
  },
  closeHit: {
    padding: padding.xs
  },
  list: {
    flex: 1,
    minHeight: 120
  },
  listContent: {
    paddingHorizontal: padding.md,
    paddingBottom: padding.lg,
    flexGrow: 1,
    gap: 10
  },
  emptyHint: {
    textAlign: "center",
    marginTop: padding.xl,
    opacity: 0.7
  },
  lineCard: {
    backgroundColor: "#2a2f34",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: padding.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)"
  },
  lineSender: {
    opacity: 0.78,
    marginBottom: 4
  },
  lineContent: {
    flexShrink: 1
  }
});
