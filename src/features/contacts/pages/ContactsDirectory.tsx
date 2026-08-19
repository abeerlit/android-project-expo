// React Imports
import { useSelector } from "react-redux";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { useQuery } from "@tanstack/react-query";
import { getCompanyContacts } from "shared/api/directory/methods.ts";

// Type Imports
import React, { useCallback, useMemo, useEffect, useState } from "react";
import { Contact } from "features/contacts/types/types.ts";

// Component Imports
import { Screen } from "shared/components/utils/Screen.tsx";
import { EmptyState } from "shared/components/EmptyState.tsx";
import { FlatList } from "shared/components/utils/Flatlist.tsx";
import { DirectoryRowMemoized as DirectoryRow } from "features/contacts/components/DirectoryRow.tsx";
import { ContactDrawer } from "features/contacts/components/ContactDrawer.tsx";
import { ContactsSkeletonLoader } from "features/contacts/components/ContactsSkeletonLoader.tsx";
import SearchBar from "shared/components/utils/SearchBar.tsx";
import { preloadImageUris } from "shared/components/CachedImage.tsx";

export function ContactsDirectory() {
  const { openDrawer } = useDrawer();
  const { accessToken } = useSelector(({ authReducer }: any) => authReducer);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data: companyContacts = [],
    isLoading,
    refetch: refetchCompany
  } = useQuery({
    queryKey: ["companyContacts", accessToken],
    queryFn: async () => {
      if (!accessToken) return [];
      return await getCompanyContacts(accessToken);
    },
    enabled: !!accessToken,
    staleTime: 30000,
    gcTime: 300000,
    retry: 2
  });

  useEffect(() => {
    if (companyContacts.length === 0) return;
    const uris = companyContacts
      .map((c) => c.avatarPath || c.avatarThumbnailPath)
      .filter((u): u is string => !!u);
    preloadImageUris(uris);
  }, [companyContacts]);

  const handleRefresh = useCallback(() => {
    refetchCompany();
  }, [refetchCompany]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredCompanyContacts = useMemo(() => {
    if (!normalizedSearch) return companyContacts;

    return companyContacts.filter((contact) => {
      const name = contact.name?.toLowerCase() || "";
      const number = contact.number?.toLowerCase() || "";
      const email = contact.email?.toLowerCase() || "";
      const company = contact.company?.toLowerCase() || "";

      return (
        name.includes(normalizedSearch) ||
        number.includes(normalizedSearch) ||
        email.includes(normalizedSearch) ||
        company.includes(normalizedSearch)
      );
    });
  }, [companyContacts, normalizedSearch]);

  const handleSearchCancel = useCallback(() => {
    setSearchQuery("");
  }, []);

  const handleDirectoryPress = useCallback(
    (contact: Contact) => {
      openDrawer(<ContactDrawer item={contact} />);
    },
    [openDrawer]
  );

  const keyExtractor = useCallback((item: Contact, index: number) => {
    return `${item.extId}-${item.number || index}`;
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Contact }) => (
      <DirectoryRow item={item} handlePress={handleDirectoryPress} />
    ),
    [handleDirectoryPress]
  );

  const emptyComponent = useMemo(
    () => (
      <EmptyState
        icon="building-07"
        title={
          normalizedSearch ? "No matching contacts found" : "No contacts found"
        }
        subtext={
          normalizedSearch
            ? "Try a different name, number, or email"
            : "Add more people to your organization"
        }
      />
    ),
    [normalizedSearch]
  );

  return (
    <Screen style={{ flex: 1 }} scroll={false} safeArea>
      <SearchBar
        placeholder="Search directory"
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
        data={filteredCompanyContacts}
        onRefresh={handleRefresh}
        loading={isLoading}
        skeletonRowsAmount={10}
        skeletonRow={<ContactsSkeletonLoader />}
        ListEmptyComponent={emptyComponent}
        renderItem={renderItem}
        onEndReachedThreshold={0.5}
        removeClippedSubviews={false}
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={10}
        updateCellsBatchingPeriod={50}
      />
    </Screen>
  );
}
