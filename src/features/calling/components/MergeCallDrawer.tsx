import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { fontSize, padding } from "core/theme/theme.ts";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { Button } from "shared/components/Button.tsx";

// Context
import { useSoftphone } from "core/softphone/useSoftphone.ts";
import Icon from "shared/components/Icon.tsx";
import { Logger } from "shared/utils/Logger.ts";
import { ContextCallInfo } from "core/softphone/SoftphoneContext.ts";
import { CallState } from "core/softphone/types.ts";

const SIP_URI_USER = /^sip:([^@>;,\s]+)@/i;

/** Prefer picked contact name; never surface raw sip:… URLs as the primary label. */
function mergeCallPrimaryLabel(call: ContextCallInfo): string {
  const picked = call.contactDisplayName?.trim();
  if (picked) return picked;
  const rd = call.remoteDisplayName?.trim();
  if (rd && !/^sip:/i.test(rd)) return rd;
  const uri = call.remoteUri?.trim() ?? "";
  const m = uri.match(SIP_URI_USER);
  if (m?.[1]) return m[1];
  if (uri && !/^sip:/i.test(uri)) return uri;
  return rd || "Unknown";
}

/** Secondary line only when no address-book name: show extension/user part, never full SIP URL. */
function mergeCallSecondaryLine(call: ContextCallInfo): string | null {
  if (call.contactDisplayName?.trim()) return null;
  const uri = call.remoteUri?.trim() ?? "";
  const m = uri.match(SIP_URI_USER);
  if (m?.[1]) return m[1];
  return null;
}

interface MergeCallDrawerProps {
  onMerge: () => void;
  onCancel: () => void;
}

const logger = new Logger("MergeCallDrawer");

export const MergeCallDrawer = ({
  onMerge,
  onCancel
}: MergeCallDrawerProps) => {
  const _theme = useTheme();
  const { calls, swapAttendedTransferCalls } = useSoftphone();

  // Find transfer relationship calls
  const parentCall = Object.values(calls).find((call) => call.childSessionId);
  const childCall = parentCall?.childSessionId
    ? calls[parentCall.childSessionId]
    : null;

  // Determine which call to display - simple logic:
  // Show whichever call is NOT on hold (the active one)
  const displayCall = (() => {
    if (!childCall) return parentCall;

    // Show child during initial dialing/connecting
    if (
      childCall.state === CallState.OUTGOING ||
      childCall.state === CallState.CONNECTING
    ) {
      return childCall;
    }

    // Show whichever call is active (not on hold)
    if (parentCall && !parentCall.isOnHold) {
      return parentCall;
    } else if (childCall && !childCall.isOnHold) {
      return childCall;
    }

    // Fallback to child if both are on hold
    return childCall;
  })();

  const contact = displayCall
    ? {
        name: mergeCallPrimaryLabel(displayCall),
        secondaryLine: mergeCallSecondaryLine(displayCall)
      }
    : null;

  const handleSwap = async () => {
    try {
      if (parentCall && childCall) {
        logger.debug("Swapping calls for merge", {
          parentCallId: parentCall.sessionId,
          childCallId: childCall.sessionId
        });

        await swapAttendedTransferCalls(
          parentCall.sessionId,
          childCall.sessionId
        );
      }
    } catch (error) {
      logger.error("Error swapping calls:", error);
    }
  };

  const getStateDisplay = () => {
    if (!parentCall || !childCall || !contact) {
      return {
        title: "Merge Call",
        subtitle: "No call in progress",
        showSwap: false,
        showMerge: false
      };
    }

    // Check if both calls are connected (either CONNECTED or HOLDING state means the call is established)
    const bothConnected =
      (parentCall.state === CallState.CONNECTED ||
        parentCall.state === CallState.HOLDING) &&
      (childCall.state === CallState.CONNECTED ||
        childCall.state === CallState.HOLDING);

    // If child is still dialing
    if (
      childCall.state === CallState.OUTGOING ||
      childCall.state === CallState.CONNECTING
    ) {
      return {
        title: "Dialing...",
        subtitle: `Attempting to reach ${contact.name}`,
        showSwap: false,
        showMerge: false
      };
    }

    // Determine display based on which call is being shown
    const isShowingParent = displayCall?.sessionId === parentCall?.sessionId;
    const callOnHold = displayCall?.isOnHold;

    // Both calls connected (ready to merge)
    return {
      title: callOnHold ? "On Hold" : "Connected",
      subtitle: `${contact.name} - ${
        isShowingParent ? "Original Call" : "New Call"
      }`,
      showSwap: bothConnected,
      showMerge: bothConnected
    };
  };

  const stateDisplay = getStateDisplay();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Contact Info */}
        <View style={styles.contactSection}>
          <WhiteSpace height={padding.xl} />
          <Text
            size={fontSize["2xl"]}
            weight="semiBold"
            align="center"
            color="color-colors-text-text-primary"
          >
            {contact?.name ?? "Unknown"}
          </Text>
          {contact?.secondaryLine ? (
            <>
              <WhiteSpace height={padding.xs} />
              <Text
                size={fontSize.md}
                align="center"
                color="color-colors-text-text-secondary"
              >
                {contact.secondaryLine}
              </Text>
            </>
          ) : null}

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
        {/* Swap Button - Only show when both calls are connected */}
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
          onPress={onCancel}
          type={"outline"}
          style={styles.buttonWrapper}
        >
          Cancel
        </Button>

        {/* Merge Button - Only enabled when both calls are connected */}
        <Button
          onPress={onMerge}
          type="primary"
          style={styles.buttonWrapper}
          disabled={!stateDisplay.showMerge}
        >
          Merge
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
  buttonWrapper: {
    flex: 1
  }
});
