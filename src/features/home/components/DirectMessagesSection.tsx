import React, { useMemo, useCallback, useRef } from "react";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { View } from "react-native";
import { useSelector, useDispatch } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import Accordion from "shared/components/Accordian.tsx";
import { RowSkeletionLoader } from "./RowSkeletionLoader.tsx";
import {
  SwipeableDirectMessageRow,
  SwipeableListCoordinator
} from "./SwipeableDirectMessageRow.tsx";
import { DmListRow } from "features/chat/components/DmListRow.tsx";
import { TextConversationRow } from "features/text/components/TextConversationRow.tsx";
import { FilteredDMChannel } from "features/chat/types.ts";
import { State } from "store/types.ts";
import {
  CombinedConversation,
  isChatChannel,
  sortConversations
} from "features/messaging/types.ts";
import { TextConversation } from "shared/api/messaging/types.ts";
import * as textActions from "store/text/actions.ts";
import { Routes } from "core/navigation/types/types.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";

interface DirectMessagesSectionProps {
  channels: FilteredDMChannel[];
  enrichedSmsConversations?: TextConversation[];
  isLoading?: boolean;
}

const DirectMessagesSection: React.FC<DirectMessagesSectionProps> = ({
  channels,
  enrichedSmsConversations,
  isLoading = false
}) => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const { hideDmChannel, currentChannel, leaveChannel } = useSendbirdContext();

  const activeSwipeRef = useRef<SwipeableMethods | null>(null);
  const swipeCoordinator = useMemo<SwipeableListCoordinator>(
    () => ({
      onRightWillOpen: (instance) => {
        if (
          activeSwipeRef.current &&
          activeSwipeRef.current !== instance
        ) {
          activeSwipeRef.current.close();
        }
        activeSwipeRef.current = instance;
      },
      onClose: (instance) => {
        if (activeSwipeRef.current === instance) {
          activeSwipeRef.current = null;
        }
      }
    }),
    []
  );

  const { conversations: smsConversationsFromRedux, currentConversation } =
    useSelector((state: State) => state.textReducer);

  const smsConversations =
    enrichedSmsConversations || smsConversationsFromRedux;
  const unifiedConversations = useMemo(() => {
    const combined: CombinedConversation[] = [
      ...channels.map((dm): any => ({
        ...dm,
        lastMessageAt: dm.lastMessageAt || 0
      })),
      ...smsConversations
    ];
    return sortConversations(combined);
  }, [channels, smsConversations]);

  const totalUnread = useMemo(() => {
    const smsUnread = smsConversations.reduce(
      (sum, conv) => sum + (conv.unreadCount || 0),
      0
    );
    const chatUnread = channels.reduce(
      (sum, dm) => sum + (dm.unreadCount || 0),
      0
    );
    return smsUnread + chatUnread;
  }, [smsConversations, channels]);

  const handleSmsPress = useCallback(
    (conversation: TextConversation) => {
      dispatch(textActions.setCurrentConversation(conversation));
      // @ts-expect-error Navigation type not fully defined
      navigation.navigate(Routes.TextThread, {
        conversationId: conversation.id
      });
    },
    [dispatch, navigation]
  );

  const handleHideSendbirdDm = useCallback(
    async (channelUrl: string) => {
      if (currentChannel?.url === channelUrl) {
        leaveChannel();
        navigation.navigate(Routes.Home as never);
      }
      await hideDmChannel(channelUrl);
    },
    [currentChannel?.url, hideDmChannel, leaveChannel, navigation]
  );

  const handleHideSms = useCallback(
    (conversationId: number) => {
      if (currentConversation?.id === conversationId) {
        dispatch(textActions.setCurrentConversation(null));
        navigation.navigate(Routes.Home as never);
      }
      dispatch(textActions.hideConversation(conversationId));
    },
    [currentConversation?.id, dispatch, navigation]
  );

  const renderConversation = useCallback(
    (item: CombinedConversation) => {
      if (isChatChannel(item)) {
        const originalChannel = channels.find((ch) => ch.url === item.url);
        const isPersonal = originalChannel?.personal === true;
        const row = (
          <DmListRow
            channel={{
              url: item.url,
              name: item.name,
              avatar: originalChannel?.avatar || "",
              unreadCount: originalChannel?.unreadCount || 0,
              connectionStatus: originalChannel?.connectionStatus || "offline",
              memberUserIds: originalChannel?.memberUserIds || [],
              personal: originalChannel?.personal
            }}
          />
        );
        return (
          <SwipeableDirectMessageRow
            key={item.url}
            swipeDisabled={isPersonal}
            coordinator={swipeCoordinator}
            onHide={() => handleHideSendbirdDm(item.url)}
          >
            {row}
          </SwipeableDirectMessageRow>
        );
      }
      const sms = item as TextConversation;
      return (
        <SwipeableDirectMessageRow
          key={`sms-${sms.id}`}
          coordinator={swipeCoordinator}
          onHide={() => handleHideSms(sms.id)}
        >
          <TextConversationRow
            conversation={sms}
            onPress={() => handleSmsPress(sms)}
            useParticipantsOnly
          />
        </SwipeableDirectMessageRow>
      );
    },
    [
      channels,
      handleHideSendbirdDm,
      handleHideSms,
      handleSmsPress,
      swipeCoordinator
    ]
  );

  const showSkeleton = isLoading && unifiedConversations.length === 0;

  return (
    <Accordion
      title="Direct Messages"
      badgeCount={totalUnread}
      initiallyExpanded={true}
    >
      {showSkeleton ? (
        <View>
          {[...Array(4)].map((_, i) => (
            <RowSkeletionLoader key={i} />
          ))}
        </View>
      ) : (
        unifiedConversations.map((conversation) =>
          renderConversation(conversation)
        )
      )}
    </Accordion>
  );
};

export default React.memo(DirectMessagesSection);
