import { Platform } from "react-native";
import { useMemo } from "react";
import { CallState } from "core/softphone/types.ts";
import { Routes } from "core/navigation/types/types.ts";
import { getCurrentRoute } from "core/navigation/utils/Ref.ts";

/** Height of ActiveCallBanner / ActiveMeetingBanner row (matches iOS chat offset). */
export const CHAT_BANNER_ROW_HEIGHT = 50;

export const IOS_HEADER_HEIGHT_FALLBACK = 52;
export const ANDROID_HEADER_HEIGHT_FALLBACK = 56;



const LIVE_CALL_STATES = new Set<CallState>([
  CallState.INCOMING,
  CallState.OUTGOING,
  CallState.CONNECTING,
  CallState.CONNECTED,
  CallState.HOLDING,
  CallState.HELD
]);

export type ChatBannerVisibility = {
  callBannerVisible: boolean;
  meetingBannerVisible: boolean;
};

export function getChatBannerVisibility(
  calls: Record<string, { state: CallState }>,
  activeCallId: string | null | undefined,
  meetingActiveGlobally: boolean
): ChatBannerVisibility {
  const activeFromId = activeCallId ? calls[activeCallId] : undefined;
  const hasLiveCall =
    (activeFromId && LIVE_CALL_STATES.has(activeFromId.state)) ||
    Object.values(calls).some((call) => LIVE_CALL_STATES.has(call.state));
  const currentRouteName = getCurrentRoute()?.name;
  const callBannerVisible =
    !!hasLiveCall && currentRouteName !== Routes.InCallScreen;
  const meetingBannerVisible =
    meetingActiveGlobally && currentRouteName !== Routes.Meetings;
  return { callBannerVisible, meetingBannerVisible };
}


export function computeChatKeyboardVerticalOffset(options: {
  insetsTop: number;
  keyboardOffsetExtra?: number;
  callBannerVisible: boolean;
  meetingBannerVisible: boolean;
  editorExtra?: number;
}): number {
  const {
    insetsTop,
    keyboardOffsetExtra = 0,
    callBannerVisible,
    meetingBannerVisible,
    editorExtra = 0
  } = options;

  const headerFallback = ANDROID_HEADER_HEIGHT_FALLBACK
  const headerHeight =
    keyboardOffsetExtra > 0 ? keyboardOffsetExtra : headerFallback;

  const bannerRows =
    (callBannerVisible ? CHAT_BANNER_ROW_HEIGHT : 0) +
    (meetingBannerVisible ? CHAT_BANNER_ROW_HEIGHT : 0);


  return insetsTop + headerHeight + bannerRows + editorExtra;
}

export function useChatKeyboardVerticalOffset(
  insetsTop: number,
  calls: Record<string, { state: CallState }>,
  activeCallId: string | null | undefined,
  meetingActiveGlobally: boolean,
  keyboardOffsetExtra = 0,
  editorExtra = 0
): number {
  return useMemo(() => {
    const { callBannerVisible, meetingBannerVisible } = getChatBannerVisibility(
      calls,
      activeCallId,
      meetingActiveGlobally
    );
    return computeChatKeyboardVerticalOffset({
      insetsTop,
      keyboardOffsetExtra,
      callBannerVisible,
      meetingBannerVisible,
      editorExtra
    });
  }, [
    insetsTop,
    keyboardOffsetExtra,
    calls,
    activeCallId,
    meetingActiveGlobally,
    editorExtra
  ]);
}
