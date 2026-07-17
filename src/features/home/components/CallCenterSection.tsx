import React from "react";
import { View, TouchableOpacity } from "react-native";
import Accordion from "shared/components/Accordian.tsx";
import Icon from "shared/components/Icon.tsx";
import { Text } from "shared/components/Text.tsx";
import { AgentStatus } from "./AgentStatus.tsx";

interface AgentQueue {
  queueId: number;
  queueName: string;
  dnd: number;
}

interface AgentQueues {
  paused: boolean | number;
  queues: AgentQueue[];
}

interface CallCenterSectionProps {
  data: AgentQueues | undefined;
  handleDNDToggle: (
    queueId: number,
    currentlyLoggedIn: boolean,
    queueName: string
  ) => Promise<void>;
  handleRefetch: () => Promise<void>;
  theme: any;
}

const CallCenterSection: React.FC<CallCenterSectionProps> = ({
  data,
  handleDNDToggle,
  handleRefetch
}) => (
  <Accordion
    title="Call Centers"
    initiallyExpanded={true}
    rightComponent={
      <AgentStatus
        status={
          typeof data?.paused === "boolean" ? (data.paused ? 1 : 0) : undefined
        }
        queues={data?.queues ?? []}
        refetch={handleRefetch}
      />
    }
  >
    <View>
      {data?.queues?.length ? (
        data.queues.map((queue: AgentQueue) => (
          <View
            key={queue.queueId}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 10,
              paddingHorizontal: 12,
              gap: 12
            }}
          >
            <TouchableOpacity
              onPress={() =>
                handleDNDToggle(queue.queueId, queue.dnd === 0, queue.queueName)
              }
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: queue.dnd === 0 ? "#16A34A" : "#DC2626"
              }}
            >
              <View style={{ position: "relative" }}>
                <Icon name="bell-04" size={18} stroke="#FFFFFF" />
                {queue.dnd === 1 && (
                  <View
                    style={{
                      position: "absolute",
                      top: 8,
                      left: -2,
                      width: 22,
                      height: 2,
                      backgroundColor: "#FFFFFF",
                      transform: [{ rotate: "-45deg" }]
                    }}
                  />
                )}
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: "flex-start" }}>
              <Text color="colors-text-text-secondary" weight="medium">
                {queue.queueName}
              </Text>
            </View>
          </View>
        ))
      ) : (
        <Text size={14} align="center">
          No call centers available.
        </Text>
      )}
    </View>
  </Accordion>
);

export default CallCenterSection;
