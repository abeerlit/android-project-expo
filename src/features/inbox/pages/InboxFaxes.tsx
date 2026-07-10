// React Imports
import { useSelector } from "react-redux";
import { useEffect, useState } from "react";
import { useDrawer } from "core/drawer/DrawerContext.tsx";

// Type Imports
import React from "react";
import { State } from "store/types.ts";
import { Fax } from "shared/api/faxes/types.ts";

// Component Imports
import { Logger } from "shared/utils/Logger.ts";
import { Screen } from "shared/components/utils/Screen.tsx";
import { EmptyState } from "shared/components/EmptyState.tsx";
import { FlatList } from "shared/components/utils/Flatlist.tsx";
import { FaxRow } from "features/inbox/components/FaxRow.tsx";
import { FaxDrawer } from "features/inbox/components/FaxDrawer.tsx";
import { InboxSkeletonLoader } from "features/inbox/components/InboxSkeletonLoader.tsx";

// API Imports
import { getFaxes } from "shared/api/inbox/methods.ts";

export function InboxFaxes() {
  // Constants
  const logger = new Logger("Inbox Faxes: ");
  const { openDrawer } = useDrawer();

  // App State
  const token = useSelector(
    ({ authReducer }: State) => authReducer.accessToken
  );
  const directory = useSelector(
    ({ directoryReducer }: State) => directoryReducer.directory
  );
  const personalContacts = useSelector(
    ({ directoryReducer }: State) => directoryReducer.personalContacts ?? []
  );

  // Local State
  const [allData, setAllData] = useState<Fax[]>([]);
  const [isFetching, setIsFetching] = useState<boolean>(true);

  // Methods
  const handleFaxPress = (fax: Fax) => {
    openDrawer(<FaxDrawer fax={fax} />);
  };

  const fetchFaxes = async () => {
    try {
      const result = await getFaxes(token);
      setAllData(result);
    } catch (e) {
      logger.error("Error fetching faxes: ", e);
    } finally {
      setIsFetching(false);
    }
  };

  // Lifecycle
  useEffect(() => {
    void fetchFaxes();
  }, [token]);

  if (!allData?.length || isFetching) {
    return (
      <EmptyState
        icon="file-04"
        title="No faxes found"
        subtext="You haven't sent / received any faxes"
      />
    );
  }

  return (
    <Screen style={{ flex: 1 }} scroll={false} safeArea>
      <FlatList
        style={{ flex: 1, width: "100%", height: "100%" }}
        contentContainerStyle={{ flexGrow: 1 }}
        scrollEventThrottle={16}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        data={allData}
        onRefresh={fetchFaxes}
        loading={isFetching}
        skeletonRowsAmount={10}
        skeletonRow={<InboxSkeletonLoader />}
        ListEmptyComponent={
          <EmptyState
            icon="file-04"
            title="No faxes found"
            subtext="You haven't sent / received any faxes"
          />
        }
        renderItem={({ item }) => (
          <FaxRow
            fax={item}
            directory={directory}
            personalContacts={personalContacts}
            onPress={handleFaxPress}
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
