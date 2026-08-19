import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle
} from "react-native";
import {
  GestureHandlerRootView
} from "react-native-gesture-handler";
import {
  MEETING_SHEET_SWIPE_CLOSE_TRANSLATION_Y,
  MEETING_SHEET_SWIPE_CLOSE_VELOCITY_Y
} from "features/meeting/components/useMeetingSheetDragToClose.ts";
import SystemNavigationBar from "react-native-system-navigation-bar";
import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";
import { fontSize, padding } from "core/theme/theme.ts";
import { MEETING_REACTION_EMOJIS } from "features/meeting/meetingReactionEmojis.ts";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const WIN_H = Dimensions.get("window").height;
const MORE_SHEET_HEIGHT = Math.min(WIN_H * 0.48, 400);

const ControlButton = ({
  onPress,
  style,
  disabled,
  icon,
  isActive = false,
  activeBackgroundColor,
  inactiveBackgroundColor,
  activeBorderRadius = 15,
  inactiveBorderRadius = 15,
  iconColor
}: {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  disabled: boolean;
  icon: string;
  isActive?: boolean;
  activeBackgroundColor: string;
  inactiveBackgroundColor: string;
  activeBorderRadius?: number;
  inactiveBorderRadius?: number;
  iconColor?: string;
}) => {
  const animation = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animation, {
      toValue: isActive ? 1 : 0,
      duration: 220,
      useNativeDriver: false
    }).start();
  }, [animation, isActive]);

  const backgroundColor = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [inactiveBackgroundColor, activeBackgroundColor]
  });
  const borderRadius = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [inactiveBorderRadius, activeBorderRadius]
  });
  return (
    <Animated.View
      style={[styles.controlButton, { backgroundColor, borderRadius }, style]}
    >
      <TouchableOpacity
        style={styles.controlButtonPress}
        onPress={onPress}
        disabled={disabled}
      >
        <Icon
          name={icon}
          size={22}
          color={iconColor ?? (isActive ? "white" : "black")}
        />
      </TouchableOpacity>
    </Animated.View>
  );
};

export type MeetingBottomControlsProps = {
  joined: boolean;
  audioOn: boolean;
  videoOn: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  localScreenSharing: boolean;
  onToggleScreenShare: () => void;
  localHandRaise: boolean;
  onToggleRaiseHand: () => void;
  onSelectReaction: (emoji: string) => void;
  showTranscriptionButton: boolean;
  /** Opens the in-meeting transcript sheet (final caption lines). */
  onOpenTranscriptionSheet?: () => void;
  onAddOthers?: () => void;
  onLeave: () => void;
  onOpenMeetingChat?: () => void;
  borderSecondary: string;
  reactionPanelBg: string;
};

export const MeetingBottomControls = ({
  joined,
  audioOn,
  videoOn,
  onToggleAudio,
  onToggleVideo,
  localScreenSharing: _localScreenSharing,
  onToggleScreenShare: _onToggleScreenShare,
  localHandRaise,
  onToggleRaiseHand,
  onSelectReaction,
  showTranscriptionButton,
  onOpenTranscriptionSheet,
  onAddOthers,
  onLeave,
  onOpenMeetingChat,
  borderSecondary,
  reactionPanelBg
}: MeetingBottomControlsProps) => {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const moreSheetY = useRef(new Animated.Value(MORE_SHEET_HEIGHT)).current;

  const disabled = !joined;
  const localScreenSharing = _localScreenSharing;
  const onToggleScreenShare = _onToggleScreenShare;

  // Responsive sizing: shrink buttons on small devices; if still tight, move Reactions into "More".
  const showReactionsInRow = windowWidth >= 360;
  const baseWrapWidth = windowWidth * 0.9;
  const dividerWidth = 3 + (windowWidth < 360 ? 6 : 10);
  const leftButtonsCount = 2 /* video+audio */ + (showReactionsInRow ? 1 : 0) + 1 /* more */;
  const minBtn = 44;
  const maxBtn = 60;
  const availableForLeftButtons =
    baseWrapWidth -
    padding.md /* barRow paddingRight */ -
    padding.md /* scrollArea paddingLeft */ -
    dividerWidth -
    minBtn /* reserve space for Leave */;
  const computedBtnW = Math.floor(availableForLeftButtons / Math.max(1, leftButtonsCount));
  const btnW = Math.max(minBtn, Math.min(maxBtn, computedBtnW));
  const tight = btnW <= 46;
  const buttonMarginH = tight ? 2 : padding.xs;

  /** Slide distance matches sheet height incl. bottom inset (Android modal/safe-area timing). */
  const moreSheetTravel = MORE_SHEET_HEIGHT + insets.bottom;

  /**
   * Modal windows reset immersive nav hide; re-apply after mount so the bar does not flash.
   * Safe-area insets for the modal also settle a frame later — padding uses `insets.bottom` on the sheet.
   */
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (!moreActionsOpen && !reactionsOpen) return;
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
  }, [moreActionsOpen, reactionsOpen]);

  useEffect(() => {
    if (!moreActionsOpen) return;
    const travel = MORE_SHEET_HEIGHT + insets.bottom;
    moreSheetY.setValue(travel);
    Animated.timing(moreSheetY, {
      toValue: 0,
      duration: 240,
      useNativeDriver: true
    }).start();
    // Only run when opening / closing the sheet, not when safe-area insets catch up mid-open.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omit insets.bottom
  }, [moreActionsOpen, moreSheetY]);

  const closeMoreActions = () => {
    Animated.timing(moreSheetY, {
      toValue: moreSheetTravel,
      duration: 220,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) {
        setMoreActionsOpen(false);
      }
    });
  };

  const moreDragStartY = useRef(0);
  const morePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 6 && Math.abs(gesture.dx) < 24,
      onPanResponderGrant: () => {
        moreSheetY.stopAnimation((value) => {
          moreDragStartY.current = value;
        });
      },
      onPanResponderMove: (_, gesture) => {
        const nextY = moreDragStartY.current + Math.max(0, gesture.dy);
        moreSheetY.setValue(Math.min(nextY, moreSheetTravel));
      },
      onPanResponderRelease: (_, gesture) => {
        const shouldClose =
          gesture.dy > MEETING_SHEET_SWIPE_CLOSE_TRANSLATION_Y ||
          gesture.vy > MEETING_SHEET_SWIPE_CLOSE_VELOCITY_Y;
        if (shouldClose) {
          closeMoreActions();
          return;
        }
        Animated.spring(moreSheetY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 300
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(moreSheetY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 300
        }).start();
      }
    })
  ).current;

  const onPressRaiseHand = () => {
    onToggleRaiseHand();
  };

  const openTranscriptionSheetFromMore = () => {
    if (!onOpenTranscriptionSheet) return;
    Animated.timing(moreSheetY, {
      toValue: moreSheetTravel,
      duration: 220,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) {
        setMoreActionsOpen(false);
        onOpenTranscriptionSheet();
      }
    });
  };

  const openAddOthersFromMore = () => {
    if (!onAddOthers) return;
    Animated.timing(moreSheetY, {
      toValue: moreSheetTravel,
      duration: 220,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) {
        setMoreActionsOpen(false);
        onAddOthers();
      }
    });
  };

  const openMeetingChatFromMore = () => {
    if (!onOpenMeetingChat) return;
    Animated.timing(moreSheetY, {
      toValue: moreSheetTravel,
      duration: 220,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) {
        setMoreActionsOpen(false);
        onOpenMeetingChat();
      }
    });
  };

  const openReactionsFromMore = () => {
    Animated.timing(moreSheetY, {
      toValue: moreSheetTravel,
      duration: 220,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) {
        setMoreActionsOpen(false);
        setReactionsOpen(true);
      }
    });
  };

  const toggleScreenShareFromMore = () => {
    Animated.timing(moreSheetY, {
      toValue: moreSheetTravel,
      duration: 220,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) {
        setMoreActionsOpen(false);
        onToggleScreenShare();
      }
    });
  };

  return (
    <View
      style={[
        styles.wrap,
        { borderTopColor: borderSecondary, marginBottom: Math.max(insets.bottom, 20) }
      ]}
    >
      <View style={styles.barRow}>
        <View style={styles.scrollArea}>
          <ControlButton
            onPress={onToggleVideo}
            disabled={disabled}
            icon={videoOn ? "video-recorder" : "video-recorder-off"}
            isActive={videoOn}
            activeBackgroundColor="#333537"
            inactiveBackgroundColor="#f2b8b5"
            inactiveBorderRadius={15}
            activeBorderRadius={30}
            style={{ width: btnW, marginHorizontal: buttonMarginH }}
          />
          <ControlButton
            onPress={onToggleAudio}
            disabled={disabled}
            icon={audioOn ? "microphone-02" : "microphone-off-02"}
            isActive={audioOn}
            activeBackgroundColor="#333537"
            inactiveBackgroundColor="#f2b8b5"
            inactiveBorderRadius={15}
            activeBorderRadius={30}
            style={{ width: btnW, marginHorizontal: buttonMarginH }}
          />
          {showReactionsInRow ? (
            <ControlButton
              onPress={() => setReactionsOpen(true)}
              disabled={disabled}
              icon="face-smile"
              activeBackgroundColor="#f2b8b5"
              inactiveBackgroundColor="#333537"
              activeBorderRadius={30}
              inactiveBorderRadius={50}
              iconColor="white"
              style={{ width: btnW, marginHorizontal: buttonMarginH }}
            />
          ) : null}

          <TouchableOpacity
            style={[
              styles.controlButton,
              {
                backgroundColor: "#333537",
                width: 30,
                marginHorizontal: buttonMarginH
              }
            ]}
            onPress={() => setMoreActionsOpen(true)}
            disabled={disabled}
          >
            <Icon name="dots-vertical" size={22} color="white" />
          </TouchableOpacity>

          <View
            style={{
              width: 3,
              height: 35,
              backgroundColor: "#333537",
              marginLeft: windowWidth < 360 ? 6 : 10,
              alignSelf: "center"
            }}
          />
        </View>

        <ControlButton
          onPress={onLeave}
          disabled={disabled}
          icon="phone-hang-up"
          activeBackgroundColor="#b91c1c"
          inactiveBackgroundColor="#b91c1c"
          isActive
          style={{ borderRadius: 50, width: btnW, marginHorizontal: buttonMarginH }}
        />
      </View>

      <Modal
        visible={reactionsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReactionsOpen(false)}
      >
        <Pressable
          style={styles.reactionBackdrop}
          onPress={() => setReactionsOpen(false)}
        >
          <Pressable
            style={[styles.reactionGrid, { backgroundColor: "#1e1f20" }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.emojiRow}>
              {MEETING_REACTION_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.emojiCell}
                  onPress={() => {
                    onSelectReaction(emoji);
                  }}
                >
                  <Text size={fontSize.lg}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {moreActionsOpen ? (
        <Modal
          visible={moreActionsOpen}
          transparent
          animationType="none"
          statusBarTranslucent
          onRequestClose={closeMoreActions}
        >
          <GestureHandlerRootView style={styles.moreRoot}>
            <Pressable style={styles.moreBackdrop} onPress={closeMoreActions} />
            <Animated.View
              style={[
                styles.moreSheet,
                {
                  transform: [{ translateY: moreSheetY }],
                  height: MORE_SHEET_HEIGHT + insets.bottom,
                  paddingBottom: padding.xl + insets.bottom
                }
              ]}
            >
              <View style={styles.moreGrabRow} {...morePanResponder.panHandlers}>
                <View style={styles.moreGrab} />
              </View>

              <TouchableOpacity
                style={[
                  styles.moreAction,
                  localHandRaise ? styles.moreActionActive : null,
                  {
                    width: "90%",
                    alignSelf: "center",
                    borderRadius: 30,
                    justifyContent: "center",
                    alignItems: "center"
                  }
                ]}
                onPress={onPressRaiseHand}
                disabled={disabled}
              >
                <Icon name="hand" size={18} color="white" />
              </TouchableOpacity>

              <View style={styles.moreGrid}>
                {!showReactionsInRow ? (
                  <TouchableOpacity
                    style={[
                      styles.moreAction,
                      {
                        borderRadius: 30,
                        justifyContent: "center",
                        alignItems: "center"
                      }
                    ]}
                    onPress={openReactionsFromMore}
                    disabled={disabled}
                  >
                    <Icon name="face-smile" size={18} color="white" />
                    <Text size={12} weight="semiBold" style={styles.ccText}>
                      Reactions
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[
                    styles.moreAction,
                    localScreenSharing ? styles.moreActionActive : null,
                    { borderRadius: 30, justifyContent: "center", alignItems: "center" }
                  ]}
                  onPress={toggleScreenShareFromMore}
                  disabled={disabled}
                >
                  <Icon name="monitor-03" size={18} color="white" />
                </TouchableOpacity>
                {showTranscriptionButton && onOpenTranscriptionSheet ? (
                  <TouchableOpacity
                    style={[
                      styles.moreAction,
                      { borderRadius: 30, justifyContent: "center", alignItems: "center" }
                    ]}
                    onPress={openTranscriptionSheetFromMore}
                    disabled={disabled}
                  >
                    <View style={styles.ccBadge}>
                      <Text size={10} weight="semiBold" style={styles.ccText}>
                        CC
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[
                    styles.moreAction,
                    {
                      borderRadius: 30,
                      justifyContent: "center",
                      alignItems: "center"
                    }
                  ]}
                  onPress={openAddOthersFromMore}
                  disabled={disabled}
                >
                  <Icon name="user-plus-01" size={18} color="white" />
                  <Text size={12} weight="semiBold" style={styles.ccText}>
                    Add others
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.moreAction,
                    {
                      borderRadius: 30,
                      justifyContent: "center",
                      alignItems: "center"
                    }
                  ]}
                  onPress={openMeetingChatFromMore}
                  disabled={disabled || !onOpenMeetingChat}
                >
                  <Icon name="message-text-square-01" size={18} color="white" />
                  <Text size={12} weight="semiBold" style={styles.ccText}>
                    Chat
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </GestureHandlerRootView>
        </Modal>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#1e1f20",
    width: "90%",
    borderRadius: 20,
    alignSelf: "center"
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: padding.md
  },
  scrollArea: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    paddingLeft: padding.md,
    paddingVertical: padding.lg
  },
  controlButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    height: 50,
    width: 60,
    marginHorizontal: padding.xs
  },
  controlButtonPress: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center"
  },
  reactionBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
    paddingBottom: 120,
    paddingHorizontal: padding.md
  },
  reactionGrid: {
    borderRadius: 16,
    padding: padding.md,
    paddingVertical: padding.lg
  },
  emojiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  emojiCell: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#333537"
  },
  moreRoot: {
    flex: 1,
    justifyContent: "flex-end"
  },
  moreBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.55)"
  },
  moreSheet: {
    backgroundColor: "#1f1f21",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: padding.md
  },
  moreGrabRow: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 12
  },
  moreGrab: {
    width: 42,
    height: 4,
    borderRadius: 4,
    backgroundColor: "#3a3f44"
  },
  moreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 15,
    paddingHorizontal: 15
  },
  moreAction: {
    width: "48%",
    minHeight: 70,
    borderRadius: 22,
    backgroundColor: "#2a2f34",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  moreActionActive: {
    backgroundColor: "#3f9df8"
  },
  ccBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "white",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4
  },
  ccText: {
    color: "white",
    lineHeight: 14
  }
});

