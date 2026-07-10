import React, { useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Screen } from "shared/components/utils/Screen.tsx";
import { TopBar } from "shared/components/TopBar.tsx";
import { useStableTopBarAvatar } from "hooks/use-stable-top-bar-avatar.ts";
import { DialerKeypad } from "features/calling/components/DialerKeypad.tsx";
import { useSoftphone } from "core/softphone/useSoftphone.ts";
import { InCallScreen } from "./InCallScreen.tsx";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCallUiVisibility } from "features/calling/CallUiVisibilityContext.tsx";

export function Keypad() {
  const { avatarSource, avatarName } = useStableTopBarAvatar();
  const { activeCallId } = useSoftphone();
  const { setInCallUiVisible } = useCallUiVisibility();
  const insets = useSafeAreaInsets();

  const showingEmbeddedInCall =
    Boolean(activeCallId && activeCallId !== "dialing");

  useFocusEffect(
    useCallback(() => {
      if (showingEmbeddedInCall) {
        setInCallUiVisible(true);
      }
      return () => {
        setInCallUiVisible(false);
      };
    }, [showingEmbeddedInCall, setInCallUiVisible])
  );

  return (
    <Screen paddingHorizontal>
      <TopBar
        title={activeCallId ? "In Call" : "Keypad"}
        avatarSource={avatarSource}
        avatarName={avatarName}
        style={{ paddingTop: insets.top }}
      />
      {activeCallId && activeCallId !== "dialing" ? (
        <InCallScreen suppressCallUiVisibilityHook hideBackToApp />
      ) : (
        <DialerKeypad />
      )}
    </Screen>
  );
}
