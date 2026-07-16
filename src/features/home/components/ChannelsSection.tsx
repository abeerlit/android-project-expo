import React, { useMemo } from "react";
import { View } from "react-native";
import Accordion from "shared/components/Accordian.tsx";
import { Text } from "shared/components/Text.tsx";
import { RowSkeletionLoader } from "./RowSkeletionLoader.tsx";
import { ChannelListRow } from "features/chat/components/ChannelListRow.tsx";
import { FilteredChannel } from "features/chat/types.ts";
import { padding } from "core/theme/theme.ts";

interface ChannelsSectionProps {
  channels: FilteredChannel[];
  isLoading?: boolean;
}

const ChannelsSection: React.FC<ChannelsSectionProps> = ({ channels, isLoading = false }) => {
  // Calculate total unread count for channels
  const totalUnread = useMemo(() => {
    return channels.reduce((sum, channel) => sum + (channel.unreadCount || 0), 0);
  }, [channels]);

  const showSkeleton = isLoading && channels.length === 0;

  return (
    <Accordion
      title="Channels"
      badgeCount={totalUnread}
      initiallyExpanded={true}
    >
      {showSkeleton ? (
        <View>
          {[...Array(4)].map((_, i) => (
            <RowSkeletionLoader key={i} />
          ))}
        </View>
      ) : channels.length === 0 ? (
        <View style={{ paddingVertical: padding.md, paddingHorizontal: padding.sm }}>
          <Text color="secondary" size={14} align="left">
          </Text>
        </View>
      ) : (
        channels.map((channel) => (
            <ChannelListRow key={channel.url} channel={channel} />
          ))
      )}
    </Accordion>
  );
};

export default React.memo(ChannelsSection);