import React, { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  View,
  StyleSheet,
  Platform,
  ScrollView,
  StyleProp,
  ViewStyle,
  TouchableWithoutFeedback,
  Keyboard
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "hooks/use-theme.ts";
import { padding } from "core/theme/theme.ts";
import { useSoftphone } from "core/softphone/useSoftphone.ts";
import { CallState } from "core/softphone/types.ts";
import { getCurrentRoute } from "core/navigation/utils/Ref.ts";
import { Routes } from "core/navigation/types/types.ts";
import { useMeetingActive } from "features/meeting/MeetingActiveContext.tsx";
import { useCallUiVisibility } from "features/calling/CallUiVisibilityContext.tsx";

interface Props {
  statusBarStyle?: "dark-content" | "light-content";
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  safeArea?: boolean;
  children: ReactNode;
  paddingVertical?: boolean;
  paddingHorizontal?: boolean;
  avoidKeyboard?: boolean;
}

export function Screen({
  scroll = false,
  style,
  paddingHorizontal = false,
  paddingVertical = false,
  contentContainerStyle,
  safeArea = true,
  statusBarStyle = "dark-content",
  avoidKeyboard = true,
  children
}: Props) {
  const theme = useTheme();
  const { calls, activeCallId } = useSoftphone();
  const { meetingActiveGlobally } = useMeetingActive();
  const { inCallUiVisible } = useCallUiVisibility();
  const currentRouteName = getCurrentRoute()?.name;
  const bannerVisible = (() => {
    if (currentRouteName === Routes.InCallScreen) {
      return false;
    }
    // Keypad embeds InCallScreen when connected — no call banner stripe (matches ActiveCallBanner).
    if (
      currentRouteName === Routes.Keypad &&
      !!activeCallId &&
      activeCallId !== "dialing"
    ) {
      return false;
    }
    // If the meeting banner is visible, we must not apply top safe-area padding to screens,
    // otherwise it creates a white gap below the banner (same behavior as active call banner).
    const meetingBannerVisible =
      !!meetingActiveGlobally &&
      currentRouteName !== Routes.Meetings &&
      currentRouteName !== Routes.Keypad;
    if (meetingBannerVisible) {
      return true;
    }
    // Match ActiveCallBanner: stripe hidden while in-call UI is shown (e.g. before route updates).
    // Otherwise Screen keeps "no top" edges and content can jump under the status bar.
    if (inCallUiVisible) {
      return false;
    }
    const liveStates = new Set<CallState>([
      CallState.INCOMING,
      CallState.OUTGOING,
      CallState.CONNECTING,
      CallState.CONNECTED,
      CallState.HOLDING,
      CallState.HELD
    ]);
    const activeFromId = activeCallId ? calls[activeCallId] : undefined;
    if (activeFromId && liveStates.has(activeFromId.state)) {
      return true;
    }
    return Object.values(calls).some((call) => liveStates.has(call.state));
  })();
  const safeAreaEdges = bannerVisible
    ? (Platform.OS === "android"
        ? ["left", "right"] as const
        : ["left", "right", "bottom"] as const)
    : (Platform.OS === "android"
        ? ["top", "left", "right"] as const
        : ["top", "left", "right", "bottom"] as const);
  const content = (
    <View
      style={[
        styles.container,
        paddingVertical && styles.paddingVertical,
        paddingHorizontal && styles.paddingHorizontal,
        style
      ]}
    >
      {children}
    </View>
  );

  const screenBackground = theme.colors["color-colors-background-bg-primary"];

  const inner = safeArea ? (
    <SafeAreaView style={styles.flex} edges={safeAreaEdges}>
      {scroll ? (
        <ScrollView contentContainerStyle={contentContainerStyle}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  ) : scroll ? (
    <ScrollView contentContainerStyle={contentContainerStyle}>
      {content}
    </ScrollView>
  ) : (
    content
  );

  /** Chat/threads set `avoidKeyboard={false}` and use their own KAV + offset (header, banners). */
  if (!avoidKeyboard) {
    return (
      <View style={[styles.flex, { backgroundColor: screenBackground }]}>
        {inner}
      </View>
    );
  }

  const keyboardAvoidingView = (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: screenBackground }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {inner}
    </KeyboardAvoidingView>
  );

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      {keyboardAvoidingView}
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1
  },
  container: {
    flex: 1
  },
  paddingVertical: {
    paddingTop: 10,
    paddingBottom: 20
  },
  paddingHorizontal: {
    paddingHorizontal: padding.xl
  }
});
