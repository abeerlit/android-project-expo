// React Imports
import { useSelector } from "react-redux";
import { useEffect, useState } from "react";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { getVoicemailMessages } from "shared/api/voicemails/methods.ts";

// Type Imports
import React from "react";
import { State } from "store/types.ts";
import { VoicemailMessage } from "shared/api/voicemails/types.ts";

// Component Imports
import { Logger } from "shared/utils/Logger.ts";
import { Screen } from "shared/components/utils/Screen.tsx";
import { EmptyState } from "shared/components/EmptyState.tsx";
import { FlatList } from "shared/components/utils/Flatlist.tsx";
import { VoicemailRow } from "features/inbox/components/VoicemailRow.tsx";
import { VoicemailDrawer } from "features/inbox/components/VoicemailDrawer.tsx";
import { InboxSkeletonLoader } from "features/inbox/components/InboxSkeletonLoader.tsx";
import { getVoicemailHighlight } from "features/inbox/utils/InboxHighlightStore.ts";

export function InboxVoicemails() {
  // Constants
  const logger = new Logger("Voicemails: ");
  const { openDrawer, closeDrawer } = useDrawer();

  // App State
  const token = useSelector(
    ({ authReducer }: State) => authReducer.accessToken
  );

  // Local State
  const [allData, setAllData] = useState<VoicemailMessage[]>([]);
  const [isFetching, setIsFetching] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState(false);

  // Methods
  const handleVoicemailPress = (voicemail: VoicemailMessage) => {
    openDrawer(
      <VoicemailDrawer
        voicemail={voicemail}
        handleVoicemailRead={(id: number) => markVoicemailAsRead(id)}
        handleVoicemailDelete={(id: number) => {
          removeVoicemailFromList(id);
          closeDrawer();
        }}
      />
    );
  };

  // Mark the voicemail in the list as 'read'
  const markVoicemailAsRead = (id: number) => {
    const updatedData = allData.map((item) => {
      if (item.id === id) {
        const status: "read" | "unread" = "read";
        return { ...item, status };
      }
      return item;
    });
    setAllData(updatedData);
  };

  // Remove the deleted voicemail from the list
  const removeVoicemailFromList = (id: number) => {
    const updatedData = allData.filter((item) => item.id !== id);
    setAllData(updatedData);
  };

  const fetchVoicemails = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setIsFetching(true);
      const result = await getVoicemailMessages(token);
      setAllData(result);
      setIsFetching(false);
    } catch (e: any) {
      logger.error(e);
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  };

  const onRefresh = () => fetchVoicemails(true);

  useEffect(() => {
    fetchVoicemails(false);
  }, []);

  const highlightVoicemailId = getVoicemailHighlight();

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
            icon="voicemail"
            title="No voicemails found"
            subtext="You haven’t received any voicemails recently"
          />
        }
        renderItem={({ item }) => (
          <VoicemailRow
            item={item}
            handlePress={handleVoicemailPress}
            highlight={highlightVoicemailId != null && item.id === highlightVoicemailId}
          />
        )}
        onEndReachedThreshold={0.5}
        scrollEnabled={true}
        showsVerticalScrollIndicator={true}
        bounces={true}
        alwaysBounceVertical={true}
        automaticallyAdjustContentInsets={false}
        overScrollMode="always"
      />
    </Screen>
  );
}
