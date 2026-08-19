// React Imports
import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useTheme } from "hooks/use-theme.ts";
import { fontSize } from "core/theme/theme.ts";

// Type Imports
import { State } from "store/types.ts";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { agentStatusDrawerStyles } from "../styles/component-styles.ts";

// API Import
import { getTenantSettings } from "shared/api/tenant/methods.ts";
import { queueAgentDND, queueAgentLogin } from "shared/api/queues/methods.ts";
import { Logger } from "shared/utils/Logger.ts";
import { toast } from "@backpackapp-io/react-native-toast";

interface DrawerProps {
  handleStatusChange?: (
    peerName: string,
    paused: 1 | 0,
    pauseReason: string
  ) => Promise<void>;
  queues?: { queueId: number; dnd: number }[]; // agent's queues + DND state
  refetch?: () => Promise<void>;
}

const logger = new Logger("AgentStatusDrawer");

export const AgentStatusDrawer: React.FC<DrawerProps> = ({
  handleStatusChange = () => Promise.resolve(),
  queues = [],
  refetch = () => Promise.resolve()
}) => {
  // Hooks
  const theme = useTheme();
  const { user } = useSelector(({ userReducer }: State) => userReducer);
  const { accessToken } = useSelector(({ authReducer }: State) => authReducer);
  const { closeDrawer } = useDrawer();

  // State
  const [pauseReasons, setPauseReasons] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueLoginBusy, setQueueLoginBusy] = useState(false);

  // "Logged out of all queues" is modelled as DND on every queue, because the
  // per-queue DND state persists and round-trips via agent-status (the queue
  // login flag does not). All queues muted => treated as logged out.
  const hasQueues = queues.length > 0;
  const allQueuesDnd = hasQueues && queues.every((q) => q.dnd === 1);

  // Fetch tenant settings on mount
  useEffect(() => {
    const fetchTenantSettings = async (): Promise<void> => {
      // Default reasons that appear for everyone
      const defaultReasons = [
        "Account Review",
        "Break",
        "Lunch",
        "Meeting",
        "Personal"
      ];

      try {
        if (user?.tenantId && accessToken) {
          const response = await getTenantSettings(accessToken, user.tenantId);
          // Combine default reasons with tenant-specific reasons
          const tenantReasons = response.queuePauseReasons || [];
          setPauseReasons([...defaultReasons, ...tenantReasons]);
        } else {
          setPauseReasons(defaultReasons);
        }
      } catch (error) {
        logger.error("Failed to fetch tenant settings:", error);
        // Fallback to default reasons if API fails
        setPauseReasons(defaultReasons);
      } finally {
        setLoading(false);
      }
    };

    fetchTenantSettings();
  }, [user?.tenantId, accessToken]);

  const handleStatusSelection = async (
    paused: 1 | 0,
    reason: string
  ): Promise<void> => {
    if (!user?.peerName) {
      logger.error("Cannot change status: No peer name available");
      return;
    }
    try {
      await handleStatusChange(user.peerName, paused, reason);
    } catch (error) {
      logger.error("Failed to change agent status:", error);
    } finally {
      closeDrawer();
    }
  };

  // Log the agent in/out of ALL their queues at once by toggling DND on every
  // queue. Currently muted => turn DND off (log in); otherwise => turn DND on.
  const handleQueueLoginToggle = async (): Promise<void> => {
    if (!user?.peerName) {
      logger.error("Cannot toggle queues: No peer name available");
      return;
    }
    if (queueLoginBusy || !hasQueues) {
      return;
    }
    const peerName = user.peerName;
    const nextDnd = !allQueuesDnd; // true = mute all, false = unmute all
    try {
      setQueueLoginBusy(true);
      if (accessToken) {
        try {
          await queueAgentLogin(accessToken, peerName, 1);
        } catch (loginError) {
          logger.error("ensure-login before DND failed:", loginError);
        }
      }
      const results = await Promise.allSettled(
        queues.map((q) => queueAgentDND(peerName, q.queueId, nextDnd))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        toast.error(
          `Couldn't update ${failed} of ${queues.length} queues`
        );
      } else {
        toast.success(
          nextDnd
            ? "Logged out of all queues."
            : "Logged in to all queues."
        );
      }
    } catch (error) {
      logger.error("Failed to toggle all queues:", error);
      toast.error("Couldn't update queue settings");
    } finally {
      // Always refetch so the UI reflects the true per-queue state, even on
      // partial failure.
      await refetch();
      setQueueLoginBusy(false);
      closeDrawer();
    }
  };

  return (
    <View style={agentStatusDrawerStyles.container}>
      <WhiteSpace height={3} />
      <Text
        size={fontSize.lg}
        style={[
          agentStatusDrawerStyles.headerText,
          {
            color: theme.colors["color-colors-text-text-primary"],
            borderColor: theme.colors["color-colors-border-border-secondary"]
          }
        ]}
        align="center"
      >
        Call Center Status
      </Text>

      <WhiteSpace
        style={[
          agentStatusDrawerStyles.divider,
          { borderColor: theme.colors["color-colors-border-border-secondary"] }
        ]}
      />

      <Text
        size={fontSize.sm}
        color="color-component-colors-components-buttons-tertiary-color-button-tertiary-color-fg"
        weight="semiBold"
        style={agentStatusDrawerStyles.statusLabel}
        align="left"
      >
        Available Status
      </Text>

      <WhiteSpace
        style={[
          agentStatusDrawerStyles.divider,
          { borderColor: theme.colors["color-colors-border-border-secondary"] }
        ]}
      />

      <TouchableOpacity onPress={() => handleStatusSelection(0, "Available")}>
        <Text
          size={fontSize.sm}
          weight="medium"
          style={agentStatusDrawerStyles.optionText}
        >
          Available
        </Text>
      </TouchableOpacity>

      <WhiteSpace
        style={[
          agentStatusDrawerStyles.divider,
          { borderColor: theme.colors["color-colors-border-border-secondary"] }
        ]}
      />

      <Text
        size={fontSize.sm}
        color="secondary"
        weight="semiBold"
        style={agentStatusDrawerStyles.statusLabel}
        align="left"
      >
        Off Duty
      </Text>

      <WhiteSpace
        style={[
          agentStatusDrawerStyles.divider,
          { borderColor: theme.colors["color-colors-border-border-secondary"] }
        ]}
      />

      {loading ? (
        <ActivityIndicator
          size="small"
          color={theme.colors["color-colors-text-text-primary"]}
        />
      ) : (
        pauseReasons.map((reason, index) => (
          <View key={index} style={agentStatusDrawerStyles.statusOption}>
            <TouchableOpacity onPress={() => handleStatusSelection(1, reason)}>
              <Text
                size={fontSize.sm}
                weight="medium"
                style={agentStatusDrawerStyles.optionText}
              >
                {reason}
              </Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <WhiteSpace
        style={[
          agentStatusDrawerStyles.divider,
          { borderColor: theme.colors["color-colors-border-border-secondary"] }
        ]}
      />

      {hasQueues && (
        <View
          style={{
            width: "100%",
            paddingHorizontal: 16,
            marginTop: 4,
            marginBottom: 8
          }}
        >
          <TouchableOpacity
            disabled={queueLoginBusy}
            onPress={handleQueueLoginToggle}
            activeOpacity={0.8}
            style={{
              alignSelf: "center",
              width: "100%",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: allQueuesDnd ? "#000000" : "#dc2626",
              backgroundColor: "#FFFFFF",
              paddingVertical: 14,
              paddingHorizontal: 20,
              alignItems: "center",
              justifyContent: "center",
              opacity: queueLoginBusy ? 0.5 : 1
            }}
          >
            <Text
              size={fontSize.sm}
              weight="semiBold"
              align="center"
              style={{ color: allQueuesDnd ? "#000000" : "#DC2626" }}
            >
              {allQueuesDnd
                ? "Login to all queues"
                : "Logout of all queues"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};
