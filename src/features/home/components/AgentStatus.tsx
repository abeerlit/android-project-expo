// React Imports
import React, { useCallback } from "react";
import { TouchableOpacity, View } from "react-native";
import { useTheme } from "hooks/use-theme.ts";

// API Imports
import { queueAgentPause } from "shared/api/queues/methods.ts";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { offDutyStyles } from "../styles/component-styles.ts";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { AgentStatusDrawer } from "./AgentStatusDrawer.tsx";
import { Logger } from "shared/utils/Logger.ts";
import { toast } from "@backpackapp-io/react-native-toast";

interface AgentStatusProps {
  status?: number; // 0 for Available, 1 for Off Duty
  queues?: { queueId: number; dnd: number }[]; // agent's queues + DND state
  refetch?: () => Promise<void>;
}

const logger = new Logger("AgentStatus");

export const AgentStatus: React.FC<AgentStatusProps> = ({
  status = 0,
  queues = [],
  refetch = () => Promise.resolve()
}) => {
  // Hooks
  const theme = useTheme();
  const { openDrawer } = useDrawer();

  // Methods
  const handleStatusChange = useCallback(
    async (
      peerName: string,
      paused: 1 | 0,
      pauseReason: string
    ): Promise<void> => {
      try {
        await queueAgentPause(peerName, paused, pauseReason);
        await refetch();
      } catch (error) {
        logger.error("Failed to update agent status:", error);
        toast.error("Error updating agent status");
      }
    },
    [refetch]
  );

  const handleStatusPress = useCallback(() => {
    openDrawer(
      <AgentStatusDrawer handleStatusChange={handleStatusChange} queues={queues} refetch={refetch} />);
  }, [openDrawer, handleStatusChange, queues, refetch]);

  const isAvailable = status === 0;
  const statusColor = isAvailable
      ? theme.colors.success
      : theme.colors.secondary;
  const textColor = isAvailable
    ? "color-component-colors-components-buttons-tertiary-color-button-tertiary-color-fg"
    : "secondary";
  const statusText = isAvailable ? "Available" : "Off Duty";

  return (
    <TouchableOpacity
      accessibilityRole="button"
      style={offDutyStyles.rightHeader}
      onPress={handleStatusPress}
    >
      <View
        style={[
          offDutyStyles.statusIndicator,
          { backgroundColor: statusColor }
        ]}
      />
      <Text color={textColor} size={14} weight="semiBold">
        {statusText}
      </Text>
    </TouchableOpacity>
  );
};
