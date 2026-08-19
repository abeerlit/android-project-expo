import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  DailyMediaView,
  type DailyParticipant
} from "@daily-co/react-native-daily-js";
import Icon from "shared/components/Icon.tsx";
import { Text } from "shared/components/Text.tsx";
import { fontSize } from "core/theme/theme.ts";
import {
  MeetingReactionFloaters,
  type FloatingMeetingReaction
} from "features/meeting/components/MeetingReactionFloaters.tsx";
import { ScreenShareMainMediaView } from "features/meeting/components/ScreenShareMainMediaView.tsx";
import {
  dailyMediaViewZOrder,
  getAudioTrackForTile,
  getCameraTrackForTile,
  getScreenShareTrack,
  initialsFromUserName,
  participantHandRaised
} from "features/meeting/meetingParticipantTracks.ts";

type Props = {
  participant: DailyParticipant;
  onClose: () => void;
  noVideoBg: string;
  micMutedColor: string;
  floatingReactions: FloatingMeetingReaction[];
  /**
   * `sharedScreen` — fullscreen the **screen capture** (main share stage).
   * `camera` — fullscreen a participant **camera** (e.g. legacy rail use).
   */
  presentation: "sharedScreen" | "camera";
  /** Android screen-share black gate (open/close/start transitions). */
  videoReady?: boolean;
  layoutEpoch?: number;
  stageWidth?: number;
  stageHeight?: number;
  /**
   * Android fullscreen: keep opaque black over RTCView briefly after bind so
   * decoder warmup never flashes camera frames.
   */
  useFullscreenRevealCurtain?: boolean;
};

/** Extra black curtain after fullscreen RTCView mounts (decoder warmup). */
const ANDROID_SCREEN_SHARE_FULLSCREEN_REVEAL_MS = 420;

/**
 * `sharedScreen` — edge-to-edge inside in-stage overlay (Android) or Modal (iOS).
 * `camera` — centered in-app card (legacy / reuse).
 */
export const ScreenShareExpandedOverlay = ({
  participant,
  onClose,
  noVideoBg,
  micMutedColor,
  floatingReactions,
  presentation,
  videoReady = true,
  layoutEpoch = 0,
  stageWidth = 0,
  stageHeight = 0,
  useFullscreenRevealCurtain = false
}: Props) => {
  const insets = useSafeAreaInsets();
  const [revealCurtainVisible, setRevealCurtainVisible] = useState(
    useFullscreenRevealCurtain
  );
  const isScreen = presentation === "sharedScreen";
  const videoTrack = isScreen
    ? getScreenShareTrack(participant)
    : getCameraTrackForTile(participant);
  const hasVideo = videoTrack != null;
  const initials = initialsFromUserName(participant.user_name || "Guest");
  const showHandRaised = !isScreen && participantHandRaised(participant);
  const showMutedMic = !isScreen && participant.audio !== true;
  const fullscreenW = stageWidth > 0 ? stageWidth : undefined;
  const fullscreenH = stageHeight > 0 ? stageHeight : undefined;

  useEffect(() => {
    if (!useFullscreenRevealCurtain || Platform.OS !== "android" || !isScreen) {
      setRevealCurtainVisible(false);
      return;
    }
    if (!videoReady) {
      setRevealCurtainVisible(true);
      return;
    }
    setRevealCurtainVisible(true);
    const timer = setTimeout(() => {
      setRevealCurtainVisible(false);
    }, ANDROID_SCREEN_SHARE_FULLSCREEN_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [isScreen, layoutEpoch, useFullscreenRevealCurtain, videoReady]);

  /** Fills a full-bleed host — no centered “card”. */
  if (isScreen) {
    return (
      <View style={styles.screenFullscreenRoot} pointerEvents="box-none">
        <Pressable
          style={styles.screenFullscreenDismissLayer}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close fullscreen screen share"
        />
        <View style={styles.screenFullscreenVideoSlot} pointerEvents="box-none">
          {Platform.OS === "android" &&
          fullscreenW != null &&
          fullscreenH != null ? (
            <ScreenShareMainMediaView
              videoTrack={videoTrack}
              width={fullscreenW}
              height={fullscreenH}
              videoReady={videoReady}
              layoutEpoch={layoutEpoch}
            />
          ) : (
            <DailyMediaView
              pointerEvents="none"
              zOrder={dailyMediaViewZOrder(false)}
              style={StyleSheet.absoluteFillObject}
              mirror={false}
              objectFit="contain"
              videoTrack={videoTrack}
              audioTrack={null}
            />
          )}
          {!hasVideo ||
          (Platform.OS === "android" && !videoReady) ||
          revealCurtainVisible ? (
            <View
              style={[styles.noVideoOverlay, { backgroundColor: "#000" }]}
              pointerEvents="none"
            >
              {!hasVideo ? (
                <View style={styles.initialsCircle}>
                  <Text size={fontSize.xl} weight="semiBold" color="white">
                    {initials}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <MeetingReactionFloaters
            variant="tile"
            items={floatingReactions.filter(
              (r) => r.fromSessionId === participant.session_id
            )}
          />
        </View>
        <Pressable
          style={[
            styles.closeBtn,
            {
              top: Math.max(insets.top, 8) + 4,
              right: Math.max(insets.right, 10)
            }
          ]}
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close fullscreen screen share"
        >
          <Icon name="x-close" size={22} color="white" />
        </Pressable>
        <View
          style={[styles.badge, { bottom: Math.max(insets.bottom, 12) + 10 }]}
          pointerEvents="none"
        >
          <Text size={fontSize.sm} weight="medium" color="white">
            {(participant.user_name || "Guest") + " — Screen"}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.card, styles.cardCentered]} pointerEvents="box-none">
        <Pressable
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close expanded video"
        >
          <Icon name="x-close" size={22} color="white" />
        </Pressable>
        <View style={styles.videoShell}>
          <DailyMediaView
            style={styles.video}
            mirror={participant.local}
            objectFit="cover"
            zOrder={dailyMediaViewZOrder(participant.local)}
            videoTrack={videoTrack}
            audioTrack={getAudioTrackForTile(participant)}
          />
          {!hasVideo ? (
            <View
              style={[styles.noVideoOverlay, { backgroundColor: noVideoBg }]}
              pointerEvents="none"
            >
              <View style={styles.initialsCircle}>
                <Text size={fontSize.xl} weight="semiBold" color="white">
                  {initials}
                </Text>
              </View>
            </View>
          ) : null}
          {showHandRaised ? (
            <View style={styles.handRaisedPill} pointerEvents="none">
              <Icon name="hand" size={16} color="#8ab4f8" />
            </View>
          ) : null}
          {showMutedMic ? (
            <View style={styles.micPill} pointerEvents="none">
              <Icon name="microphone-off-02" size={16} color={micMutedColor} />
            </View>
          ) : null}
          <View style={styles.badge} pointerEvents="none">
            <Text size={fontSize.sm} weight="medium" color="white">
              {(participant.user_name || "Guest") +
                (participant.local ? " (You)" : "")}
            </Text>
          </View>
          <MeetingReactionFloaters
            variant="tile"
            items={floatingReactions.filter(
              (r) => r.fromSessionId === participant.session_id
            )}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screenFullscreenRoot: {
    flex: 1,
    width: "100%",
    backgroundColor: "#000"
  },
  screenFullscreenDismissLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0
  },
  screenFullscreenVideoSlot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    backgroundColor: "#000"
  },
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    justifyContent: "center",
    alignItems: "center",
    padding: 16
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  card: {
    overflow: "hidden",
    backgroundColor: "#0f172a"
  },
  cardCentered: {
    width: "100%",
    height: "100%",
    maxWidth: 720,
    maxHeight: "88%",
    borderRadius: 14
  },
  closeBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 20,
    padding: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
    elevation: 24
  },
  videoShell: {
    flex: 1,
    width: "100%",
    minHeight: 0
  },
  video: {
    ...StyleSheet.absoluteFillObject
  },
  noVideoOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center"
  },
  initialsCircle: {
    width: 120,
    height: 120,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.55)"
  },
  micPill: {
    position: "absolute",
    top: 48,
    right: 12,
    zIndex: 4,
    padding: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)"
  },
  handRaisedPill: {
    position: "absolute",
    top: 48,
    left: 12,
    zIndex: 4,
    padding: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)"
  },
  badge: {
    position: "absolute",
    bottom: 12,
    left: 12,
    zIndex: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.45)"
  }
});
