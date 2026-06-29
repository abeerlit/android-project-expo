import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { Button } from "shared/components/Button.tsx";
import { Avatar } from "shared/components/Avatar.tsx";

// Context
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { useSoftphone } from "core/softphone/useSoftphone.ts";
import Icon from "shared/components/Icon.tsx";
import { Logger } from "shared/utils/Logger.ts";
import { CallState } from "core/softphone/types.ts";
import type { ContextCallInfo } from "core/softphone/SoftphoneContext.ts";

interface TransferStateDrawerProps {
  onCancel?: () => void;
  /** Original (held) call — used to resolve pair if strict lookup races state */
  originalCallId?: string;
  /** Child transfer leg session id from startAttendedTransfer */
  transferCallId?: string;
}

function buildPairDiagnostic(
  calls: Record<string, ContextCallInfo>,
  activeCallId: string | undefined,
  originalCallId: string | undefined,
  transferCallId: string | undefined,
  strictParent: ContextCallInfo | undefined,
  strictChild: ContextCallInfo | null | undefined,
  resolvedParent: ContextCallInfo | undefined,
  resolvedChild: ContextCallInfo | null | undefined,
  isLiveCall: (c?: ContextCallInfo | null) => boolean
) {
  const callIds = Object.keys(calls);
  const firstWithChild = Object.values(calls).find((c) => c.childSessionId);
  const pointer = firstWithChild?.childSessionId;
  const childAtPointer = pointer ? calls[pointer] : undefined;

  let propsParent: ContextCallInfo | undefined;
  let propsChild: ContextCallInfo | undefined;
  if (originalCallId && transferCallId) {
    propsParent = calls[originalCallId];
    propsChild = calls[transferCallId];
  }

  return {
    activeCallId,
    originalCallId,
    transferCallId,
    callIds,
    parentResolved: !!resolvedParent,
    childResolved: !!resolvedChild,
    parentCallSessionId: resolvedParent?.sessionId,
    childCallSessionId: resolvedChild?.sessionId,
    strictParentSessionId: strictParent?.sessionId,
    strictChildSessionId: strictChild?.sessionId,
    parentState: resolvedParent?.state,
    childState: resolvedChild?.state,
    isLiveParent: resolvedParent ? isLiveCall(resolvedParent) : undefined,
    isLiveChild: resolvedChild ? isLiveCall(resolvedChild) : undefined,
    firstCallWithChildPointer: firstWithChild
      ? {
          sessionId: firstWithChild.sessionId,
          childSessionId: firstWithChild.childSessionId
        }
      : undefined,
    lookupChildForFirstPointerUndefined:
      pointer !== undefined ? !(pointer in calls) : undefined,
    lookupChild: childAtPointer,
    lookupChildIsUndefined: pointer !== undefined ? !(pointer in calls) : undefined,
    childAtFirstPointerState: childAtPointer?.state,
    propsRow: originalCallId
      ? {
          parentChildSessionId: propsParent?.childSessionId,
          childParentSessionId: propsChild?.parentSessionId,
          callsParentChildPointerUndefined:
            propsParent?.childSessionId !== undefined
              ? !(propsParent.childSessionId in calls)
              : undefined,
          callsTransferIdUndefined:
            transferCallId !== undefined
              ? !(transferCallId in calls)
              : undefined
        }
      : undefined
  };
}

const logger = new Logger("TransferStateDrawer");

export const TransferStateDrawer = ({
  onCancel,
  originalCallId,
  transferCallId: transferCallIdProp
}: TransferStateDrawerProps) => {
  const _theme = useTheme();
  const { closeDrawer } = useDrawer();
  const {
    calls,
    activeCallId,
    cancelAttendedTransfer,
    completeAttendedTransfer,
    swapAttendedTransferCalls
  } = useSoftphone();

  const isLiveCall = (call?: ContextCallInfo | null) =>
    !!call && call.state !== CallState.ENDED;

  // Strict: both legs live (used for UI once state is consistent)
  const strictParent = Object.values(calls).find((call) => {
    if (!call.childSessionId || !isLiveCall(call)) return false;
    const child = calls[call.childSessionId];
    return isLiveCall(child);
  });
  const strictChild = strictParent?.childSessionId
    ? calls[strictParent.childSessionId]
    : null;

  let parentCall = strictParent;
  let childCall: ContextCallInfo | null | undefined = strictChild;

  if ((!parentCall || !childCall) && originalCallId && transferCallIdProp) {
    const p = calls[originalCallId];
    const c = calls[transferCallIdProp];
    const linked =
      p &&
      c &&
      isLiveCall(p) &&
      isLiveCall(c) &&
      (p.childSessionId === transferCallIdProp ||
        c.parentSessionId === originalCallId);
    if (linked) {
      parentCall = p;
      childCall = c;
    }
  }

  // Determine which call to display:
  // 1. Show child while dialing/connecting.
  // 2. Prefer activeCallId as source of truth.
  // 3. Fall back to hold-state inference.
  const displayCall = (() => {
    if (!childCall) return parentCall;

    // Show child during initial dialing/connecting
    if (
      childCall.state === CallState.OUTGOING ||
      childCall.state === CallState.CONNECTING
    ) {
      logger.debug("TransferStateDrawer: Showing child (dialing)", {
        childState: childCall.state
      });
      return childCall;
    }

    // Prefer active call from provider state.
    if (activeCallId === parentCall?.sessionId) {
      return parentCall;
    }
    if (activeCallId === childCall?.sessionId) {
      return childCall;
    }

    // Fallback: whichever call is active (not on hold)
    if (parentCall && !parentCall.isOnHold) {
      logger.debug("TransferStateDrawer: Showing parent (active)", {
        parentId: parentCall.sessionId,
        parentOnHold: parentCall.isOnHold,
        childOnHold: childCall.isOnHold
      });
      return parentCall;
    } else if (childCall && !childCall.isOnHold) {
      logger.debug("TransferStateDrawer: Showing child (active)", {
        childId: childCall.sessionId,
        parentOnHold: parentCall?.isOnHold,
        childOnHold: childCall.isOnHold
      });
      return childCall;
    }

    // Fallback to child if both are on hold (shouldn't happen)
    logger.warn("TransferStateDrawer: Both calls on hold, showing child", {
      parentOnHold: parentCall?.isOnHold,
      childOnHold: childCall?.isOnHold
    });
    return childCall;
  })();

  // Determine if we're showing parent or child
  const isShowingParent = displayCall?.sessionId === parentCall?.sessionId;
  const isShowingChild = displayCall?.sessionId === childCall?.sessionId;

  // Log the current display state for debugging
  logger.debug("TransferStateDrawer: Current display", {
    showingParent: isShowingParent,
    showingChild: isShowingChild,
    displayCallId: displayCall?.sessionId,
    displayCallState: displayCall?.state,
    displayCallOnHold: displayCall?.isOnHold
  });

  // Extract contact info from the displayed call
  const transferContact = displayCall
    ? {
        name: displayCall.remoteDisplayName || displayCall.remoteUri,
        number: displayCall.remoteUri,
        avatarPath: undefined // No avatar path available from call data
      }
    : null;

  const hadValidPairRef = useRef(false);

  const pairDiagKey = useMemo(
    () =>
      [
        parentCall?.sessionId ?? "np",
        childCall?.sessionId ?? "nc",
        Object.keys(calls).sort().join(","),
        originalCallId ?? "",
        transferCallIdProp ?? ""
      ].join("|"),
    [parentCall, childCall, calls, originalCallId, transferCallIdProp]
  );

  useEffect(() => {
    const hasPair = !!(
      parentCall &&
      childCall &&
      isLiveCall(parentCall) &&
      isLiveCall(childCall)
    );
    if (hasPair) {
      hadValidPairRef.current = true;
      return;
    }

    logger.warn("[TRANSFER_TRACE][PAIR] snapshot_no_pair", {
      ...buildPairDiagnostic(
        calls,
        activeCallId,
        originalCallId,
        transferCallIdProp,
        strictParent,
        strictChild,
        parentCall,
        childCall,
        isLiveCall
      )
    });
  }, [pairDiagKey]);

  useEffect(() => {
    const hasPair = !!(
      parentCall &&
      childCall &&
      isLiveCall(parentCall) &&
      isLiveCall(childCall)
    );
    if (hasPair) {
      hadValidPairRef.current = true;
      return;
    }

    const basePayload = buildPairDiagnostic(
      calls,
      activeCallId,
      originalCallId,
      transferCallIdProp,
      strictParent,
      strictChild,
      parentCall,
      childCall,
      isLiveCall
    );

    if (hadValidPairRef.current) {
      logger.warn("[TRANSFER_TRACE][PAIR] auto_close", {
        ...basePayload,
        closeReason: "pair_lost_after_valid" as const
      });
      closeDrawer();
      return;
    }

    const timer = setTimeout(() => {
      if (!hadValidPairRef.current) {
        logger.warn("[TRANSFER_TRACE][PAIR] auto_close", {
          ...basePayload,
          closeReason: "grace_expired_no_pair" as const
        });
        closeDrawer();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [
    parentCall?.sessionId,
    childCall?.sessionId,
    parentCall?.state,
    childCall?.state,
    closeDrawer
  ]);

  const handleCancel = async () => {
    try {
      // Cancel using either parent or active call ID (our updated method handles both)
      if (parentCall) {
        await cancelAttendedTransfer(parentCall.sessionId);
      } else if (originalCallId && transferCallIdProp) {
        await cancelAttendedTransfer(originalCallId);
      } else if (activeCallId) {
        await cancelAttendedTransfer(activeCallId);
      }
      closeDrawer();

      // Call the provided onCancel callback if it exists
      if (onCancel) {
        onCancel();
      }
    } catch (error) {
      logger.error("[TRANSFER_TRACE][UI] cancel attended transfer failed", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        parentSessionId: parentCall?.sessionId,
        activeCallId
      });
      // Still close drawer even if cancel fails
      closeDrawer();
      if (onCancel) {
        onCancel();
      }
    }
  };

  const handleSwap = async () => {
    try {
      if (parentCall && childCall) {
        logger.debug("Swapping attended transfer calls", {
          parentCallId: parentCall.sessionId,
          childCallId: childCall.sessionId,
          currentActiveCallId: activeCallId,
          isShowingParent,
          isShowingChild
        });

        await swapAttendedTransferCalls(
          parentCall.sessionId,
          childCall.sessionId
        );

        // The display will automatically update based on hold states
        logger.debug(
          "Swap completed, display will show the newly active (not on hold) call"
        );
      } else {
        logger.warn("Cannot swap - parent or child call not found", {
          hasParent: !!parentCall,
          hasChild: !!childCall
        });
      }
    } catch (error) {
      logger.error("[TRANSFER_TRACE][UI] swap attended transfer failed", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        parentCallId: parentCall?.sessionId,
        childCallId: childCall?.sessionId
      });
    }
  };

  const handleTransfer = async () => {
    try {
      if (!parentCall || !childCall || !isLiveCall(parentCall) || !isLiveCall(childCall)) {
        logger.warn("TransferStateDrawer: No live transfer pair, closing drawer");
        closeDrawer();
        return;
      }
      logger.warn("[TRANSFER_TRACE][UI] Transfer button — complete attended", {
        parentSessionId: parentCall.sessionId,
        childSessionId: childCall.sessionId
      });
      await completeAttendedTransfer();
      logger.warn("[TRANSFER_TRACE][UI] complete attended transfer finished");
      closeDrawer();
    } catch (error) {
      logger.error("[TRANSFER_TRACE][UI] Transfer button — complete failed", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        parentSessionId: parentCall?.sessionId,
        childSessionId: childCall?.sessionId
      });
      // Still close drawer even if complete fails
      closeDrawer();
    }
  };

  const getStateDisplay = () => {
    // Early return if no transfer is in progress
    if (!parentCall || !childCall || !transferContact) {
      return {
        title: "Transfer",
        subtitle: "No transfer in progress",
        showSwap: false,
        showTransfer: false,
        callLabel: ""
      };
    }

    // Determine call label and state based on which call is shown
    let callLabel = "";
    let callState = "";

    if (isShowingParent) {
      callLabel = "Original Call";
      // Use consistent state values
      if (
        parentCall.state === CallState.CONNECTED ||
        parentCall.state === CallState.HOLDING
      ) {
        callState = parentCall.isOnHold ? "On Hold" : "Connected";
      } else {
        callState = "Connected"; // Parent should always be connected during transfer
      }
    } else if (isShowingChild) {
      callLabel = "Transfer Call";
      if (childCall.state === CallState.CONNECTED) {
        callState = childCall.isOnHold ? "On Hold" : "Connected";
      } else if (
        childCall.state === CallState.OUTGOING ||
        childCall.state === CallState.CONNECTING
      ) {
        callState = "Dialing";
      } else {
        // Fallback - shouldn't happen
        callState = "Connected";
      }
    }

    // Global transfer state checks - these don't depend on which call is displayed
    // Show transfer button when child is connected
    const canTransfer = childCall.state === CallState.CONNECTED;
    // Show swap button when both calls are connected or holding (can swap between them)
    const canSwap =
      parentCall &&
      childCall &&
      (childCall.state === CallState.CONNECTED ||
        childCall.state === CallState.HOLDING) &&
      (parentCall.state === CallState.CONNECTED ||
        parentCall.state === CallState.HOLDING);

    // Debug logging
    logger.debug("TransferStateDrawer: State display calculation", {
      callState,
      callLabel,
      canSwap,
      canTransfer,
      isShowingParent,
      isShowingChild,
      parentState: parentCall?.state,
      childState: childCall?.state,
      parentOnHold: parentCall?.isOnHold,
      childOnHold: childCall?.isOnHold
    });

    switch (callState) {
      case "Dialing":
        return {
          title: "Dialing...",
          subtitle: `Attempting to reach ${transferContact.name}`,
          showSwap: false,
          showTransfer: false,
          callLabel
        };
      case "Connected":
        return {
          title: callState,
          subtitle: `${transferContact.name} - ${callLabel}`,
          showSwap: canSwap,
          showTransfer: canTransfer,
          callLabel
        };
      case "On Hold":
        return {
          title: callState,
          subtitle: `${transferContact.name} - ${callLabel}`,
          showSwap: canSwap,
          showTransfer: canTransfer,
          callLabel
        };
      default:
        return {
          title: callState || "Transfer",
          subtitle: `${transferContact.name} - ${callLabel}`,
          showSwap: false,
          showTransfer: false,
          callLabel
        };
    }
  };

  const stateDisplay = getStateDisplay();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Contact Info */}
        <View style={styles.contactSection}>
          <WhiteSpace height={padding.xl} />
          <Avatar
            source={transferContact?.avatarPath}
            name={transferContact?.name || "Unknown"}
            size={64}
            borderRadius={borderRadius.md}
          />

          <WhiteSpace height={padding.xs} />

          <Text
            size={fontSize.md}
            align="center"
            color="color-colors-text-text-secondary"
          >
            {transferContact?.number || "Unknown number"}
          </Text>

          <WhiteSpace height={padding.lg} />

          {/* State Display */}
          <View style={styles.stateSection}>
            <Text
              size={fontSize.lg}
              weight="semiBold"
              align="center"
              color="color-colors-text-text-primary"
            >
              {stateDisplay.title}
            </Text>

            {stateDisplay.subtitle && (
              <>
                <WhiteSpace height={padding.xs} />
                <Text
                  size={fontSize.md}
                  align="center"
                  color="color-colors-text-text-secondary"
                >
                  {stateDisplay.subtitle}
                </Text>
              </>
            )}
          </View>
        </View>

        <WhiteSpace height={padding["4xl"]} />
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {/* Swap Button - Only show when connected */}
        {stateDisplay.showSwap && (
          <Button
            onPress={handleSwap}
            type="text"
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: padding.sm
            }}
          >
            <Text weight={"medium"}>Swap</Text>
            <Icon name={"switch-horizontal-02"} />
          </Button>
        )}

        {/* Cancel Button */}
        <Button
          onPress={handleCancel}
          type={"outline"}
          style={styles.buttonWrapper}
        >
          Cancel
        </Button>

        <Button
          onPress={handleTransfer}
          type="primary"
          style={styles.buttonWrapper}
          disabled={!stateDisplay.showTransfer}
        >
          Transfer
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  content: {
    flex: 1,
    paddingHorizontal: padding["2xl"],
    alignItems: "center",
    justifyContent: "space-between"
  },
  contactSection: {
    alignItems: "center",
    width: "100%"
  },
  stateSection: {
    alignItems: "center",
    width: "100%"
  },
  buttonContainer: {
    display: "flex",
    flexDirection: "row",
    paddingHorizontal: padding.xl,
    gap: padding.sm,
    paddingBottom: padding.xl
  },
  buttonRow: {
    flexDirection: "row",
    gap: padding.md
  },
  buttonWrapper: {
    flex: 1
  },
  actionButton: {
    paddingVertical: padding.md
  }
});
