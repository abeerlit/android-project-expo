import React, { useEffect } from "react";
import { View, StyleSheet, Alert, Platform, TouchableOpacity } from "react-native";
import InCallManager from "react-native-incall-manager";
import { useTheme } from "hooks/use-theme.ts";
import { padding, borderRadius, fontSize } from "core/theme/theme.ts";
import { Button } from "shared/components/Button.tsx";
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { useSoftphone } from "core/softphone/useSoftphone.ts";
import { CallControlButton } from "./CallControlButton.tsx";
import { CallTimer } from "./CallTimer.tsx";
import { Avatar } from "shared/components/Avatar.tsx";
import { LoadingSpinner } from "shared/components/LoadingSpinner.tsx";
import { useContactLookup } from "../hooks/useContactLookup.ts";
import { Logger } from "shared/utils/Logger.ts";
import { toast } from "@backpackapp-io/react-native-toast";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import {
  TransferContactDrawer,
  TransferContact
} from "./TransferContactDrawer.tsx";
import { TransferStateDrawer } from "./TransferStateDrawer.tsx";
import {
  TransferOptionsDrawer,
  TransferType
} from "./TransferOptionsDrawer.tsx";
import { MergeCallDrawer } from "./MergeCallDrawer.tsx";
import { CallState } from "core/softphone/types.ts";
import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
  useRoute
} from "@react-navigation/native";
import { Routes } from "core/navigation/types/types.ts";
import { ConferenceParticipantsDrawer } from "./ConferenceParticipantsDrawer.tsx";
import { InCallKeypadDrawer } from "./InCallKeypadDrawer.tsx";
import { phoneNumberFormatter } from "shared/utils/utils.ts";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VoipBridge } from "core/softphone/VoipBridge.ts";
import { getSipSession } from "core/softphone/pendingSipSessions.ts";
import Icon from "shared/components/Icon.tsx";
import type { AuthParams } from "core/navigation/navigators/AuthenticatedStack.tsx";
import type { RouteProp } from "@react-navigation/native";
import { useCallUiVisibility } from "features/calling/CallUiVisibilityContext.tsx";

const logger = new Logger("InCallScreen: ");

function transferSuccessLabel(contact: TransferContact): string {
  const name = contact.name.trim();
  return name.length > 0 ? name : phoneNumberFormatter(contact.number);
}

/** Foreground mute/hold diagnosis (Android CallKit / VoIP id mismatches). */
function logMuteHoldDiag(
  action: "mute" | "hold",
  payload: Record<string, unknown>
) {
  console.warn(`[IC-MUTEHOLD][${action}] ${new Date().toISOString()}`, {
    platform: Platform.OS,
    ...payload
  });
}

interface InCallScreenProps {
  callId?: string;
  /** When true, do not toggle global call-UI visibility (Keypad tab owns it for embedded in-call). */
  suppressCallUiVisibilityHook?: boolean;
  /** Keypad tab embeds this screen under its own TopBar — hide stack-only "Back to app" affordance. */
  hideBackToApp?: boolean;
}

export function InCallScreen({
  callId,
  suppressCallUiVisibilityHook,
  hideBackToApp
}: InCallScreenProps) {
  const theme = useTheme();
  const { openDrawer, closeDrawer } = useDrawer();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<AuthParams, Routes.InCallScreen>>();
  const isFocused = useIsFocused();
  const { setInCallUiVisible } = useCallUiVisibility();
  const [isAnswering, setIsAnswering] = React.useState(false);
  /** True once a real SIP session exists — blocks stale route `callId: "dialing"` after hangup. */
  const hadLiveCallRef = React.useRef(false);
  /** True after user ends outbound setup — blocks pre-session shell from reappearing. */
  const outboundSetupEndedRef = React.useRef(false);
  const {
    // State
    calls,
    activeCallId,
    getCallById,
    hasOngoingCall,

    // Actions
    answerCall,
    hangupCall,
    muteCall,
    unmuteCall,
    holdCall,
    unholdCall,
    setSpeaker,
    transferCall,
    startAttendedTransfer,
    cancelAttendedTransfer,
    mergeAttendedTransfer
  } = useSoftphone();

  // Get current call from activeCallId
  const currentCall = activeCallId ? getCallById(activeCallId) : null;

  // Helper functions (with null guards for Android crash prevention)
  const getPhoneNumber = (remoteUri: string | undefined): string => {
    if (!remoteUri || typeof remoteUri !== "string") return "";
    const match = remoteUri.match(/^sip:(.+)@/);
    return match ? match[1] : remoteUri;
  };

  const getContactName = (
    displayName: string | undefined,
    remoteUri: string | undefined
  ): string => {
    if (displayName && remoteUri && displayName !== remoteUri) {
      return displayName;
    }
    if (!remoteUri || typeof remoteUri !== "string") return "";
    const match = remoteUri.match(/^sip:(.+)@/);
    return match ? match[1] : remoteUri;
  };

  // Determine which call to show
  let activeCall = currentCall;

  // If no current call but we have a callId param, resolve VoIP UUID ↔ SIP session id
  if (!activeCall && callId) {
    activeCall = getCallById(callId) ?? null;
  }

  // During transfers, show the active call (either parent or child)
  if (!activeCall) {
    // Find any call that has a child session ID (parent call) or parent session ID (child call)
    const transferCall = Object.values(calls).find(
      (call) => call.childSessionId || call.parentSessionId
    );
    if (transferCall) {
      activeCall = transferCall;
    }
  }

  // Fast banner hide/show: flip immediately on focus/blur (before nav transition completes).
  // Embedded instance under Keypad skips this — Keypad sets visibility for the tab + branch.
  useFocusEffect(
    React.useCallback(() => {
      if (suppressCallUiVisibilityHook) {
        return () => {};
      }
      setInCallUiVisible(true);
      return () => setInCallUiVisible(false);
    }, [setInCallUiVisible, suppressCallUiVisibilityHook])
  );

  // Fallback to any non-ended call
  if (!activeCall) {
    const activeCalls = Object.values(calls).filter(
      (call) =>
        call.state !== CallState.ENDED && call.state !== CallState.FAILED
    );
    if (activeCalls.length > 0) {
      activeCall = activeCalls[0];
    }
  }

  // Check if this is a VoIP call (after activeCall is determined)
  const isVoipCall = activeCall?.voipPayload !== undefined;

  if (activeCallId && activeCallId !== "dialing") {
    hadLiveCallRef.current = true;
  }
  if (
    activeCall &&
    activeCall.state !== CallState.ENDED &&
    activeCall.state !== CallState.FAILED
  ) {
    hadLiveCallRef.current = true;
  }

  const outboundDestination =
    route.params?.destination?.trim() ||
    route.params?.phoneNumber?.trim() ||
    "";

  const isPreSessionOutboundShell =
    !hadLiveCallRef.current &&
    !outboundSetupEndedRef.current &&
    !!outboundDestination &&
    (activeCallId === "dialing" || callId === "dialing");

  useEffect(() => {
    console.log("🟠 [InCallScreen] 📞 Component rendered:", {
      callId,
      activeCallId,
      activeCall: activeCall
        ? {
            sessionId: activeCall.sessionId,
            state: activeCall.state,
            connected: activeCall.connected,
            answerTime: activeCall.answerTime,
            remoteDisplayName: activeCall.remoteDisplayName
          }
        : null,
      allCalls: Object.keys(calls).map((key) => ({
        sessionId: calls[key].sessionId,
        state: calls[key].state,
        connected: calls[key].connected
      })),
      willShowAcceptDecline: activeCall?.state === CallState.INCOMING,
      timestamp: new Date().toISOString()
    });
  }, [callId, activeCallId, activeCall, calls]);

  const ongoingCallCount = React.useMemo(
    () =>
      Object.values(calls).filter(
        (c) =>
          c.state !== CallState.ENDED && c.state !== CallState.FAILED
      ).length,
    [calls]
  );

  // Navigate back only when no call remains (e.g. last leg ended). If activeCallId is
  // briefly cleared while another leg still exists, do not pop (second incoming decline).
  useEffect(() => {
    // Avoid bouncing back to the previous screen while we intentionally show the
    // "Dialing..." shell before the SIP session exists.
    if (isPreSessionOutboundShell || hasOngoingCall) return;
    if (isFocused && !activeCallId && ongoingCallCount === 0) {
      const timer = setTimeout(() => {
        // Show banner immediately when leaving call UI.
        setInCallUiVisible(false);
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate(Routes.BottomTabNavigator as never);
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [
    activeCallId,
    callId,
    hasOngoingCall,
    isFocused,
    isPreSessionOutboundShell,
    navigation,
    ongoingCallCount,
    setInCallUiVisible
  ]);

  // Cleanup ringtone when leaving incoming state or unmounting.
  // Ringtone is started by NativeIntegration.displayIncomingCall — do NOT start here
  // (would cause double ring). Only ensure we stop when call is answered/ended/dismissed.
  useEffect(() => {
    if (activeCall?.state === CallState.INCOMING) {
      return () => {
        InCallManager.stopRingtone();
        InCallManager.stopRingback();
        // Do not InCallManager.stop() here — SessionManager / NativeIntegration own the
        // in-call audio session after answer; stop() races and causes connected-but-silent calls.
      };
    }
  }, [activeCall?.state]);

  // Get connection quality for VoIP calls (simplified for now)
  const getConnectionQuality = (): "excellent" | "good" | "fair" | "poor" => {
    if (!isVoipCall) return "excellent";
    // In a real implementation, you'd calculate this based on network stats
    return "good";
  };

  const currentCallId = activeCall?.parentSessionId
    ? activeCall.parentSessionId
    : activeCall?.sessionId;

  // Extract phone number and look up contact information
  const phoneNumber = activeCall ? getPhoneNumber(activeCall.remoteUri) : "";
  const contactInfo = useContactLookup(phoneNumber);

  // Use contact name if found, otherwise fallback to display name
  const displayName =
    contactInfo?.name ||
    (activeCall
      ? getContactName(activeCall.remoteDisplayName, activeCall.remoteUri)
      : "");

  const handleMute = async () => {
    const vb = VoipBridge.getInstance();
    logMuteHoldDiag("mute", {
      phase: "press",
      currentCallId: currentCallId ?? null,
      hasActiveCall: !!activeCall,
      activeCallIdFromHook: activeCallId ?? null,
      activeSessionId: activeCall?.sessionId ?? null,
      activeParentSessionId: activeCall?.parentSessionId ?? null,
      isVoipTracked: currentCallId ? vb.isVoipCall(currentCallId) : false,
      hasSipSession: currentCallId ? !!getSipSession(currentCallId) : false,
      connected: activeCall?.connected,
      isMuted: activeCall?.isMuted
    });

    if (!currentCallId || !activeCall) {
      logMuteHoldDiag("mute", {
        phase: "early-return",
        reason: !currentCallId ? "missing currentCallId" : "missing activeCall"
      });
      return;
    }

    try {
      if (activeCall.isMuted) {
        logMuteHoldDiag("mute", { phase: "calling-unmuteCall", currentCallId });
        await unmuteCall(currentCallId);
      } else {
        logMuteHoldDiag("mute", { phase: "calling-muteCall", currentCallId });
        await muteCall(currentCallId);
      }
      logMuteHoldDiag("mute", { phase: "done-ok", currentCallId });
    } catch (error) {
      logMuteHoldDiag("mute", {
        phase: "error",
        currentCallId,
        message: (error as Error)?.message
      });
      logger.error("Failed to toggle mute:", error);
      toast.error("Error toggling mute for the call");
    }
  };

  const handleHold = async () => {
    const vb = VoipBridge.getInstance();
    logMuteHoldDiag("hold", {
      phase: "press",
      currentCallId: currentCallId ?? null,
      hasActiveCall: !!activeCall,
      activeCallIdFromHook: activeCallId ?? null,
      activeSessionId: activeCall?.sessionId ?? null,
      activeParentSessionId: activeCall?.parentSessionId ?? null,
      isVoipTracked: currentCallId ? vb.isVoipCall(currentCallId) : false,
      hasSipSession: currentCallId ? !!getSipSession(currentCallId) : false,
      connected: activeCall?.connected,
      isOnHold: activeCall?.isOnHold
    });

    if (!currentCallId || !activeCall) {
      logMuteHoldDiag("hold", {
        phase: "early-return",
        reason: !currentCallId ? "missing currentCallId" : "missing activeCall"
      });
      return;
    }

    try {
      if (activeCall.isOnHold) {
        logMuteHoldDiag("hold", { phase: "calling-unholdCall", currentCallId });
        await unholdCall(currentCallId);
      } else {
        logMuteHoldDiag("hold", { phase: "calling-holdCall", currentCallId });
        await holdCall(currentCallId);
      }
      logMuteHoldDiag("hold", { phase: "done-ok", currentCallId });
    } catch (error) {
      logMuteHoldDiag("hold", {
        phase: "error",
        currentCallId,
        message: (error as Error)?.message
      });
      logger.error("Failed to toggle hold:", error);
      Alert.alert("Error", "Unable to toggle hold. Please try again.");
    }
  };

  const handleAnswer = async () => {
    if (!currentCallId || isAnswering) return;
    try {
      setIsAnswering(true);
      await answerCall(currentCallId);
    } catch (error) {
      logger.error("Failed to answer call:", error);
      Alert.alert("Error", "Unable to answer the call. Please try again.");
    } finally {
      setIsAnswering(false);
    }
  };

  const handleHangup = async () => {
    outboundSetupEndedRef.current = true;
    if (!currentCallId) {
      if (callId === "dialing" || activeCallId === "dialing") {
        try {
          await hangupCall("dialing");
        } catch (error) {
          logger.error("Failed to hang up call:", error);
          Alert.alert("Error", "Unable to end the call. Please try again.");
        }
      }
      return;
    }
    try {
      await hangupCall(currentCallId);
    } catch (error) {
      logger.error("Failed to hang up call:", error);
      Alert.alert("Error", "Unable to end the call. Please try again.");
    }
  };

  const handleAudio = async () => {
    if (!currentCallId || !activeCall) return;

    try {
      await setSpeaker(currentCallId, !activeCall.isSpeakerOn);
    } catch (error) {
      logger.error("Failed to toggle speaker:", error);
      toast.error("Error toggling speakerphone");
    }
  };

  const handleKeypad = () => {
    if (!activeCall?.sessionId) return;
    if (!activeCall.connected) {
      toast.error("Wait for the call to connect before using the keypad");
      return;
    }
    openDrawer(
      <InCallKeypadDrawer
        callId={activeCall.sessionId}
        onClose={closeDrawer}
      />,
      0.7
    );
  };

  const handleAddCall = () => {
    if (!currentCallId || !activeCall) return;

    openDrawer(
      <TransferContactDrawer
        onContactSelected={handleAddCallContactSelected}
        onCancel={closeDrawer}
        title="Add Person to Call"
      />,
      0.9
    );
  };

  const handleAddCallContactSelected = async (contact: TransferContact) => {
    if (!currentCallId) return;

    try {
      // Start attended transfer (which will dial the new person)
      const newCallId = await startAttendedTransfer(
        currentCallId,
        contact.number,
        { displayName: contact.name }
      );

      if (newCallId) {
        // Replace drawer content directly (avoid close+open race where close animation
        // can later call resetDrawerState and wipe the merge UI)
        openDrawer(
          <MergeCallDrawer
            onMerge={handleMergeCall}
            onCancel={() => handleCancelMerge(newCallId)}
          />,
          0.4
        );
      } else {
        closeDrawer();
      }
    } catch (error) {
      logger.error("Failed to add call:", error);
      toast.error("Failed to add person to call");
      closeDrawer();
    }
  };

  const handleMergeCall = async () => {
    try {
      await mergeAttendedTransfer("conferenceMerge");
      closeDrawer();
      toast.success("Call merged successfully");
    } catch (error) {
      logger.error("Failed to merge call:", error);
      toast.error("Failed to merge call");
    }
  };

  const handleCancelMerge = async (callIdToCancel: string) => {
    console.log("callIdToCancel", callIdToCancel);
    try {
      if (currentCallId) {
        await cancelAttendedTransfer(currentCallId);
      }
      closeDrawer();
    } catch (error) {
      logger.error("Failed to cancel merge:", error);
      toast.error("Failed to cancel");
    }
  };

  const handleTransfer = () => {
    if (!currentCallId || !activeCall) return;

    openDrawer(
      <TransferContactDrawer
        onContactSelected={handleContactSelected}
        onCancel={closeDrawer}
      />,
      0.9
    );
  };

  const handleContactSelected = (contact: TransferContact) => {
    if (!currentCallId) return;

    openDrawer(
      <TransferOptionsDrawer
        contact={contact}
        onTransferTypeSelected={(transferType) =>
          handleTransferTypeSelected(contact, transferType)
        }
        onCancel={closeDrawer}
      />,
      0.9,
      {
        preventSwipeClose: true,
        preventBackdropClose: true,
        onHardwareBackPress: () => closeDrawer()
      }
    );
  };

  const handleTransferTypeSelected = async (
    contact: TransferContact,
    transferType: TransferType
  ) => {
    if (!currentCallId) return;
    const transferStateSnapshot = () => {
      const parent = calls[currentCallId];
      const childId = parent?.childSessionId;
      const child = childId ? calls[childId] : undefined;
      return {
        activeCallId,
        originalCallId: currentCallId,
        parentCallId: parent?.sessionId,
        childCallId: child?.sessionId,
        parentState: parent?.state,
        childState: child?.state,
        parentOnHold: parent?.isOnHold,
        childOnHold: child?.isOnHold,
        parentChildSessionId: parent?.childSessionId,
        childParentSessionId: child?.parentSessionId,
        callIds: Object.keys(calls)
      };
    };

    const label = transferSuccessLabel(contact);
    const loadingSubtitle =
      transferType === "blind" ? "Completing transfer" : "Placing the call";
    const loadingTitle =
      transferType === "blind"
        ? `Transferring to ${label}…`
        : `Calling ${label}…`;

    openDrawer(
      <View style={styles.addPersonLoadingInner}>
        <LoadingSpinner size={40} />
        <WhiteSpace height={padding.lg} />
        <Text
          color="color-colors-text-text-primary"
          size={fontSize.lg}
          weight="semiBold"
          align="center"
        >
          {loadingTitle}
        </Text>
        <WhiteSpace height={padding.sm} />
        <Text
          color="color-colors-text-text-secondary"
          size={fontSize.md}
          align="center"
        >
          {loadingSubtitle}
        </Text>
      </View>,
      0.45,
      {
        preventSwipeClose: true,
        preventBackdropClose: true,
        onHardwareBackPress: () => true
      }
    );

    try {
      if (transferType === "blind") {
        logger.warn("[TRANSFER_TRACE][UI] blind transfer starting", {
          ...transferStateSnapshot(),
          contactNumber: contact.number
        });
        await transferCall(currentCallId, contact.number);
        logger.warn("[TRANSFER_TRACE][UI] blind transfer completed");
        toast.success(`Call transferred to ${label}`);
        closeDrawer();
      } else if (transferType === "attended") {
        logger.warn("[TRANSFER_TRACE][UI] Ask First (attended) starting", {
          ...transferStateSnapshot(),
          contactName: contact.name,
          contactNumber: contact.number
        });
        const transferCallId = await startAttendedTransfer(
          currentCallId,
          contact.number,
          { displayName: contact.name }
        );
        logger.warn("[TRANSFER_TRACE][UI] startAttendedTransfer success", {
          ...transferStateSnapshot(),
          transferCallId,
          contactNumber: contact.number
        });

        openDrawer(
          <TransferStateDrawer
            onCancel={handleTransferCancel}
            originalCallId={currentCallId}
            transferCallId={transferCallId}
          />,
          0.9,
          {
            preventSwipeClose: true,
            preventBackdropClose: true,
            onHardwareBackPress: () => {
              void handleTransferCancel();
            }
          }
        );
        logger.warn("[TRANSFER_TRACE][UI] TransferStateDrawer opened", {
          ...transferStateSnapshot(),
          transferCallId
        });
      }
    } catch (error) {
      logger.error("[TRANSFER_TRACE][UI] transfer flow failed", {
        transferType,
        ...transferStateSnapshot(),
        contactNumber: contact.number,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      logger.error("Transfer failed:", error);
      toast.error("Transfer failed. Please try again.");
      closeDrawer();
    }
  };

  const handleTransferCancel = async () => {
    try {
      logger.debug("[TRANSFER_TRACE][UI] transfer cancel requested", {
        activeCallId,
        callIds: Object.keys(calls)
      });
      // Find parent and child calls using session ID pointers
      const parentCall = Object.values(calls).find(
        (call) => call.childSessionId
      );
      if (parentCall?.childSessionId) {
        const childCall = calls[parentCall.childSessionId];
        if (childCall) {
          await cancelAttendedTransfer(parentCall.sessionId);
        }
      }
      closeDrawer();
    } catch (error) {
      logger.error("Error cancelling transfer:", error);
      Alert.alert(
        "Transfer Cancel Failed",
        error instanceof Error
          ? error.message
          : "Unable to cancel transfer. Please try again."
      );
    }
  };

  const handleViewParticipants = () => {
    if (!currentCallId || !activeCall || !activeCall.conferenceId) return;

    openDrawer(
      <ConferenceParticipantsDrawer
        callId={activeCall.callId}
        conferenceId={activeCall.conferenceId}
        onClose={closeDrawer}
      />,
      0.9
    );
  };

  const handleBackToApp = () => {
    // Show banner immediately when leaving call UI.
    setInCallUiVisible(false);
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate(Routes.BottomTabNavigator as never);
  };

  const insets = useSafeAreaInsets();

  if (!activeCall) {
    const destination = outboundDestination;
    const shellName = (route.params?.displayName || destination || "Calling").trim();
    const shellAvatar = route.params?.avatarPath || null;
    const showDialingShell = isPreSessionOutboundShell;

    if (showDialingShell) {
      const controlsDisabled = true;
      return (
        <View
          style={[
            styles.container,
            { paddingBottom: insets.bottom + padding.sm, paddingTop: insets.top + padding.sm}
          ]}
        >
          <TouchableOpacity
            style={styles.backToAppButton}
            onPress={() => {}}
            disabled
          >
            <Icon name="chevron-left" size={18} type="outline" />
            <Text
              color="color-colors-text-text-tertiary"
              size={fontSize.sm}
              weight="semiBold"
            >
              Back to app
            </Text>
          </TouchableOpacity>

          <View style={styles.content}>
            <WhiteSpace height={padding.xl} />
            <Avatar
              size={80}
              borderRadius={borderRadius.full}
              name={shellName}
              source={shellAvatar || undefined}
            />
            <WhiteSpace height={padding.xl} />
            <Text
              color="color-colors-text-text-primary"
              size={fontSize["2xl"]}
              weight="semiBold"
              align="center"
            >
              {shellName}
            </Text>
            <WhiteSpace height={padding.sm} />
            <View style={styles.phoneNumberContainer}>
              <Text
                color="color-colors-text-text-secondary"
                size={fontSize.lg}
                weight="medium"
                align="center"
              >
                {destination}
              </Text>
            </View>
            <WhiteSpace height={padding.md} />
            <Text
              color="color-colors-text-text-secondary"
              size={fontSize.lg}
              weight="medium"
              align="center"
            >
              Dialing...
            </Text>
            <WhiteSpace height={padding.sm} />
            <Text
              color="color-colors-text-text-tertiary"
              size={fontSize.sm}
              weight="regular"
              align="center"
            >
              Setting up your call...
            </Text>
          </View>

          <View style={styles.controlsGrid}>
            <View style={styles.controlsRow}>
              <CallControlButton
                icon={"volume-max"}
                label="Speaker"
                onPress={() => {}}
                disabled={controlsDisabled}
              />
              <CallControlButton
                icon="dots-grid"
                label="Keypad"
                onPress={() => {}}
                disabled={controlsDisabled}
              />
              <CallControlButton
                icon="microphone-off-02"
                label="Mute"
                onPress={() => {}}
                disabled={controlsDisabled}
              />
            </View>
            <WhiteSpace height={padding.xl} />
            <View style={styles.controlsRow}>
              <CallControlButton
                icon="phone-outgoing-01"
                label="Transfer"
                onPress={() => {}}
                disabled={controlsDisabled}
              />
              <CallControlButton
                icon="users-01"
                label="Add Person"
                onPress={() => {}}
                disabled={controlsDisabled}
              />
              <CallControlButton
                icon="phone-pause"
                label="Hold"
                onPress={() => {}}
                disabled={controlsDisabled}
              />
            </View>
          </View>

          <View style={styles.bottomSection}>
            <Button
              type="primary"
              onPress={handleHangup}
              containerStyle={[
                styles.endCallButton,
                {
                  backgroundColor:
                    theme.colors[
                      "component-colors-components-buttons-primary-error-button-primary-error-bg"
                    ]
                }
              ]}
              size={fontSize.md}
              weight="semiBold"
            >
              End Call
            </Button>
          </View>
        </View>
      );
    }

    const isConnecting = !!activeCallId;
    return (
      <View style={[styles.container,]}>
        <View style={styles.content}>
          <WhiteSpace height={padding["4xl"]} />
          <View style={styles.loadingContainer}>
            <LoadingSpinner size={40} />
            <WhiteSpace height={padding.lg} />
            <Text
              color="color-colors-text-text-secondary"
              size={fontSize.lg}
              weight="medium"
              align="center"
            >
              {isConnecting ? "Connecting..." : "Call Ended"}
            </Text>
            <WhiteSpace height={padding.md} />
            <Text
              color="color-colors-text-text-tertiary"
              size={fontSize.sm}
              weight="regular"
              align="center"
            >
              {isConnecting
                ? "Setting up your call..."
                : "Returning to previous screen..."}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: hideBackToApp ? padding.sm : insets.top + padding.sm
        }
      ]}
    >
      {!hideBackToApp ? (
        <TouchableOpacity
          style={styles.backToAppButton}
          onPress={handleBackToApp}
        >
          <Icon name="chevron-left" size={18} type="outline" />
          <Text
            color="color-colors-text-text-secondary"
            size={fontSize.sm}
            weight="semiBold"
          >
            Back to app
          </Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.content}>
        <WhiteSpace height={padding.xl} />

        <Avatar
          size={64}
          borderRadius={borderRadius.md}
          name={displayName}
          source={contactInfo?.avatarPath || undefined}
        />
        <WhiteSpace height={padding.xl} />

        <Text
          color="color-colors-text-text-primary"
          size={fontSize["2xl"]}
          weight="semiBold"
          align="center"
        >
          {contactInfo?.name || displayName}
        </Text>

        <WhiteSpace height={padding.sm} />

        <View style={styles.phoneNumberContainer}>
          <Text
            color="color-colors-text-text-secondary"
            size={fontSize.lg}
            weight="medium"
            align="center"
          >
            {phoneNumber}
          </Text>
          {isVoipCall && (
            <View style={styles.voipIndicator}>
              <Text
                color="color-colors-text-text-tertiary"
                size={fontSize.xs}
                weight="medium"
              >
                VoIP
              </Text>
            </View>
          )}
        </View>

        {activeCall.recording && (
          <>
            <WhiteSpace height={padding.xs} />
            <Text
              color="color-colors-text-text-tertiary"
              size={fontSize.sm}
              weight="medium"
              align="center"
            >
              🔴 Recording
            </Text>
          </>
        )}

        {activeCall.conferencing && (
          <>
            <WhiteSpace height={padding.xs} />
            <Text
              color="color-colors-text-text-tertiary"
              size={fontSize.sm}
              weight="medium"
              align="center"
            >
              📞 Conference Call
            </Text>
          </>
        )}

        <WhiteSpace height={padding.sm} />

        <CallTimer
          startTime={activeCall.startTime}
          answerTime={activeCall.answerTime}
          callState={activeCall.state}
          isOnHold={activeCall.isOnHold}
          isVoipCall={isVoipCall}
          connectionQuality={getConnectionQuality()}
        />

        <WhiteSpace height={padding["4xl"]} />
      </View>

      {activeCall.state === CallState.INCOMING ? (
        <View style={styles.bottomSection}>
          <View style={styles.incomingCallButtons}>
            <Button
              type="primary"
              onPress={handleHangup}
              containerStyle={[
                styles.declineButton,
                {
                  backgroundColor:
                    theme.colors[
                      "component-colors-components-buttons-primary-error-button-primary-error-bg"
                    ]
                }
              ]}
              size={fontSize.md}
              weight="semiBold"
            >
              Decline
            </Button>
            <Button
              type="primary"
              onPress={handleAnswer}
              disabled={isAnswering}
              containerStyle={[
                styles.answerButton,
                {
                  backgroundColor: isAnswering ? "#6B7280" : "#10B981"
                }
              ]}
              size={fontSize.md}
              weight="semiBold"
            >
              {isAnswering ? "Connecting..." : "Answer"}
            </Button>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.controlsGrid}>
            <View style={styles.controlsRow}>
              <CallControlButton
                icon={"volume-max"}
                label="Speaker"
                onPress={handleAudio}
                isActive={activeCall.isSpeakerOn}
              />
              <CallControlButton
                icon="dots-grid"
                label="Keypad"
                onPress={handleKeypad}
                disabled={!activeCall.connected}
              />
              <CallControlButton
                icon="microphone-off-02"
                label="Mute"
                onPress={handleMute}
                isActive={activeCall.isMuted}
              />
            </View>

            <WhiteSpace height={padding.xl} />

            <View style={styles.controlsRow}>
              {activeCall.conferencing ? (
                <>
                  <CallControlButton
                    icon="users-01"
                    label="Participants"
                    onPress={handleViewParticipants}
                  />
                  <CallControlButton
                    icon="phone-pause"
                    label="Hold"
                    onPress={handleHold}
                    isActive={activeCall.isOnHold}
                  />
                  <CallControlButton
                    icon="user-plus-01"
                    label="Add"
                    onPress={handleAddCall}
                  />
                </>
              ) : (
                <>
                  <CallControlButton
                    icon="phone-outgoing-01"
                    label="Transfer"
                    onPress={handleTransfer}
                  />
                  <CallControlButton
                    icon="users-01"
                    label="Add Person"
                    onPress={handleAddCall}
                  />
                  <CallControlButton
                    icon="phone-pause"
                    label="Hold"
                    onPress={handleHold}
                    isActive={activeCall.isOnHold}
                  />
                </>
              )}
            </View>
          </View>

          <View style={styles.bottomSection}>
            <Button
              type="primary"
              onPress={handleHangup}
              containerStyle={[
                styles.endCallButton,
                {
                  backgroundColor:
                    theme.colors[
                      "component-colors-components-buttons-primary-error-button-primary-error-bg"
                    ]
                }
              ]}
              size={fontSize.md}
              weight="semiBold"
            >
              End Call
            </Button>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: padding["3xl"],
    justifyContent: "space-between"
  },
  backToAppButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: padding.xs
  },
  content: {
    flex: 1,
    alignItems: "center"
  },
  controlsGrid: {
    alignItems: "center",
    width: "100%"
  },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: padding.lg,
    gap: padding["4xl"]
  },
  bottomSection: {
    paddingTop: padding["2xl"],
    paddingBottom: padding.xl,
    marginBottom: padding.lg
  },
  incomingCallButtons: {
    flexDirection: "row",
    gap: padding.lg,
    width: "100%"
  },
  endCallButton: {
    paddingVertical: padding.lg,
    borderRadius: borderRadius.lg
  },
  answerButton: {
    flex: 1,
    paddingVertical: padding.lg,
    borderRadius: borderRadius.lg
  },
  declineButton: {
    flex: 1,
    paddingVertical: padding.lg,
    borderRadius: borderRadius.lg
  },
  loadingContainer: {
    alignItems: "center"
  },
  addPersonLoadingInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: padding.xl,
    minHeight: 200
  },
  phoneNumberContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: padding.sm
  },
  voipIndicator: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: padding.sm,
    paddingVertical: padding.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: "#D1D5DB"
  }
});
