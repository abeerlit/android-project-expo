import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { DailyMediaView } from "@daily-co/react-native-daily-js";
import {
  MediaStream,
  RTCView,
  type MediaStreamTrack
} from "@daily-co/react-native-webrtc";
import { MEETING_TILE_BORDER_RADIUS } from "features/meeting/meetingLayout.ts";
import { dailyMediaViewZOrder } from "features/meeting/meetingParticipantTracks.ts";

export type MeetingTileMediaViewProps = {
  videoTrack: MediaStreamTrack | null;
  audioTrack?: MediaStreamTrack | null;
  mirror?: boolean;
  objectFit?: "cover" | "contain";
  local?: boolean;
  width: number;
  height: number;
  /** Bumps native clip after presentation / layout transitions (Android). */
  layoutEpoch?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Small meeting tiles (screen-share rail, grid cells).
 * Android: fixed-size `RTCView` + `clipRevision` avoids zoom/crop corruption
 * after fullscreen or layout changes. iOS: `DailyMediaView`.
 */
export const MeetingTileMediaView = ({
  videoTrack,
  audioTrack = null,
  mirror = false,
  objectFit = "cover",
  local = false,
  width,
  height,
  layoutEpoch = 0,
  borderRadius = MEETING_TILE_BORDER_RADIUS,
  style
}: MeetingTileMediaViewProps) => {
  if (Platform.OS !== "android") {
    return (
      <DailyMediaView
        style={
          style != null
            ? StyleSheet.flatten([StyleSheet.absoluteFillObject, style])
            : StyleSheet.absoluteFillObject
        }
        mirror={mirror}
        objectFit={objectFit}
        zOrder={dailyMediaViewZOrder(local)}
        videoTrack={videoTrack}
        audioTrack={audioTrack}
      />
    );
  }

  return (
    <AndroidTileMediaView
      videoTrack={videoTrack}
      audioTrack={audioTrack}
      mirror={mirror}
      objectFit={objectFit}
      width={width}
      height={height}
      layoutEpoch={layoutEpoch}
      borderRadius={borderRadius}
      style={style}
    />
  );
};

type AndroidTileMediaViewProps = {
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  mirror: boolean;
  objectFit: "cover" | "contain";
  width: number;
  height: number;
  layoutEpoch: number;
  borderRadius: number;
  style?: StyleProp<ViewStyle>;
};

const AndroidTileMediaView = ({
  videoTrack,
  audioTrack,
  mirror,
  objectFit,
  width,
  height,
  layoutEpoch,
  borderRadius,
  style
}: AndroidTileMediaViewProps) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [clipRevision, setClipRevision] = useState(0);
  const prevEpochRef = useRef(layoutEpoch);
  const prevSizeRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const tracks = [videoTrack, audioTrack].filter(
      (t): t is MediaStreamTrack => t != null
    );
    setStream(tracks.length > 0 ? new MediaStream(tracks) : null);
  }, [videoTrack, audioTrack]);

  useEffect(() => {
    if (stream) {
      setClipRevision((r) => r + 1);
    }
  }, [stream]);

  useEffect(() => {
    const w = Math.round(width);
    const h = Math.round(height);
    const prev = prevSizeRef.current;
    if (prev.width === w && prev.height === h) {
      return;
    }
    prevSizeRef.current = { width: w, height: h };
    if (w >= 1 && h >= 1) {
      setClipRevision((r) => r + 1);
    }
  }, [width, height]);

  useEffect(() => {
    if (layoutEpoch === prevEpochRef.current) {
      return;
    }
    prevEpochRef.current = layoutEpoch;
    setClipRevision((r) => r + 1);
  }, [layoutEpoch]);

  if (width < 1 || height < 1) {
    return null;
  }

  return (
    <View
      style={[{ width, height }, style]}
      collapsable={false}
      pointerEvents="none"
    >
      {stream ? (
        <RTCView
          key={`tile-rtc-${videoTrack?.id ?? "none"}-${clipRevision}`}
          streamURL={stream.toURL()}
          mirror={mirror}
          zOrder={0}
          objectFit={objectFit}
          borderRadius={borderRadius}
          clipRevision={clipRevision}
          style={{ width, height }}
        />
      ) : null}
    </View>
  );
};
