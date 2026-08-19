// React Imports
import React from "react";

// Component Imports
import { Screen } from "shared/components/utils/Screen.tsx";
import { InboxTabNavigator } from "core/navigation/navigators/InboxTabNavigator.tsx";
import { TopBar } from "shared/components/TopBar.tsx";
import { useStableTopBarAvatar } from "hooks/use-stable-top-bar-avatar.ts";

export function Inbox() {
  const { avatarSource, avatarName } = useStableTopBarAvatar();

  return (
    <Screen paddingHorizontal>
      <TopBar 
        title="Recents" 
        avatarSource={avatarSource}
        avatarName={avatarName}
      />
      <InboxTabNavigator />
    </Screen>
  );
}
