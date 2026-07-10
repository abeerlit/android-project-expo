import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { DailyMediaView, type DailyParticipant } from "@daily-co/react-native-daily-js";
import {
  MediaStream,
  RTCView,
  type MediaStreamTrack
} from "@daily-co/react-native-webrtc";
import {
  LOCAL_PIP_HEIGHT,
  LOCAL_PIP_WIDTH,
  MEETING_TILE_BORDER_RADIUS
} from "features/meeting/meetingLayout.ts";
import {
  getAudioTrackForTile,
  getCameraTrackForTile,
  getLocalCameraTrackForPiP
} from "features/meeting/meetingParticipantTracks.ts";

export type LocalMeetingPiPMediaViewProps = {
  localParticipant: DailyParticipant;
  /** When true on Android, PiP must stack above remote `RTCView` surfaces. */
  remotesPresent: boolean;
  /** Bumps native clip when remote video roster changes (Android stacked mode). */
  clipRefreshKey?: string;
  style?: StyleProp<ViewStyle>;
  mirror?: boolean;
};

/**
 * Solo / iOS: `DailyMediaView` with parent `overflow: hidden`.
 * Android + remotes: `RTCView` with native `borderRadius` (TextureView path on device).
 */
export const LocalMeetingPiPMediaView = ({
  localParticipant,
  remotesPresent,
  clipRefreshKey,
  style,
  mirror = true
}: LocalMeetingPiPMediaViewProps) => {
  const androidStacked = Platform.OS === "android" && remotesPresent;

  if (!androidStacked) {
    return (
      <DailyMediaView
        style={StyleSheet.flatten(style)}
        mirror={mirror}
        objectFit="cover"
        videoTrack={getCameraTrackForTile(localParticipant)}
        audioTrack={getAudioTrackForTile(localParticipant)}
      />
    );
  }

  return (
    <AndroidStackedPiPMediaView
      videoTrack={getLocalCameraTrackForPiP(localParticipant)}
      audioTrack={getAudioTrackForTile(localParticipant)}
      clipRefreshKey={clipRefreshKey}
      style={style}
      mirror={mirror}
    />
  );
};

type AndroidStackedPiPMediaViewProps = {
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  clipRefreshKey?: string;
  style?: StyleProp<ViewStyle>;
  mirror?: boolean;
};

const AndroidStackedPiPMediaView = ({
  videoTrack,
  audioTrack,
  clipRefreshKey,
  style,
  mirror
}: AndroidStackedPiPMediaViewProps) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [clipRevision, setClipRevision] = useState(0);
  const prevClipKeyRef = useRef(clipRefreshKey);

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
    if (clipRefreshKey === prevClipKeyRef.current) {
      return;
    }
    prevClipKeyRef.current = clipRefreshKey;
    setClipRevision((r) => r + 1);
  }, [clipRefreshKey]);

  if (!stream) {
    return null;
  }

  return (
    <View style={[styles.host, style]} collapsable={false} pointerEvents="box-none">
      <RTCView
        streamURL={stream.toURL()}
        mirror={mirror}
        zOrder={1}
        objectFit="cover"
        borderRadius={MEETING_TILE_BORDER_RADIUS}
        clipRevision={clipRevision}
        style={styles.rtcView}
      />
      <View pointerEvents="none" style={styles.edgeRing} />
    </View>
  );
};

const styles = StyleSheet.create({
  host: {
    width: LOCAL_PIP_WIDTH,
    height: LOCAL_PIP_HEIGHT,
    backgroundColor: "transparent",
  },
  rtcView: {
    width: LOCAL_PIP_WIDTH,
    height: LOCAL_PIP_HEIGHT,
  },
  /** Hairline ring so PiP edge reads over arbitrary remote video (corners stay transparent). */
  edgeRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: MEETING_TILE_BORDER_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.14)"
  }
});
