import React, { useLayoutEffect, useState } from "react";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";
import { Text } from "shared/components/Text.tsx";
import { View } from "react-native";
import { useTheme } from "hooks/use-theme.ts";

interface CallTimerProps {
  startTime?: string;
  answerTime?: string;
  callState: string;
  /** True when local hold is active but state may still be `connected` (e.g. SlimSip/VoIP). */
  isOnHold?: boolean;
  isVoipCall?: boolean;
  connectionQuality?: "excellent" | "good" | "fair" | "poor";
}

function computeElapsedSeconds(
  answerTime: string | undefined,
  startTime: string | undefined,
  callState: string
): number {
  const isActiveCallDuration =
    callState === "connected" ||
    callState === "holding" ||
    callState === "held";
  if (!isActiveCallDuration) return 0;
  const raw = answerTime || startTime;
  if (!raw) return 0;
  const start = new Date(raw);
  const t = start.getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

export function CallTimer({
  startTime,
  answerTime,
  callState,
  isOnHold = false,
  isVoipCall = false,
  connectionQuality
}: CallTimerProps) {
  const [duration, setDuration] = useState(() =>
    computeElapsedSeconds(answerTime, startTime, callState)
  );
  const theme = useTheme();

  /**
   * useLayoutEffect + derived initial state: when returning to InCallScreen the first paint
   * shows the correct elapsed time instead of 00:00 until useEffect ran (post-paint).
   * Do not force 0 while connected/holding if answerTime is briefly missing — avoids multi-second flash.
   */
  useLayoutEffect(() => {
    const isActiveCallDuration =
      callState === "connected" ||
      callState === "holding" ||
      callState === "held";

    if (isActiveCallDuration && (answerTime || startTime)) {
      const tick = () => {
        setDuration(
          computeElapsedSeconds(answerTime, startTime, callState)
        );
      };

      tick();
      const interval = setInterval(tick, 1000);
      return () => clearInterval(interval);
    }

    if (!isActiveCallDuration) {
      setDuration(0);
    }
  }, [answerTime, startTime, callState]);

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const showOnHoldLabel =
    callState === "holding" ||
    callState === "held" ||
    (callState === "connected" && isOnHold);

  const getMainLineText = (): string => {
    switch (callState) {
      case "connecting":
        return isVoipCall ? "Connecting via VoIP..." : "Connecting...";
      case "connected": {
        const durationText = formatDuration(duration);
        if (isVoipCall && connectionQuality) {
          const qualityIndicator =
            getConnectionQualityIndicator(connectionQuality);
          return `${durationText} ${qualityIndicator}`;
        }
        return durationText;
      }
      case "holding":
      case "held": {
        const durationText = formatDuration(duration);
        if (isVoipCall && connectionQuality) {
          const qualityIndicator =
            getConnectionQualityIndicator(connectionQuality);
          return `${durationText} ${qualityIndicator}`;
        }
        return durationText;
      }
      case "incoming":
        return isVoipCall ? "Incoming VoIP Call" : "Incoming Call";
      case "outgoing":
        return isVoipCall ? "Calling via VoIP..." : "Calling...";
      default:
        return "00:00";
    }
  };

  const getConnectionQualityIndicator = (quality: string): string => {
    switch (quality) {
      case "excellent":
        return "🟢";
      case "good":
        return "🟡";
      case "fair":
        return "🟠";
      case "poor":
        return "🔴";
      default:
        return "";
    }
  };

  return (
    <View
      style={{
        borderWidth: 0.25,
        paddingHorizontal: padding.xs,
        borderRadius: borderRadius.sm,
        paddingVertical: padding.xs,
        backgroundColor: theme.colors["color-colors-background-bg-secondary"],
        borderColor: theme.colors.grey
      }}
    >
      {showOnHoldLabel && (
        <Text
          color="color-colors-text-text-secondary"
          size={fontSize.xs}
          weight="semiBold"
          align="center"
        >
          On hold
        </Text>
      )}
      {showOnHoldLabel && <View style={{ height: padding.xs / 2 }} />}
      <Text
        color="color-colors-text-text-secondary"
        size={fontSize.sm}
        weight="medium"
        align="center"
      >
        {getMainLineText()}
      </Text>
    </View>
  );
}
