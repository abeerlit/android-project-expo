import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View
} from "react-native";
import type { DailyCall, DailyEventObjectParticipant } from "@daily-co/react-native-daily-js";
import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";
import { navigate } from "core/navigation/utils/Ref.ts";
import { Routes } from "core/navigation/types/types.ts";
import { useMeetingActive } from "features/meeting/MeetingActiveContext.tsx";
import { trackMediaLive } from "features/meeting/meetingParticipantTracks.ts";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "hooks/use-theme.ts";
import { useNavigationState } from "@react-navigation/native";

function getActiveRouteName(state: any): string | undefined {
  if (!state) return undefined;
  const route = state.routes?.[state.index ?? 0];
  if (!route) return undefined;
  if (route.state) return getActiveRouteName(route.state);
  return route.name;
}

const isLocalMicUnmuted = (call: DailyCall | null): boolean => {
  if (!call || call.isDestroyed()) return true;
  const local = call.participants()?.local;
  if (!local) return true;
  const t = local.tracks?.audio;
  if (t) return trackMediaLive(t);
  if (typeof local.audio === "boolean") return local.audio;
  return true;
};

export function ActiveMeetingBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { callRef, lastJoinedParamsRef, meetingActiveGlobally, endMeetingGlobally } =
    useMeetingActive();
  const [micTick, setMicTick] = useState(0);
  const currentRouteName = useNavigationState(getActiveRouteName);

  const bumpMicUi = useCallback(() => {
    setMicTick((n) => n + 1);
  }, []);

  const call = callRef.current;
  const params = lastJoinedParamsRef.current;

  const micOn = useMemo(() => isLocalMicUnmuted(callRef.current), [micTick]);

  useEffect(() => {
    if (!meetingActiveGlobally) return;
    const c = callRef.current;
    if (!c || c.isDestroyed() || c.meetingState() !== "joined-meeting") return;

    const onParticipantUpdated = (ev: DailyEventObjectParticipant) => {
      if (ev.participant?.local) bumpMicUi();
    };
    const onParticipantJoined = (ev: DailyEventObjectParticipant) => {
      if (ev.participant?.local) bumpMicUi();
    };

    c.on("participant-updated", onParticipantUpdated);
    c.on("participant-joined", onParticipantJoined);
    return () => {
      if (c.isDestroyed()) return;
      c.off("participant-updated", onParticipantUpdated);
      c.off("participant-joined", onParticipantJoined);
    };
  }, [bumpMicUi, callRef, meetingActiveGlobally]);

  useEffect(() => {
    if (!meetingActiveGlobally) return;
    if (currentRouteName === Routes.Meetings) return;
    bumpMicUi();
  }, [bumpMicUi, currentRouteName, meetingActiveGlobally]);

  if (
    currentRouteName === Routes.Meetings ||
    currentRouteName === Routes.InCallScreen ||
    currentRouteName === Routes.Keypad
  ) {
    return null;
  }
  if (!meetingActiveGlobally || !call || call.isDestroyed()) return null;
  if (call.meetingState() !== "joined-meeting") return null;

  const canNavigateBack =
    Boolean(params?.meetURL?.trim()) || Boolean(params?.roomId && params?.meetingToken);
  if (!canNavigateBack) return null;

  const openMeeting = () => {
    if (!params) return;
    const meetURL =
      params.meetURL?.trim() ||
      (params.roomId && params.meetingToken ? `https://meet.voxo.co/${params.roomId}` : "");
    if (!meetURL) return;
    navigate(Routes.Meetings, {
      meetURL,
      ...(params.roomId ? { roomId: params.roomId } : {}),
      ...(params.meetingToken ? { meetingToken: params.meetingToken } : {}),
      ...(params.enableTranscription !== undefined ? { enableTranscription: params.enableTranscription } : {})
    });
  };

  const toggleMic = () => {
    const c = callRef.current;
    if (!c || c.isDestroyed() || c.meetingState() !== "joined-meeting") return;
    const next = !isLocalMicUnmuted(c);
    c.setLocalAudio(next);
    bumpMicUi();
  };

  const confirmLeave = () => {
    Alert.alert("Leave meeting?", "You will disconnect from this meeting.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: () => {
          void endMeetingGlobally();
        }
      }
    ]);
  };

  // Top inset is reserved globally in Entrypoint so banner doesn't need to pad.
  return (
    <View style={[styles.shell,{marginTop: insets.top}]}>
      <View
        style={[
          styles.container,
          {
            paddingLeft: Math.max(12, insets.left),
            paddingRight: Math.max(12, insets.right)
          }
        ]}
      >
        <Pressable style={styles.tapArea} onPress={openMeeting}>
          <Text
            color="white"
            size={13}
            weight="semiBold"
            align="left"
            numberOfLines={1}
          >
            Ongoing meeting
          </Text>
          <Text
            color="white"
            size={12}
            weight="medium"
            align="left"
            numberOfLines={1}
          >
            Tap to return
          </Text>
        </Pressable>
        <View style={styles.actions} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.actionHit}
            onPress={toggleMic}
            accessibilityRole="button"
            accessibilityLabel={micOn ? "Mute microphone" : "Unmute microphone"}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 4 }}
          >
            <View
              style={[
                styles.iconButton,
                { backgroundColor: micOn ? "#333537" : "#db362e" }
              ]}
            >
              <Icon
                name={micOn ? "microphone-02" : "microphone-off-02"}
                size={20}
                color="#fff"
              />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionHit}
            onPress={confirmLeave}
            accessibilityRole="button"
            accessibilityLabel="Leave meeting"
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }}
          >
            <View style={[styles.iconButton, styles.leaveButton]}>
              <Icon name="phone-hang-up" size={20} color="white" />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: "100%"
  },
  container: {
    paddingVertical: 10,
    backgroundColor: "#232425",
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.2)"
  },
  tapArea: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingRight: 8,
    paddingVertical: 2
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    flexGrow: 0,
    gap: 2
  },
  actionHit: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 48
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#db362e",
    alignItems: "center",
    justifyContent: "center"
  },
  leaveButton: {
    backgroundColor: "#db362e"
  }
});

