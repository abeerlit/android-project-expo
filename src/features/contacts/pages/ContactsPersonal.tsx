// React Imports
import { useDispatch, useSelector } from "react-redux";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { useQuery } from "@tanstack/react-query";
import * as directoryActions from "store/directory/actions.ts";
import { selectPhoneContactsData } from "store/directory/selectors.ts";
import { convertPhoneContactToDisplay } from "shared/utils/phone-contacts.ts";
import { getPersonalContacts } from "shared/api/directory/methods.ts";
import { Platform } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { ensureContactsPermissionForAndroid } from "core/permissions/ensure-contacts-permission.ts";

// Type Imports
import React, { useMemo, useEffect, useCallback, useState } from "react";
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

export function ContactsPersonal() {
  // Constants
  const { openDrawer } = useDrawer();
  const dispatch = useDispatch();
  const { accessToken } = useSelector(({ authReducer }: any) => authReducer);
  const { phoneContacts } = useSelector(selectPhoneContactsData);
  const [searchQuery, setSearchQuery] = useState("");
  const isFocused = useIsFocused();

  const {
    data: personalContacts = [],
    isLoading: isLoadingPersonal,
    refetch: refetchPersonal
  } = useQuery({
    queryKey: ["personalContacts", accessToken],
    queryFn: async () => {
      if (!accessToken) return [];
      return await getPersonalContacts(accessToken);
    },
    enabled: !!accessToken,
    staleTime: 30000,
    gcTime: 300000,
    retry: 2
  });

  const syncPhoneContacts = useCallback(async () => {
    if (!isFocused) {
      return;
    }
    if (Platform.OS === "android") {
      const granted = await ensureContactsPermissionForAndroid();
      if (!granted) {
        return;
      }
    }
    dispatch({ type: directoryActions.FETCH_PHONE_CONTACTS });
  }, [dispatch, isFocused]);

  useEffect(() => {
    void syncPhoneContacts();
  }, [syncPhoneContacts]);

  const allContacts = useMemo(() => {
    const phoneContactsConverted = phoneContacts.map(
      convertPhoneContactToDisplay
    );

    // Merge and deduplicate by phone number
    const merged = [...personalContacts, ...phoneContactsConverted];
    const seenNumbers = new Set<string>();
    const deduplicated = merged.filter((contact) => {
      const number = contact.number;
      if (!number) return true; // Keep contacts without numbers
      if (seenNumbers.has(number)) return false; // Skip duplicates
      seenNumbers.add(number);
      return true;
    });

    return deduplicated.sort((a, b) => a.name.localeCompare(b.name));
  }, [personalContacts, phoneContacts]);

  useEffect(() => {
    if (allContacts.length === 0) return;
    const uris = allContacts
      .map((c) => c.avatarPath || c.avatarThumbnailPath)
      .filter((u): u is string => !!u);
    preloadImageUris(uris);
  }, [allContacts]);

  const handleRefresh = useCallback(() => {
    refetchPersonal();
    void syncPhoneContacts();
  }, [refetchPersonal, syncPhoneContacts]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredContacts = useMemo(() => {
    if (!normalizedSearch) return allContacts;

    return allContacts.filter((contact) => {
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
  }, [allContacts, normalizedSearch]);

  const handleSearchCancel = useCallback(() => {
    setSearchQuery("");
  }, []);

  const handleDirectoryPress = useCallback(
    (contact: Contact) => {
      openDrawer(<ContactDrawer item={contact} />);
    },
    [openDrawer]
  );

  const keyExtractor = useCallback((item: Contact) => {
    // Use contact type and unique identifier for stable keys
    if ("id" in item && item.id) {
      return `personal-${item.id}`;
    }
    if ("extId" in item) {
      // For phone contacts, use phone number to ensure uniqueness
      // extId alone is NOT unique (many contacts share the same extId)
      return `phone-${item.number || item.extId || item.name}`;
    }
    // Fallback to phone number for contacts without IDs
    return `contact-${item.number || item.name}`;
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Contact }) => (
      <DirectoryRow
        item={item}
        handlePress={handleDirectoryPress}
        personal={true}
      />
    ),
    [handleDirectoryPress]
  );

  const emptyComponent = useMemo(
    () => (
      <EmptyState
        icon="users-01"
        title={
          normalizedSearch
            ? "No matching personal contacts found"
            : "No personal contacts found"
        }
        subtext={
          normalizedSearch
            ? "Try a different name, number, or email"
            : "Add new contacts or sync your phone contacts"
        }
      />
    ),
    [normalizedSearch]
  );

  return (
    <Screen style={{ flex: 1 }} scroll={false} safeArea>
      <SearchBar
        placeholder="Search personal contacts"
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
        data={filteredContacts}
        onRefresh={handleRefresh}
        loading={isLoadingPersonal}
        skeletonRowsAmount={10}
        skeletonRow={<ContactsSkeletonLoader />}
        ListEmptyComponent={emptyComponent}
        renderItem={renderItem}
        onEndReachedThreshold={0.5}
        removeClippedSubviews={false}
        maxToRenderPerBatch={20}
        windowSize={5}
        initialNumToRender={20}
        updateCellsBatchingPeriod={100}
      />
    </Screen>
  );
}
