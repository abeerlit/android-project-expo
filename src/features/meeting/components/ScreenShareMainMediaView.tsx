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
import { dailyMediaViewZOrder } from "features/meeting/meetingParticipantTracks.ts";

export type ScreenShareMainMediaViewProps = {
  videoTrack: MediaStreamTrack | null;
  width: number;
  height: number;
  /** Black until transitions settle — avoids stale camera frames on Android. */
  videoReady?: boolean;
  layoutEpoch?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Main screen-share stage + Android fullscreen overlay.
 * Android: fixed-size `RTCView` + `clipRevision` (contain). iOS: `DailyMediaView`.
 */
export const ScreenShareMainMediaView = ({
  videoTrack,
  width,
  height,
  videoReady = true,
  layoutEpoch = 0,
  borderRadius = 0,
  style
}: ScreenShareMainMediaViewProps) => {
  const showVideo =
    videoReady && videoTrack != null && width >= 1 && height >= 1;

  if (!showVideo) {
    return <View style={[styles.placeholder, { width, height }, style]} />;
  }

  if (Platform.OS !== "android") {
    return (
      <DailyMediaView
        style={
          style != null
            ? StyleSheet.flatten([styles.iosVideo, { width, height }, style])
            : { width, height }
        }
        mirror={false}
        objectFit="contain"
        zOrder={dailyMediaViewZOrder(false)}
        videoTrack={videoTrack}
        audioTrack={null}
      />
    );
  }

  return (
    <AndroidScreenShareMediaView
      videoTrack={videoTrack}
      width={width}
      height={height}
      layoutEpoch={layoutEpoch}
      borderRadius={borderRadius}
      style={style}
    />
  );
};

type AndroidScreenShareMediaViewProps = {
  videoTrack: MediaStreamTrack;
  width: number;
  height: number;
  layoutEpoch: number;
  borderRadius: number;
  style?: StyleProp<ViewStyle>;
};

const AndroidScreenShareMediaView = ({
  videoTrack,
  width,
  height,
  layoutEpoch,
  borderRadius,
  style
}: AndroidScreenShareMediaViewProps) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [clipRevision, setClipRevision] = useState(0);
  const prevEpochRef = useRef(layoutEpoch);

  useEffect(() => {
    setStream(new MediaStream([videoTrack]));
  }, [videoTrack]);

  useEffect(() => {
    if (stream) {
      setClipRevision((r) => r + 1);
    }
  }, [stream]);

  useEffect(() => {
    if (layoutEpoch === prevEpochRef.current) {
      return;
    }
    prevEpochRef.current = layoutEpoch;
    setClipRevision((r) => r + 1);
  }, [layoutEpoch]);

  return (
    <View
      style={[{ width, height }, style]}
      collapsable={false}
      pointerEvents="none"
    >
      {stream ? (
        <RTCView
          key={`ss-rtc-${layoutEpoch}-${clipRevision}`}
          streamURL={stream.toURL()}
          mirror={false}
          zOrder={0}
          objectFit="contain"
          borderRadius={borderRadius}
          clipRevision={clipRevision}
          style={{ width, height }}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: "#000"
  },
  iosVideo: {
    backgroundColor: "#000"
  }
});
