// React Imports
import { useSelector } from "react-redux";
import { useQuery } from "@tanstack/react-query";
import { getCallGroups } from "shared/api/call-groups/methods.ts";
import { getCallQueues } from "shared/api/queues/methods.ts";
import { CallGroup } from "shared/api/call-groups/types.ts";
import { CallQueue } from "shared/api/queues/types.ts";
// Type Imports
import React, { useCallback, useMemo, useState } from "react";
// Component Imports
import { Screen } from "shared/components/utils/Screen.tsx";
import { EmptyState } from "shared/components/EmptyState.tsx";
import { FlatList } from "shared/components/utils/Flatlist.tsx";
import { GroupRow } from "features/contacts/components/GroupRow.tsx";
import { ContactsSkeletonLoader } from "features/contacts/components/ContactsSkeletonLoader.tsx";
import SearchBar from "shared/components/utils/SearchBar.tsx";

export function ContactsGroups() {
  const { accessToken } = useSelector(({ authReducer }: any) => authReducer);
  const { user } = useSelector(({ userReducer }: any) => userReducer);
  const [searchQuery, setSearchQuery] = useState("");
  const {
    data: callGroups = [],
    isLoading: isLoadingGroups,
    refetch: refetchGroups
  } = useQuery({
    queryKey: ["callGroups", accessToken, user?.tenantId],
    queryFn: async () => {
      if (!accessToken || !user?.tenantId) return [];
      return await getCallGroups(accessToken, user.tenantId);
    },
    enabled: !!accessToken && !!user?.tenantId,
    staleTime: 30000,
    gcTime: 300000,
    retry: 2
  });
  const {
    data: callQueues = [],
    isLoading: isLoadingQueues,
    refetch: refetchQueues
  } = useQuery<CallQueue[]>({
    queryKey: ["callQueues", accessToken, user?.tenantId],
    queryFn: async () => {
      if (!accessToken || !user?.tenantId) return [];
      return await getCallQueues(accessToken, user.tenantId);
    },
    enabled: !!accessToken && !!user?.tenantId,
    staleTime: 30000,
    gcTime: 300000,
    retry: 2
  });

  const groups = useMemo(() => {
    const safeCallGroups = Array.isArray(callGroups) ? callGroups : [];
    const safeCallQueues = Array.isArray(callQueues) ? callQueues : [];
    const allGroups = [...safeCallGroups, ...(safeCallQueues as CallGroup[])]
      .filter((callGroup) => callGroup?.number)
      .sort((a, b) => (a?.name || "").localeCompare(b?.name || ""));
    return allGroups;
  }, [callGroups, callQueues]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!normalizedSearch) return groups;

    return groups.filter((group) => {
      const name = group.name?.toLowerCase() || "";
      const number = group.number?.toLowerCase() || "";
      return name.includes(normalizedSearch) || number.includes(normalizedSearch);
    });
  }, [groups, normalizedSearch]);

  const isLoading = isLoadingGroups || isLoadingQueues;

  const handleRefresh = useCallback(() => {
    refetchGroups();
    refetchQueues();
  }, [refetchGroups, refetchQueues]);

  const handleSearchCancel = useCallback(() => {
    setSearchQuery("");
  }, []);

  const keyExtractor = useCallback((item: CallGroup) => {
    return `${item.id}`;
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: CallGroup }) => <GroupRow item={item} />,
    []
  );

  const emptyComponent = useMemo(
    () => (
      <EmptyState
        icon="building-04"
        title={
          normalizedSearch ? "No matching groups found" : "No call groups found"
        }
        subtext={
          normalizedSearch
            ? "Try a different group name or number"
            : "There are no call groups in your account"
        }
      />
    ),
    [normalizedSearch]
  );

  return (
    <Screen style={{ flex: 1 }} scroll={false} safeArea>
      <SearchBar
        placeholder="Search groups"
        value={searchQuery}
        onChangeText={setSearchQuery}
        onCancel={handleSearchCancel}
        containerStyle={{ marginBottom: 12 }}
      />
      <FlatList
        style={{ flex: 1, width: "100%", height: "100%" }}
        contentContainerStyle={{ flexGrow: 1 }}
        scrollEventThrottle={16}
        keyExtractor={keyExtractor}
        data={filteredGroups}
        onRefresh={handleRefresh}
        loading={isLoading}
        skeletonRowsAmount={10}
        skeletonRow={<ContactsSkeletonLoader />}
        ListEmptyComponent={emptyComponent}
        renderItem={renderItem}
        onEndReachedThreshold={0.5}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={10}
        updateCellsBatchingPeriod={50}
      />
    </Screen>
  );
}
