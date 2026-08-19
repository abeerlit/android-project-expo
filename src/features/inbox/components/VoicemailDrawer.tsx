// React Imports
import { Alert, Linking } from "react-native";
import {
  deleteVoicemailMessage,
  getVoicemailMessage,
  updateVoicemailRead
} from "shared/api/voicemails/methods.ts";
import { useSelector } from "react-redux";
import { useEffect, useState, useCallback } from "react";
import { useTheme } from "hooks/use-theme.ts";
import { useNavigation } from "@react-navigation/core";
import { toast } from "@backpackapp-io/react-native-toast";
import { useSoftphone } from "core/softphone/useSoftphone.ts";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { fontSize, padding } from "core/theme/theme.ts";
import { getCallerNameFromVoicemailCallerId } from "../utils/inbox-utils.ts";

// Type Imports
import React from "react";
import { State } from "store/types.ts";
import { VoicemailMessage } from "shared/api/voicemails/types.ts";
import { ChatNavigationProp } from "features/chat/types.ts";

// Component Imports
import {
  View,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback
} from "react-native";
import Icon from "shared/components/Icon.tsx";
import { Logger } from "shared/utils/Logger.ts";
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { AudioPlayback } from "features/inbox/components/AudioPlayback.tsx";

type VoicemailDrawerProps = {
  voicemail: VoicemailMessage;
  handleVoicemailRead: any;
  handleVoicemailDelete: any;
};

export const VoicemailDrawer = ({
  voicemail,
  handleVoicemailRead,
  handleVoicemailDelete
}: VoicemailDrawerProps) => {
  // Constants
  const logger = new Logger("Voicemail Message: ");

  // Hooks
  const theme = useTheme();
  const navigation = useNavigation<ChatNavigationProp>();
  const { closeDrawer } = useDrawer();
  const { makeCall, isInitializing, isRegistering, hasOngoingCall } =
    useSoftphone();

  // Local State
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // App State
  const token = useSelector(
    ({ authReducer }: State) => authReducer.accessToken
  );
  const directory = useSelector(
    ({ directoryReducer }: State) => directoryReducer.directory
  );

  // Methods
  const getPhoneNumberFromCallerId = (callerId: string): string | null => {
    const regex = /"[^"]+" <(\d+)>/;
    const match = callerId.match(regex);
    return match ? match[1] : null;
  };

  const handleCallback = useCallback(async () => {
    const phoneNumber = getPhoneNumberFromCallerId(voicemail.callerId);
    const callerName = getCallerNameFromVoicemailCallerId(
      voicemail.callerId,
      directory
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
        ...(callerName ? { displayName: callerName } : {})
      });
      void makeCall(phoneNumber, callerName ? { displayName: callerName } : undefined);
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
    voicemail.callerId,
    directory,
    isInitializing,
    isRegistering,
    hasOngoingCall,
    makeCall,
    navigation,
    closeDrawer
  ]);

  const downloadRecording = async () => {
    try {
      const result = await getVoicemailMessage(token, voicemail.id);

      const link = result.mediaURL;

      if (link) {
        await Linking.openURL(link);
        return;
      }
    } catch (e) {
      logger.error("Error downloading voicemail:", e);
    }
  };

  const deleteVoicemail = async () => {
    Alert.alert(
      "Delete Voicemail",
      "Are you sure you want to delete this voicemail? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (voicemail.id) {
              try {
                await deleteVoicemailMessage(token, voicemail.id);
                handleVoicemailDelete(voicemail.id);
              } catch (e: any) {
                logger.error("Error deleting voicemail:", e);
              }
            }
          }
        }
      ]
    );
  };

  const handlePlayStart = async () => {
    if (voicemail.status === "unread") {
      handleVoicemailRead(voicemail.id);
      await updateVoicemailRead(token, voicemail.id, "read");
    }
  };

  useEffect(() => {
    const fetchAudioUrl = async () => {
      const result = await getVoicemailMessage(token, voicemail.id);
      if (result?.mediaURL) {
        setAudioUrl(result.mediaURL);
      }
    };
    fetchAudioUrl();
  }, [voicemail.id]);

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
          {getCallerNameFromVoicemailCallerId(voicemail.callerId, directory)}
        </Text>

        <WhiteSpace
          style={{
            borderStyle: "solid",
            borderWidth: 0.5,
            borderColor: theme.colors["color-colors-border-border-secondary"]
          }}
        />

        <View style={{ paddingHorizontal: padding["3xl"] }}>
          {/* Playback bar */}
          <AudioPlayback
            url={audioUrl}
            onPlayStart={handlePlayStart}
            onError={(error) => logger.error("Audio error:", error)}
          />

          {/* Actions (call, download, delete) */}
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
            <View>
              <TouchableOpacity
                onPress={deleteVoicemail}
                style={{ paddingVertical: 10 }}
              >
                <Icon
                  name={"trash-01"}
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

          <WhiteSpace
            style={{
              borderStyle: "solid",
              borderWidth: 0.5,
              borderColor: theme.colors["color-colors-border-border-secondary"]
            }}
          />

          {/* Scrollable transcript container */}
          <ScrollView
            style={{
              height: 600,
              marginVertical: padding.xl
            }}
            contentContainerStyle={{
              padding: padding.md,
              flexGrow: 1
            }}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
            scrollEventThrottle={16}
            alwaysBounceVertical={true}
            directionalLockEnabled={true}
          >
            <TouchableWithoutFeedback>
              <View style={{ backgroundColor: "transparent" }}>
                <Text
                  size={fontSize.sm}
                  style={{
                    color: theme.colors["color-colors-text-text-tertiary"],
                    textAlign: "left"
                  }}
                >
                  {voicemail.transcript || "No transcript available."}
                </Text>
              </View>
            </TouchableWithoutFeedback>
          </ScrollView>
        </View>
      </View>
    </>
  );
};
