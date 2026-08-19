import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "shared/components/Text.tsx";
import { useSoftphone } from "core/softphone/useSoftphone.ts";
import { CallState } from "core/softphone/types.ts";
import { getCurrentRoute, navigate } from "core/navigation/utils/Ref.ts";
import { Routes } from "core/navigation/types/types.ts";
import { useCallUiVisibility } from "features/calling/CallUiVisibilityContext.tsx";

type ActiveCallBannerProps = {
  /** From NavigationContainer onStateChange — ensures this row re-renders when route changes. */
  currentRouteName?: string;
};

export function ActiveCallBanner({ currentRouteName }: ActiveCallBannerProps) {
  const insets = useSafeAreaInsets();
  const { calls, activeCallId } = useSoftphone();
  const [, setNow] = useState(() => Date.now());
  const { inCallUiVisible, setInCallUiVisible } = useCallUiVisibility();

  const activeCall = useMemo(() => {
    const activeFromId = activeCallId ? calls[activeCallId] : undefined;
    if (
      activeFromId &&
      [
        CallState.INCOMING,
        CallState.OUTGOING,
        CallState.CONNECTING,
        CallState.CONNECTED,
        CallState.HOLDING,
        CallState.HELD
      ].includes(activeFromId.state)
    ) {
      return activeFromId;
    }

    return Object.values(calls).find((call) =>
      [
        CallState.INCOMING,
        CallState.OUTGOING,
        CallState.CONNECTING,
        CallState.CONNECTED,
        CallState.HOLDING,
        CallState.HELD
      ].includes(call.state)
    );
  }, [activeCallId, calls]);

  const showTimer =
    activeCall?.state === CallState.CONNECTED ||
    activeCall?.state === CallState.HOLDING ||
    activeCall?.state === CallState.HELD;

  useEffect(() => {
    if (!showTimer) {
      return;
    }

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [showTimer, activeCall?.sessionId]);

  const routeName =
    currentRouteName ?? getCurrentRoute()?.name ?? undefined;

  // Never stack the global stripe on top of the full-screen in-call UI (also covers
  // brief inCallUiVisible=false gaps when Keypad blurs or InCallScreen remounts on param updates).
  if (routeName === Routes.InCallScreen) {
    return null;
  }

  if (!activeCall) {
    return null;
  }

  // Keypad tab embeds full InCallScreen when connected — no duplicate global stripe.
  if (
    routeName === Routes.Keypad &&
    !!activeCallId &&
    activeCallId !== "dialing"
  ) {
    return null;
  }

  if (inCallUiVisible) {
    return null;
  }

  const stateLabel = activeCall.isOnHold
    ? "On hold"
    : activeCall.state === CallState.CONNECTING ||
        activeCall.state === CallState.OUTGOING
      ? "Connecting..."
      : "Ongoing call";

  const peerLabel =
    activeCall.contactDisplayName || activeCall.remoteDisplayName || "Current call";

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(
        2,
        "0"
      )}:${String(secs).padStart(2, "0")}`;
    }

    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const timerStart = activeCall.answerTime || activeCall.startTime;
  const elapsedSeconds = timerStart
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(timerStart).getTime()) / 1000)
      )
    : 0;

  const inner = (
    <Pressable
      style={[styles.bannerRow,{marginTop: insets.top}]}
      onPress={() => {
        // Hide immediately before navigation animation commits.
        setInCallUiVisible(true);
        navigate(Routes.InCallScreen, { callId: activeCall.sessionId });
      }}
    >
      <View>
        <Text
          color="white"
          size={13}
          weight="semiBold"
          align="left"
        >
          {stateLabel}
        </Text>
        <Text
          color="white"
          size={12}
          weight="medium"
          align="left"
        >
          {peerLabel}
        </Text>
      </View>
      {showTimer ? (
        <Text color="white" size={13} weight="semiBold" align="right">
          {formatDuration(elapsedSeconds)}
        </Text>
      ) : null}
    </Pressable>
  );

  // Status bar / notch: app background (not black). Call row is black below it.
  // Top inset is reserved globally in Entrypoint so banner doesn't need to pad.
  return <View style={styles.shell}>{inner}</View>;
}

const styles = StyleSheet.create({
  shell: {
    width: "100%"
  },
  bannerRow: {
    width: "100%",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#000000",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  }
});
