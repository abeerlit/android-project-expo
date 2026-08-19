import React from "react";
import { Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import {
  ChatParams,
  Routes,
  ThreadsChatParams,
  TwoFactorSetupParams,
  TwoFactorVerifyParams
} from "core/navigation/types/types.ts";
import { BottomTabNavigator } from "core/navigation/navigators/BottomTabNavigator.tsx";
import PreferencesScreen from "features/preferences/PreferencesScreen.tsx";
import { AuthenticationTwoFactorSetup } from "features/authentication/pages/AuthenticationTwoFactorSetup.tsx";
import { AuthenticationTwoFactorVerify } from "features/authentication/pages/AuthenticationTwoFactorVerify.tsx";
import { Chat } from "features/chat/pages/Chat.tsx";
import { Threads } from "features/chat/pages/Threads.tsx";
import { InCallScreen } from "features/calling/components/InCallScreen.tsx";
import { InCallErrorBoundary } from "shared/components/InCallErrorBoundary.tsx";
import { TextConversations } from "features/text/pages/TextConversations.tsx";
import { Meetings } from "features/meeting/pages/Meetings.tsx";
import { withEdgeSwipeBack } from "shared/components/navigation/withEdgeSwipeBack.tsx";

// IMPORTANT: define wrapped components once (outside render),
// otherwise inline `withEdgeSwipeBack(...)` creates a new component type every render,
// causing screens to unmount/mount repeatedly (navigation appears stuck + effects run in a loop).
const PreferencesScreenWithEdgeBack = withEdgeSwipeBack(PreferencesScreen);
const TwoFactorSetupWithEdgeBack = withEdgeSwipeBack(AuthenticationTwoFactorSetup);
const TwoFactorVerifyWithEdgeBack = withEdgeSwipeBack(AuthenticationTwoFactorVerify);
// Chat / Threads: edge swipe on message list only (EdgeSwipeBackZone), not full screen.
// Meetings: no edge swipe — use header/back control only (avoids conflict with PiP drag).
const TextConversationsWithEdgeBack = withEdgeSwipeBack(TextConversations);

export type AuthParams = {
  BottomTabNavigator: undefined;
  Inbox: undefined;
  Contacts: undefined;
  Keypad: undefined;
  PermissionsNotifications: undefined;
  PermissionsMicrophone: undefined;
  PermissionsContacts: undefined;
  MissingPolicyConsent: undefined;
  Preferences: undefined;
  TwoFactorSetup: TwoFactorSetupParams;
  TwoFactorVerify: TwoFactorVerifyParams;
  Chat: ChatParams;
  Threads: ThreadsChatParams;
  InCallScreen: {
    callId: string;
    /** For immediate "Dialing..." shell before SIP session exists. */
    destination?: string;
    displayName?: string;
    avatarPath?: string | null;
    /** Legacy/compat: some call sites pass this instead of `destination`. */
    phoneNumber?: string;
  };
  NewMessage: ChatParams | undefined;
  Meetings: {
    meetURL: string;
    roomId?: string;
    meetingToken?: string;
    enableTranscription?: number;
  };
  TextConversations: undefined;
  TextThread: ChatParams;
  NewTextMessage: undefined;
};

const AuthNavigator = createNativeStackNavigator<AuthParams>();

function InCallScreenWithErrorBoundary(props: any) {
  const navigation = useNavigation();
  const callId = props.route?.params?.callId;
  return (
    <InCallErrorBoundary onClose={() => navigation.goBack()}>
      <InCallScreen {...props} callId={callId} />
    </InCallErrorBoundary>
  );
}

export const AuthenticatedStackNavigator = () => {
  const initialRoute = Routes.BottomTabNavigator;

  return (
    <AuthNavigator.Navigator
      screenOptions={{
        headerShown: false,
        // Use a consistent custom left-edge swipe-back across Android.
        // (Native-stack gestures vary across devices and often don't behave like iOS.)
        gestureEnabled: false,
        ...(Platform.OS === "android" ? { animationDuration: 180 } : {})
      }}
      initialRouteName={initialRoute}
    >
      <AuthNavigator.Screen
        name="BottomTabNavigator"
        component={BottomTabNavigator}
      />
      <AuthNavigator.Screen
        name={Routes.Preferences}
        component={PreferencesScreenWithEdgeBack}
      />
      <AuthNavigator.Screen
        name={Routes.TwoFactorSetup}
        component={TwoFactorSetupWithEdgeBack}
      />
      <AuthNavigator.Screen
        name={Routes.TwoFactorVerify}
        component={TwoFactorVerifyWithEdgeBack}
      />
      <AuthNavigator.Screen
        name={Routes.Chat}
        component={Chat}
        options={
          Platform.OS === "android"
            ? { animation: "fade", animationDuration: 120 }
            : undefined
        }
      />
      <AuthNavigator.Screen
        name={Routes.Threads}
        component={Threads}
        options={
          Platform.OS === "android"
            ? { animation: "fade", animationDuration: 120 }
            : undefined
        }
      />
      <AuthNavigator.Screen
        name="InCallScreen"
        component={InCallScreenWithErrorBoundary}
        options={{
          headerShown: false,
          animation: "none"
        }}
      />
      <AuthNavigator.Screen
        name={Routes.NewMessage}
        component={Chat}
        options={
          Platform.OS === "android"
            ? { animation: "fade", animationDuration: 120 }
            : undefined
        }
      />
      <AuthNavigator.Screen
        name={Routes.Meetings}
        component={Meetings}
      />
      <AuthNavigator.Screen
        name={Routes.TextConversations}
        component={TextConversationsWithEdgeBack}
      />
      <AuthNavigator.Screen
        name={Routes.TextThread}
        component={Chat}
        options={
          Platform.OS === "android"
            ? { animation: "fade", animationDuration: 120 }
            : undefined
        }
      />
      <AuthNavigator.Screen
        name={Routes.NewTextMessage}
        component={Chat}
        options={
          Platform.OS === "android"
            ? { animation: "fade", animationDuration: 120 }
            : undefined
        }
      />
    </AuthNavigator.Navigator>
  );
};
