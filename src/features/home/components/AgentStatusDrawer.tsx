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
import { Logger } from "shared/utils/Logger.ts";

interface DrawerProps {
  handleStatusChange?: (
    peerName: string,
    paused: 1 | 0,
    pauseReason: string
  ) => Promise<void>;
}

const logger = new Logger("AgentStatusDrawer");

export const AgentStatusDrawer: React.FC<DrawerProps> = ({
  handleStatusChange = () => Promise.resolve()
}) => {
  // Hooks
  const theme = useTheme();
  const { user } = useSelector(({ userReducer }: State) => userReducer);
  const { accessToken } = useSelector(({ authReducer }: State) => authReducer);
  const { closeDrawer } = useDrawer();

  // State
  const [pauseReasons, setPauseReasons] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

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
    </View>
  );
};
