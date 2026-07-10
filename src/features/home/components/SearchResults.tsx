import React, { useCallback, useMemo, useRef } from "react";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { View } from "react-native";
import { GroupChannel } from "@sendbird/chat/groupChannel";
import { useNavigation } from "@react-navigation/native";
import { useDispatch, useSelector } from "react-redux";
import { ChannelListRow } from "features/chat/components/ChannelListRow.tsx";
import { DmListRow } from "features/chat/components/DmListRow.tsx";
import { TextConversationRow } from "features/text/components/TextConversationRow.tsx";
import SearchResultMessage from "./SearchResultMessage";
import {
  SwipeableDirectMessageRow,
  SwipeableListCoordinator
} from "./SwipeableDirectMessageRow.tsx";
import { homeStyles } from "../styles/home-styles.ts";
import { TextConversation } from "shared/api/messaging/types.ts";
import * as textActions from "store/text/actions.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { State } from "store/types.ts";
import { Routes } from "core/navigation/types/types.ts";

interface SearchResultsProps {
  results: (GroupChannel | TextConversation)[];
  isChannelDM: (channel: GroupChannel) => boolean;
  searchVal: string;
  formatDMChannel: (channel: GroupChannel) => any;
  formatGroupChannel: (channel: GroupChannel) => any;
}

const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  isChannelDM,
  searchVal,
  formatDMChannel,
  formatGroupChannel
}) => {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const { hideDmChannel, currentChannel, leaveChannel } = useSendbirdContext();
  const { currentConversation } = useSelector((state: State) => state.textReducer);

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

  if (!searchVal.length) {
    return (
      <SearchResultMessage>
        Start typing to search for channels
      </SearchResultMessage>
    );
  }
  if (results.length === 0) {
    return (
      <SearchResultMessage>
        No channels or conversations found
      </SearchResultMessage>
    );
  }

  return (
    <View style={homeStyles.searchResultsContainer}>
      {results.map((item) => {
        if ("participants" in item) {
          const smsConv = item as TextConversation;
          return (
            <SwipeableDirectMessageRow
              key={smsConv.id}
              coordinator={swipeCoordinator}
              onHide={() => handleHideSms(smsConv.id)}
            >
              <TextConversationRow
                conversation={smsConv}
                useParticipantsOnly
                onPress={() => {
                  dispatch(textActions.setCurrentConversation(smsConv));
                  dispatch(textActions.fetchConversationMessages(smsConv.id));
                  // @ts-expect-error Navigation type
                  navigation.navigate(Routes.TextThread, {
                    conversationId: smsConv.id
                  });
                }}
              />
            </SwipeableDirectMessageRow>
          );
        }

        const channel = item as GroupChannel;
        if (isChannelDM(channel)) {
          const dm = formatDMChannel(channel);
          return (
            <SwipeableDirectMessageRow
              key={channel.url}
              swipeDisabled={dm.personal === true}
              coordinator={swipeCoordinator}
              onHide={() => handleHideSendbirdDm(channel.url)}
            >
              <DmListRow channel={dm} />
            </SwipeableDirectMessageRow>
          );
        }
        return (
          <ChannelListRow
            key={channel.url}
            channel={formatGroupChannel(channel)}
          />
        );
      })}
    </View>
  );
};

export default SearchResults;
