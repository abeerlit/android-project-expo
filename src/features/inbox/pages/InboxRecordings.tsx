// React Imports
import { useSelector } from "react-redux";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { getRecordings } from "shared/api/inbox/methods.ts";

// Type Imports
import React from "react";
import { State } from "store/types.ts";
import { CallData } from "shared/api/inbox/types.ts";

// Component Imports
import { Logger } from "shared/utils/Logger.ts";
import { Screen } from "shared/components/utils/Screen.tsx";
import { EmptyState } from "shared/components/EmptyState.tsx";
import { FlatList } from "shared/components/utils/Flatlist.tsx";
import { RecordingRow } from "features/inbox/components/RecordingRow.tsx";
import { RecordingDrawer } from "features/inbox/components/RecordingDrawer.tsx";
import { InboxSkeletonLoader } from "features/inbox/components/InboxSkeletonLoader.tsx";

export function InboxRecordings() {
  // Constants
  const logger = new Logger("Calls: ");
  const { openDrawer } = useDrawer();
  const queryClient = useQueryClient();

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
      await queryClient.invalidateQueries({ queryKey: ["recordings"] });
    } catch (e) {
      logger.error("Error refreshing calls: ", e);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  const fetchCalls = async (pageNumber: number): Promise<CallData[]> => {
    const res = await getRecordings(token, {
      recordsPerPage: 15,
      page: pageNumber
    });
    return res.records;
  };

  const { data, isFetching } = useQuery<CallData[]>({
    queryKey: ["recordings", page],
    queryFn: () => fetchCalls(page),
    placeholderData: (previousData) => previousData
  });

  const handleRecordingPress = (recording: CallData) => {
    openDrawer(<RecordingDrawer recording={recording} />);
  };

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
        style={{
          flex: 1,
          width: "100%",
          height: "100%"
        }}
        contentContainerStyle={{
          flexGrow: 1
        }}
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
            icon={"recording-01"}
            title={"No recordings found"}
            subtext={"You don't have any recent call recordings"}
          />
        }
        renderItem={({ item }) => (
          <RecordingRow recording={item} handlePress={handleRecordingPress} />
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
        scrollEnabled={true}
        showsVerticalScrollIndicator={true}
        bounces={true}
        alwaysBounceVertical={true} // iOS specific
        automaticallyAdjustContentInsets={false}
        overScrollMode="always"
      />
    </Screen>
  );
}
