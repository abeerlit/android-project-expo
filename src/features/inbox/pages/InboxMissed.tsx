// React Imports
import { useSelector } from "react-redux";
import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMissedCalls } from "shared/api/inbox/methods.ts";
import { useSoftphone } from "core/softphone/useSoftphone.ts";

// Type Imports
import React from "react";
import { State } from "store/types.ts";
import { CallData } from "shared/api/inbox/types.ts";

// Component Imports
import { Logger } from "shared/utils/Logger.ts";
import { Screen } from "shared/components/utils/Screen.tsx";
import { EmptyState } from "shared/components/EmptyState.tsx";
import { FlatList } from "shared/components/utils/Flatlist.tsx";
import { CallRow } from "features/inbox/components/CallRow.tsx";
import { InboxSkeletonLoader } from "features/inbox/components/InboxSkeletonLoader.tsx";
import { getMissedCallHighlight } from "features/inbox/utils/InboxHighlightStore.ts";

export function InboxMissed() {
  // Constants
  const logger = new Logger("Missed Calls: ");
  const queryClient = useQueryClient();
  const { activeCallId } = useSoftphone();
  const prevActiveCallIdRef = useRef<string | undefined>(undefined);

  // App State
  const token = useSelector(
    ({ authReducer }: State) => authReducer.accessToken
  );

  // Local State
  const [page, setPage] = useState(1);
  const [allData, setAllData] = useState<CallData[]>([]);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = React.useCallback(async () => {
    try {
      setRefreshing(true);
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: ["missed-calls"] });
    } catch (e) {
      logger.error("Error refreshing calls: ", e);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  // Methods
  const fetchMissedCalls = async (pageNumber: number): Promise<CallData[]> => {
    try {
      const res = await getMissedCalls(token, {
        recordsPerPage: 15,
        page: pageNumber
      });
      return res.records;
    } catch (e) {
      logger.error("Error fetching calls: ", e);
      return [];
    }
  };

  const { data, isFetching } = useQuery<CallData[]>({
    queryKey: ["missed-calls", page],
    queryFn: () => fetchMissedCalls(page),
    placeholderData: (previousData) => previousData
  });

  useEffect(() => {
    if (prevActiveCallIdRef.current && !activeCallId) {
      setPage(1);
      queryClient.invalidateQueries({ queryKey: ["missed-calls"] });
    }
    prevActiveCallIdRef.current = activeCallId;
  }, [activeCallId, queryClient]);

  useEffect(() => {
    if (isFetching) setIsFetchingMore(true);
  }, [isFetching]);

  useEffect(() => {
    if (data) {
      if (page === 1) {
        setAllData(data || []);
      } else {
        setAllData((prevData) => {
          const existingIds = new Set(prevData.map((item) => item.id));
          const newItems = (data || []).filter(
            (item) => !existingIds.has(item.id)
          );
          return [...prevData, ...newItems];
        });
      }
      setIsFetchingMore(false);
    }
  }, [data, page]);

  const highlightIds = getMissedCallHighlight();

  const isItemHighlighted = (item: CallData): boolean => {
    if (!highlightIds) return false;
    if (highlightIds.callId && item.callId === highlightIds.callId) return true;
    if (highlightIds.uniqueId && item.uniqueId === highlightIds.uniqueId) return true;
    if (highlightIds.callUUID && (item.callId === highlightIds.callUUID || item.uniqueId === highlightIds.callUUID)) return true;
    return false;
  };

  return (
    <Screen style={{ flex: 1 }} scroll={false} safeArea>
      <FlatList
        style={{ flex: 1, width: "100%", height: "100%" }}
        contentContainerStyle={{ flexGrow: 1 }}
        scrollEventThrottle={16}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        data={allData}
        onRefresh={onRefresh}
        refreshing={refreshing}
        loading={isFetching}
        skeletonRowsAmount={10}
        skeletonRow={<InboxSkeletonLoader />}
        ListEmptyComponent={
          <EmptyState
            icon="phone"
            title="No missed calls found"
            subtext="You haven't missed any calls recently"
          />
        }
        renderItem={({ item }) => (
          <CallRow item={item} highlight={isItemHighlighted(item)} />
        )}
        onEndReached={() => {
          if (
            !isFetchingMore &&
            data &&
            data.length >= 15 &&
            data.length > 0
          ) {
            setPage((p) => p + 1);
          }
        }}
        onEndReachedThreshold={0.5}
        scrollEnabled
        showsVerticalScrollIndicator
        bounces
        alwaysBounceVertical
        automaticallyAdjustContentInsets={false}
        overScrollMode="always"
      />
    </Screen>
  );
}
