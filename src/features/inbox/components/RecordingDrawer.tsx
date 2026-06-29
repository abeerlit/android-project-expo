// React Imports
import { Alert, Linking } from "react-native";
import { useSelector } from "react-redux";
import { useState, useEffect, useCallback } from "react";
import { useTheme } from "hooks/use-theme.ts";
import { useNavigation } from "@react-navigation/core";
import { toast } from "@backpackapp-io/react-native-toast";
import { useSoftphone } from "core/softphone/useSoftphone.ts";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { fontSize, padding } from "core/theme/theme.ts";
import { getContactName } from "features/inbox/utils/inbox-utils.ts";
import { getCallRecording } from "shared/api/call-recordings/methods.ts";

// Type Imports
import React from "react";
import { State } from "store/types.ts";
import { CallData } from "shared/api/inbox/types.ts";
import { ChatNavigationProp } from "features/chat/types.ts";

// Component Imports
import { View } from "react-native";
import Icon from "shared/components/Icon.tsx";
import { Logger } from "shared/utils/Logger.ts";
import { TouchableOpacity } from "react-native";
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { AudioPlayback } from "features/inbox/components/AudioPlayback.tsx";

export const RecordingDrawer = ({ recording }: { recording: CallData }) => {
  // Constants
  const logger = new Logger("Call Recordings: ");
  const theme = useTheme();
  const navigation = useNavigation<ChatNavigationProp>();
  const { closeDrawer } = useDrawer();
  const { makeCall, isInitializing, isRegistering, hasOngoingCall } =
    useSoftphone();

  // App State
  const token = useSelector(
    ({ authReducer }: State) => authReducer.accessToken
  );
  const directory = useSelector(
    ({ directoryReducer }: State) => directoryReducer.directory
  );
  const personalContacts = useSelector(
    ({ directoryReducer }: State) => directoryReducer.personalContacts ?? []
  );

  // Local State
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Get the phone number to call back
  const getPhoneNumber = (): string | null => {
    // If inbound call, callback to caller; if outbound, callback to dialed number
    const number =
      recording.direction === "inbound"
        ? recording.callerIdNum
        : recording.dialedNum;
    if (!number) return null;
    // Extract digits only
    const digits = number.replace(/\D/g, "");
    return digits.length >= 10 ? digits.slice(-10) : digits || null;
  };

  const handleCallback = useCallback(async () => {
    const phoneNumber = getPhoneNumber();
    const displayName = getContactName(
      phoneNumber || "",
      recording.direction === "inbound"
        ? recording.callerIdName
        : recording.dialedName,
      directory,
      personalContacts
    );

    if (!phoneNumber) {
      logger.error("No phone number available for callback");
      toast.error("No phone number available");
      return;
    }

    if (isInitializing || isRegistering) {
      toast.error("Softphone is still initializing...");
      return;
    }

    if (hasOngoingCall) {
      Alert.alert(
        "Call in progress",
        "Please end the current call before making a new one."
      );
      return;
    }

    try {
      // Dismiss the drawer first so iOS audio session can switch cleanly to call/ringback.
      closeDrawer();
      await new Promise((resolve) => setTimeout(resolve, 50));
      navigation.navigate("InCallScreen", {
        callId: "dialing",
        destination: phoneNumber,
        ...(displayName ? { displayName } : {})
      });
      void makeCall(phoneNumber, displayName ? { displayName } : undefined);
      logger.debug(
        "Callback initiated to:",
        phoneNumber,
        "(dialing UI shown immediately)"
      );
    } catch (error) {
      logger.error("Failed to make callback:", error);
      toast.error("Failed to make call");
    }
  }, [
    recording,
    directory,
    personalContacts,
    isInitializing,
    isRegistering,
    hasOngoingCall,
    makeCall,
    navigation,
    closeDrawer
  ]);

  // Methods
  const downloadRecording = async () => {
    try {
      const result = await getCallRecording(token, recording.callId);
      const link = result.mediaURL;
      if (link) {
        await Linking.openURL(link);
      }
    } catch (e) {
      logger.error("Error downloading recording:", e);
    }
  };

  // Effects
  useEffect(() => {
    const fetchAudioUrl = async () => {
      try {
        const result = await getCallRecording(token, recording.callId);
        if (result?.mediaURL) {
          setAudioUrl(result.mediaURL);
        }
      } catch (error) {
        logger.error("Error fetching audio URL:", error);
      }
    };
    fetchAudioUrl();
  }, [recording.callId, token]);

  return (
    <>
      <View style={{ paddingHorizontal: 20 }}>
        <WhiteSpace height={3} />
        <Text
          size={fontSize.lg}
          style={{
            fontWeight: "600",
            marginBottom: 20,
            color: theme.colors["color-colors-text-text-primary"],
            borderColor: theme.colors["color-colors-border-border-secondary"]
          }}
        >
          From{" "}
          {recording.direction === "inbound"
            ? getContactName(
                recording.callerIdNum,
                recording.callerIdName,
                directory,
                personalContacts
              )
            : getContactName(
                recording.dialedNum,
                recording.dialedName,
                directory,
                personalContacts
              )}
        </Text>

        <WhiteSpace
          style={{
            borderStyle: "solid",
            borderWidth: 0.5,
            borderColor: theme.colors["color-colors-border-border-secondary"]
          }}
        />

        <View style={{ paddingHorizontal: padding["3xl"] }}>
          <AudioPlayback
            url={audioUrl}
            onError={(error) => logger.error("Audio error:", error)}
          />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              justifyContent: "space-between",
              paddingTop: padding.xxs,
              paddingBottom: padding.xxs
            }}
          >
            <View>
              <TouchableOpacity
                onPress={handleCallback}
                style={{ paddingVertical: 10 }}
              >
                <Icon
                  name={"phone"}
                  type={"outline"}
                  size={20}
                  stroke={
                    theme.colors[
                      "color-component-colors-components-buttons-tertiary-button-tertiary-fg"
                    ]
                  }
                />
              </TouchableOpacity>
            </View>
            <View>
              <TouchableOpacity
                onPress={downloadRecording}
                style={{ paddingVertical: 10 }}
              >
                <Icon
                  name={"download-cloud-02"}
                  type={"outline"}
                  size={20}
                  stroke={
                    theme.colors[
                      "color-component-colors-components-buttons-tertiary-button-tertiary-fg"
                    ]
                  }
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <WhiteSpace
          style={{
            borderStyle: "solid",
            borderWidth: 0.5,
            borderColor: theme.colors["color-colors-border-border-secondary"]
          }}
        />
      </View>
    </>
  );
};
