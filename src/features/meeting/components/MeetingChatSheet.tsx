import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Dimensions,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
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
import { useMeetingSheetDragToClose } from "features/meeting/components/useMeetingSheetDragToClose.ts";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import SystemNavigationBar from "react-native-system-navigation-bar";
import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";
import { fontSize, padding } from "core/theme/theme.ts";
import type { MeetingChatMessage } from "features/meeting/meetingChatProtocol.ts";

const SHEET_FRACTION_CLOSED = 0.72;
const SHEET_MAX_CLOSED_CAP = 580;
const MAX_MESSAGE_CHARS = 4000;
/** Keep some space below the status bar/notch when expanded. */
const SHEET_TOP_GAP = 44;

export type MeetingChatSheetProps = {
  visible: boolean;
  onClose: () => void;
  messages: MeetingChatMessage[];
  onSend: (text: string) => void;
  /** Shown in input placeholder, e.g. display name */
  composerHint?: string;
  canSend: boolean;
  /** Daily local participant `session_id` — aligns bubbles left/right like web DM. */
  localSessionId: string;
};

type SheetBodyProps = Omit<MeetingChatSheetProps, "visible"> & {
  hardwareBackRef: React.MutableRefObject<() => void>;
};

const MeetingChatSheetBody = ({
  onClose,
  messages,
  onSend,
  composerHint,
  canSend,
  localSessionId,
  hardwareBackRef
}: SheetBodyProps) => {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const listRef = useRef<FlatList<MeetingChatMessage>>(null);
  const [draft, setDraft] = useState("");
  /** Track keyboard open to scroll-to-latest; don't use it for layout on Android. */
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  /** Android: keyboard height from events — used so sheet expansion doesn’t race `adjustResize`. */
  const [keyboardHeightAndroid, setKeyboardHeightAndroid] = useState(0);
  /**
   * Android Modals often ignore `adjustResize`. Compare last closed window height to current height:
   * leftover keyboard height becomes bottom padding so the sheet/composer sit above the keyboard
   * without double-offsetting when the window did resize.
   */
  const baselineWindowHeightRef = useRef(windowHeight);
  useEffect(() => {
    if (!isKeyboardOpen) {
      baselineWindowHeightRef.current = windowHeight;
    }
  }, [isKeyboardOpen, windowHeight]);

  const keyboardLiftAndroid = useMemo(() => {
    if (Platform.OS !== "android" || !isKeyboardOpen || keyboardHeightAndroid <= 0) {
      return 0;
    }
    const shrunkBy = Math.max(0, baselineWindowHeightRef.current - windowHeight);
    return Math.max(0, keyboardHeightAndroid - shrunkBy);
  }, [isKeyboardOpen, keyboardHeightAndroid, windowHeight]);

  /**
   * Use **window** height (not `Dimensions.get("screen")`) on Android. With `adjustResize`, the
   * window shrinks when the keyboard opens — if we size the sheet to full screen height, `maxHeight`
   * exceeds the visible modal area, `overflow: "hidden"` clips the **composer** off; after dismiss
   * layout can stay broken. Subtract `keyboardLiftAndroid` when the modal did not resize so sizing
   * matches the visible band above the keyboard.
   */
  const screenHeightForSheet =
    Platform.OS === "android" ? windowHeight - keyboardLiftAndroid : windowHeight;
  /**
   * Height available for sizing the sheet (below status bar).
   * On Android, do not subtract `insets.bottom` here — that reserve produced an empty strip above
   * the nav/gesture bar (same issue we fixed for the meeting “More actions” sheet). The composer
   * row already applies `paddingBottom` using `insets.bottom`.
   */
  const safeContentHeight = useMemo(() => {
    if (Platform.OS === "android") {
      return Math.max(1, screenHeightForSheet - insets.top);
    }
    return Math.max(1, screenHeightForSheet - insets.top - insets.bottom);
  }, [insets.bottom, insets.top, screenHeightForSheet]);

  /**
   * Android — keyboard closed: ~72% of window (capped). Keyboard open: expand toward the status-bar
   * guard so the sheet fills space above the keyboard and the composer stays visible.
   */
  const sheetHeight = useMemo(() => {
    const gap = 10;
    const topGuard = Math.max(SHEET_TOP_GAP, padding.lg);

    if (Platform.OS === "android") {
      const bottomPadKeyboard = padding.sm;
      const bottomPadClosed = insets.bottom;

      if (isKeyboardOpen) {
        const fromResize = Math.max(0, safeContentHeight - topGuard - gap);
        let expanded = fromResize;
        if (keyboardHeightAndroid > 0) {
          const screenH = Dimensions.get("screen").height;
          const fromKb = Math.max(
            0,
            screenH - keyboardHeightAndroid - insets.top - topGuard - gap
          );
          expanded = Math.min(fromResize, fromKb > 0 ? fromKb : fromResize);
        }
        return Math.max(300, expanded) + bottomPadKeyboard;
      }

      const maxClosedDynamic = Math.min(
        windowHeight * SHEET_FRACTION_CLOSED,
        SHEET_MAX_CLOSED_CAP
      );
      const maxAboveStatusBar = Math.max(0, safeContentHeight - topGuard - gap);
      const base = Math.max(
        260,
        Math.min(
          maxClosedDynamic,
          Math.max(0, safeContentHeight - gap),
          maxAboveStatusBar
        )
      );
      return base + bottomPadClosed;
    }

    const maxAboveStatusBar = Math.max(0, safeContentHeight - topGuard - gap);
    return Math.max(
      260,
      Math.min(
        Math.min(windowHeight * SHEET_FRACTION_CLOSED, SHEET_MAX_CLOSED_CAP),
        Math.max(0, safeContentHeight - gap),
        maxAboveStatusBar
      )
    );
  }, [
    safeContentHeight,
    insets.bottom,
    insets.top,
    isKeyboardOpen,
    keyboardHeightAndroid,
    windowHeight
  ]);

  const sheetHeightRef = useRef(sheetHeight);
  sheetHeightRef.current = sheetHeight;

  const translateY = useSharedValue(sheetHeight);
  const dragStartY = useSharedValue(0);
  const sheetMaxY = useSharedValue(sheetHeight);

  useEffect(() => {
    sheetMaxY.value = sheetHeight;
  }, [sheetHeight, sheetMaxY]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (e: {
      endCoordinates: { height: number; screenY?: number };
    }) => {
      if (Platform.OS === "android") {
        setKeyboardHeightAndroid(e.endCoordinates?.height ?? 0);
      }
      setIsKeyboardOpen(true);
      if (e.endCoordinates.height > 0) {
        requestAnimationFrame(() => {
          listRef.current?.scrollToEnd({ animated: true });
        });
      }
    };
    const onHide = () => {
      setIsKeyboardOpen(false);
      if (Platform.OS === "android") {
        setKeyboardHeightAndroid(0);
      }
    };
    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  useLayoutEffect(() => {
    const h = sheetHeightRef.current;
    translateY.value = h;
    translateY.value = withTiming(0, { duration: 240 });
  }, [translateY]);

  const { sheetPanGesture, closeAnimated } = useMeetingSheetDragToClose({
    translateY,
    sheetMaxY,
    dragStartY,
    onClose,
    enabled: !isKeyboardOpen
  });

  useLayoutEffect(() => {
    hardwareBackRef.current = closeAnimated;
  }, [closeAnimated, hardwareBackRef]);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }]
  }));

  const lastMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    if (messages.length === 0) return;
    const t = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(t);
  }, [lastMessageId, messages.length]);

  const placeholder = useMemo(
    () =>
      composerHint?.trim()
        ? `Message as ${composerHint.trim()}…`
        : "Message everyone…",
    [composerHint]
  );

  const submit = useCallback(() => {
    const t = draft.trim();
    if (!t || !canSend) return;
    onSend(t);
    setDraft("");
  }, [canSend, draft, onSend]);

  /** Nav/gesture inset when keyboard closed; keyboard open nav is usually hidden — keep small pad. */
  const composerBottomPad =
    Platform.OS === "android"
      ? isKeyboardOpen
        ? padding.sm
        : padding.md
      : Math.max(insets.bottom, padding.md);

  const sheetPaddingBottomAndroid =
    Platform.OS === "android"
      ? isKeyboardOpen
        ? padding.sm
        : insets.bottom
      : 0;

  const sheetBody = (
    <Reanimated.View
      style={[
        styles.sheet,
        {
          maxHeight: sheetHeight,
          paddingBottom: isKeyboardOpen ? sheetPaddingBottomAndroid + 40 : sheetPaddingBottomAndroid  + 10,
          flexGrow: 1,
          flexShrink: 1,
          flexDirection: "column"
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
              Chat
            </Text>
            <Pressable
              onPress={closeAnimated}
              hitSlop={12}
              style={styles.closeHit}
              accessibilityRole="button"
              accessibilityLabel="Close chat"
            >
              <Icon name="x-close" size={22} color="white" />
            </Pressable>
          </View>
        </View>
      </GestureDetector>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: padding.sm }]}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => {
          const mine = !!localSessionId && item.fromSessionId === localSessionId;
          const prev = index > 0 ? messages[index - 1] : null;
          const sameSender =
            !!prev && prev.fromSessionId === item.fromSessionId;
          const groupStarts = !sameSender;
          const showTheirName = !mine && groupStarts;
          const showYouLabel = mine && groupStarts;

          return (
            <View
              style={[
                styles.messageCluster,
                mine ? styles.messageClusterMine : styles.messageClusterTheirs,
                sameSender ? styles.messageClusterTight : styles.messageClusterGap
              ]}
            >
              {showTheirName ? (
                <Text
                  size={fontSize.xs}
                  weight="medium"
                  color="white"
                  style={styles.senderLabelTheirs}
                  numberOfLines={1}
                >
                  {item.senderName}
                </Text>
              ) : null}
              {showYouLabel ? (
                <Text
                  size={fontSize.xs}
                  weight="medium"
                  color="white"
                  style={styles.senderLabelMine}
                  numberOfLines={1}
                >
                  You
                </Text>
              ) : null}
              <View
                style={[
                  styles.bubble,
                  mine ? styles.bubbleMine : styles.bubbleTheirs
                ]}
              >
                <Text size={fontSize.sm} color="white" align="left" style={styles.bubbleText}>
                  {item.text}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text size={fontSize.sm} weight="medium" color="white" style={styles.emptyHint}>
            No messages yet. Say hi to the room.
          </Text>
        }
      />

      <View
        style={[
          styles.composerRow,
          {
            paddingBottom: composerBottomPad,
            alignItems: isKeyboardOpen ? "center" : "flex-end",
            borderTopWidth: isKeyboardOpen ? 1 : 0,
            paddingHorizontal: 14
          }
        ]}
      >
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.45)"
          multiline
          maxLength={MAX_MESSAGE_CHARS}
          editable={canSend}
          returnKeyType="default"
          blurOnSubmit={false}
          keyboardAppearance="dark"
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!draft.trim() || !canSend) && styles.sendButtonDisabled
          ]}
          onPress={submit}
          disabled={!draft.trim() || !canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Icon name="send-03" size={22} color="white" />
        </TouchableOpacity>
      </View>
    </Reanimated.View>
  );

  return (
    <View
      style={[
        styles.modalRoot,
        Platform.OS === "android" && keyboardLiftAndroid > 0
          ? { paddingBottom: keyboardLiftAndroid }
          : null
      ]}
    >
      {/* Android: backdrop tap was closing the sheet when opening the keyboard (layout/touch routing).
          Dismiss via header X or hardware back only. iOS keeps tap-outside to close. */}
      {Platform.OS === "android" ? (
        <View style={styles.backdrop} />
      ) : (
        <Pressable style={styles.backdrop} onPress={closeAnimated} />
      )}
      {/*
        Android: do NOT use KeyboardAvoidingView — MainActivity uses adjustResize, which already
        resizes the window. KAV + adjustResize double-shrinks and hides the sheet / composer.
        iOS: unchanged (plain sheet); keyboard overlays unless we add KAV later.
      */}
      {Platform.OS === "android" ? (
        <View style={styles.keyboardAvoid}>{sheetBody}</View>
      ) : (
        sheetBody
      )}
    </View>
  );
};

export const MeetingChatSheet = ({
  visible,
  onClose,
  messages,
  onSend,
  composerHint,
  canSend,
  localSessionId
}: MeetingChatSheetProps) => {
  const hardwareBackClose = useRef<() => void>(() => {
    onClose();
  });

  /**
   * Match `MeetingBottomControls` more-actions modal: immersive nav can reset inside Modal;
   * re-hide after mount so the sheet sits flush with the gesture/nav area (no gap strip).
   */
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (!visible) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void SystemNavigationBar.navigationHide().catch(() => {});
    };
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [visible]);

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
          style={styles.safeFill}
          // On Android, avoid adding extra top/bottom insets. The sheet itself manages top gap,
          // and `modalRoot` pads by keyboard height to sit on top of the keyboard.
          edges={Platform.OS === "android" ? ["left", "right"] : ["top", "bottom", "left", "right"]}
        >
          <MeetingChatSheetBody
            onClose={onClose}
            messages={messages}
            onSend={onSend}
            composerHint={composerHint}
            canSend={canSend}
            localSessionId={localSessionId}
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
  keyboardAvoid: {
    flex: 1,
    width: "100%",
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
  closeHit: {
    padding: padding.xs
  },
  list: {
    flex: 1,
    minHeight: 0
  },
  listContent: {
    paddingHorizontal: padding.md,
    flexGrow: 1
  },
  emptyHint: {
    textAlign: "center",
    marginTop: padding.xl,
    opacity: 0.7
  },
  messageCluster: {
    maxWidth: "78%"
  },
  messageClusterMine: {
    alignSelf: "flex-end",
    alignItems: "flex-end"
  },
  messageClusterTheirs: {
    alignSelf: "flex-start",
    alignItems: "flex-start"
  },
  messageClusterTight: {
    marginBottom: 4
  },
  messageClusterGap: {
    marginBottom: 14
  },
  senderLabelTheirs: {
    opacity: 0.55,
    marginBottom: 4,
    paddingHorizontal: 2,
    maxWidth: "100%"
  },
  senderLabelMine: {
    opacity: 0.45,
    marginBottom: 4,
    paddingHorizontal: 2,
    textAlign: "right",
    alignSelf: "flex-end"
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "100%"
  },
  bubbleMine: {
    backgroundColor: "#3f9df8",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 5
  },
  bubbleTheirs: {
    backgroundColor: "#2a2f34",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 5
  },
  bubbleText: {
    flexShrink: 1
  },
  composerRow: {
    flexDirection: "row",
    paddingHorizontal: padding.md,
    paddingTop: padding.sm,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
    minHeight: 72,
    flexShrink: 0
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#2a2f34",
    color: "#fff",
    fontSize: fontSize.sm
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#3f9df8",
    alignItems: "center",
    justifyContent: "center"
  },
  sendButtonDisabled: {
    opacity: 0.35
  }
});

