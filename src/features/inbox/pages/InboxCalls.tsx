// React Imports
import { useSelector } from "react-redux";
import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCalls } from "shared/api/inbox/methods.ts";
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

export function InboxCalls() {
  // Constants
  const logger = new Logger("Calls: ");
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

  // Methods
  // Handle scroll up refresh
  const onRefresh = React.useCallback(async () => {
    try {
      setRefreshing(true);
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: ["calls"] });
    } catch (e) {
      logger.error("Error refreshing calls: ", e);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  const fetchCalls = async (pageNumber: number): Promise<CallData[]> => {
    logger.debug("Fetching calls for page: ", pageNumber);
    try {
      const res = await getCalls(token, {
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
    queryKey: ["calls", page],
    queryFn: () => fetchCalls(page),
    placeholderData: (previousData) => previousData
  });

  // Refresh calls only when returning from a call (call ended), not on every focus
  useEffect(() => {
    if (prevActiveCallIdRef.current && !activeCallId) {
      setPage(1);
      queryClient.invalidateQueries({ queryKey: ["calls"] });
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
            title="No calls found"
            subtext="You haven't started any calls recently"
          />
        }
        renderItem={({ item }) => <CallRow item={item} />}
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
      />
    </Screen>
  );
}
