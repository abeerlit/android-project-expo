import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  PanResponder,
  Platform,
  StyleSheet,
  View
} from "react-native";
import type { DailyParticipant } from "@daily-co/react-native-daily-js";
import { LocalMeetingPiPMediaView } from "features/meeting/components/LocalMeetingPiPMediaView.tsx";
import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";
import { fontSize } from "core/theme/theme.ts";
import {
  LOCAL_PIP_ANDROID_SHADOW_PAD,
  LOCAL_PIP_HEIGHT,
  LOCAL_PIP_MARGIN,
  LOCAL_PIP_WIDTH,
  MEETING_BOTTOM_CONTROLS_ESTIMATE,
  MEETING_HEADER_HEIGHT,
  MEETING_TILE_BORDER_RADIUS,
  MEETING_TILE_SURFACE_BG
} from "features/meeting/meetingLayout.ts";
import {
  MeetingReactionFloaters,
  type FloatingMeetingReaction
} from "features/meeting/components/MeetingReactionFloaters.tsx";
import {
  getCameraTrackForTile,
  initialsFromUserName
} from "features/meeting/meetingParticipantTracks.ts";

export type LocalMeetingPiPOverlayProps = {
  visible: boolean;
  stageWidth: number;
  stageHeight: number;
  windowWidth: number;
  windowHeight: number;
  localParticipant: DailyParticipant;
  displayName: string;
  noVideoBg: string;
  micMutedColor: string;
  localHandRaise: boolean;
  localScreenSharing: boolean;
  floatingReactions: FloatingMeetingReaction[];
  remotesPresent: boolean;
  clipRefreshKey?: string;
};

/**
 * Local PiP chrome — mirrors ios-project `localPiPShadow` + `localPiPContent` +
 * `DailyMediaView` when solo; Android stacked `RTCView` when remotes are present.
 */
export const LocalMeetingPiPOverlay = ({
  visible,
  stageWidth,
  stageHeight,
  windowWidth,
  windowHeight,
  localParticipant,
  displayName,
  noVideoBg,
  micMutedColor,
  localHandRaise,
  localScreenSharing,
  floatingReactions,
  remotesPresent,
  clipRefreshKey
}: LocalMeetingPiPOverlayProps) => {
  const pipPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const pipCurrentRef = useRef({ x: 0, y: 0 });
  const pipDraggedRef = useRef(false);

  const pipCameraTrack = getCameraTrackForTile(localParticipant);

  const getPiPBounds = useCallback(() => {
    const pipPad =
      Platform.OS === "android" ? LOCAL_PIP_ANDROID_SHADOW_PAD * 2 : 0;
    const pipOuterW = LOCAL_PIP_WIDTH + pipPad;
    const pipOuterH = LOCAL_PIP_HEIGHT + pipPad;
    const w = stageWidth > 0 ? stageWidth : Math.max(1, windowWidth);
    const h =
      stageHeight > 0
        ? stageHeight
        : Math.max(
            180,
            windowHeight -
              MEETING_HEADER_HEIGHT -
              MEETING_BOTTOM_CONTROLS_ESTIMATE
          );
    const maxX = Math.max(LOCAL_PIP_MARGIN, w - pipOuterW - LOCAL_PIP_MARGIN);
    const maxY = Math.max(LOCAL_PIP_MARGIN, h - pipOuterH - LOCAL_PIP_MARGIN);
    return {
      minX: LOCAL_PIP_MARGIN,
      maxX,
      minY: LOCAL_PIP_MARGIN,
      maxY
    };
  }, [stageHeight, stageWidth, windowHeight, windowWidth]);

  const snapPiPToNearestCorner = useCallback(() => {
    const { minX, maxX, minY, maxY } = getPiPBounds();
    const current = {
      x: Math.max(minX, Math.min(maxX, pipCurrentRef.current.x)),
      y: Math.max(minY, Math.min(maxY, pipCurrentRef.current.y))
    };
    pipCurrentRef.current = current;
    const targetX =
      Math.abs(current.x - minX) <= Math.abs(current.x - maxX) ? minX : maxX;
    const targetY =
      Math.abs(current.y - minY) <= Math.abs(current.y - maxY) ? minY : maxY;
    pipCurrentRef.current = { x: targetX, y: targetY };
    Animated.spring(pipPosition, {
      toValue: { x: targetX, y: targetY },
      bounciness: 0,
      speed: 20,
      useNativeDriver: false
    }).start();
  }, [getPiPBounds, pipPosition]);

  useEffect(() => {
    if (!visible || stageWidth <= 0 || stageHeight <= 0) {
      return;
    }
    const { minX, maxX, minY, maxY } = getPiPBounds();
    const defaultX = maxX;
    const defaultY = maxY;
    if (!pipDraggedRef.current) {
      pipCurrentRef.current = { x: defaultX, y: defaultY };
      pipPosition.setValue(pipCurrentRef.current);
      return;
    }
    const clampedX = Math.max(minX, Math.min(maxX, pipCurrentRef.current.x));
    const clampedY = Math.max(minY, Math.min(maxY, pipCurrentRef.current.y));
    if (
      clampedX !== pipCurrentRef.current.x ||
      clampedY !== pipCurrentRef.current.y
    ) {
      pipCurrentRef.current = { x: clampedX, y: clampedY };
      pipPosition.setValue(pipCurrentRef.current);
    }
  }, [
    getPiPBounds,
    pipPosition,
    stageHeight,
    stageWidth,
    visible,
    windowHeight,
    windowWidth
  ]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => visible,
        onMoveShouldSetPanResponder: () => visible,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          pipPosition.stopAnimation();
          pipPosition.setOffset({
            x: pipCurrentRef.current.x,
            y: pipCurrentRef.current.y
          });
          pipPosition.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: Animated.event(
          [null, { dx: pipPosition.x, dy: pipPosition.y }],
          { useNativeDriver: false }
        ),
        onPanResponderRelease: (_, gesture) => {
          pipPosition.flattenOffset();
          const { minX, maxX, minY, maxY } = getPiPBounds();
          const next = {
            x: Math.max(
              minX,
              Math.min(maxX, pipCurrentRef.current.x + gesture.dx)
            ),
            y: Math.max(
              minY,
              Math.min(maxY, pipCurrentRef.current.y + gesture.dy)
            )
          };
          pipCurrentRef.current = next;
          pipPosition.setValue(next);
          pipDraggedRef.current = true;
          snapPiPToNearestCorner();
        },
        onPanResponderTerminate: () => {
          pipPosition.flattenOffset();
          pipPosition.stopAnimation(({ x, y }) => {
            const { minX, maxX, minY, maxY } = getPiPBounds();
            const next = {
              x: Math.max(minX, Math.min(maxX, x)),
              y: Math.max(minY, Math.min(maxY, y))
            };
            pipCurrentRef.current = next;
            pipPosition.setValue(next);
            pipDraggedRef.current = true;
            snapPiPToNearestCorner();
          });
        }
      }),
    [getPiPBounds, pipPosition, snapPiPToNearestCorner, visible]
  );

  const localReactions = useMemo(
    () =>
      floatingReactions.filter(
        (r) => r.fromSessionId === localParticipant.session_id
      ),
    [floatingReactions, localParticipant.session_id]
  );

  if (!visible) {
    return null;
  }

  /** Stacked `RTCView` uses native SurfaceView clip — parent `overflow` must stay off. */
  const androidStackedPiP = Platform.OS === "android" && remotesPresent;

  return (
    <Animated.View
      style={[
        styles.shadow,
        androidStackedPiP ? styles.pipStackedShell : styles.pipClip,
        {
          left: pipPosition.x,
          top: pipPosition.y
        }
      ]}
      collapsable={false}
      renderToHardwareTextureAndroid={
        Platform.OS === "android" && !androidStackedPiP
      }
      pointerEvents="box-none"
      {...panResponder.panHandlers}
    >
      <View style={styles.content}>
        <LocalMeetingPiPMediaView
          style={styles.video}
          mirror
          localParticipant={localParticipant}
          remotesPresent={remotesPresent}
          clipRefreshKey={clipRefreshKey}
        />
        {pipCameraTrack == null ? (
          <View
            style={[
              styles.noVideoOverlay,
              { backgroundColor: noVideoBg },
              androidStackedPiP && styles.noVideoOverlayStacked
            ]}
            pointerEvents="none"
          >
            <View style={styles.initialsCircle}>
              <Text size={fontSize.lg} weight="semiBold" color="white">
                {initialsFromUserName(displayName)}
              </Text>
            </View>
          </View>
        ) : null}
        {localHandRaise ? (
          <View style={styles.handRaisedPill} pointerEvents="none">
            <Icon name="hand" size={12} color="#8ab4f8" />
          </View>
        ) : null}
        <View style={styles.topRightStack} pointerEvents="none">
          {localScreenSharing ? (
            <View style={styles.screenSharePill}>
              <Icon name="monitor-03" size={12} color="white" />
            </View>
          ) : null}
          {localParticipant.audio !== true ? (
            <View style={styles.micPill}>
              <Icon name="microphone-off-02" size={12} color={micMutedColor} />
            </View>
          ) : null}
        </View>
        <View style={styles.badge}>
          <Text size={fontSize.xs} weight="medium" color="white">
            You
          </Text>
        </View>
        {/* <MeetingReactionFloaters variant="tile" items={localReactions} /> */}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  shadow: {
    position: "absolute",
    zIndex: 20,
    width: LOCAL_PIP_WIDTH,
    height: LOCAL_PIP_HEIGHT,
    ...Platform.select({
      android: { elevation: 8 },
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.7,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 }
      }
    })
  },
  /** DailyMediaView / iOS — normal View clipping works. */
  pipClip: {
    borderRadius: MEETING_TILE_BORDER_RADIUS,
    overflow: "hidden",
    ...Platform.select({
      android: { backgroundColor: "transparent" },
      default: { backgroundColor: MEETING_TILE_SURFACE_BG }
    })
  },
  /** Android stacked RTCView — transparent shell; native clip + hairline edge ring. */
  pipStackedShell: {
    backgroundColor: "transparent",
    borderRadius: MEETING_TILE_BORDER_RADIUS
  },
  content: {
    flex: 1,
    backgroundColor: "transparent"
  },
  noVideoOverlayStacked: {
    borderRadius: MEETING_TILE_BORDER_RADIUS,
    overflow: "hidden"
  },
  video: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1
  },
  noVideoOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center"
  },
  initialsCircle: {
    width: 60,
    height: 60,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.55)"
  },
  handRaisedPill: {
    position: "absolute",
    top: 4,
    left: 4,
    zIndex: 4,
    padding: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)"
  },
  topRightStack: {
    position: "absolute",
    top: 4,
    right: 4,
    zIndex: 4,
    alignItems: "flex-end",
    gap: 4
  },
  screenSharePill: {
    padding: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)"
  },
  micPill: {
    padding: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)"
  },
  badge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    zIndex: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.5)"
  }
});
