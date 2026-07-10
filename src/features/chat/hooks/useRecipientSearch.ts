// Hook for recipient search functionality
import { useState, useCallback, useMemo } from "react";
import { useSelector } from "react-redux";
import { useDebounceFn } from "ahooks";
import Fuse from "fuse.js";
import { State } from "store/types.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import {
  isValidPhoneNumber,
  stripPhoneNumber
} from "shared/utils/formatters.ts";
import { useItemCreators } from "./useItemCreators.ts";
import { NewMessageItem, MessagingType, SearchFilters } from "./types.ts";

interface UseRecipientSearchProps {
  provisionedNumbers: any[];
  user: any;
  getSelectedRecipients: () => NewMessageItem[];
  getSelectedMessagingType: () => MessagingType;
}

export const useRecipientSearch = (props: UseRecipientSearchProps) => {
  const {
    provisionedNumbers,
    user: _user,
    getSelectedRecipients,
    getSelectedMessagingType
  } = props;
  const [recipient, setRecipient] = useState("");
  const [searchResults, setSearchResults] = useState<NewMessageItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const { directory, companyContacts, personalContacts, phoneContacts } =
    useSelector((state: State) => state.directoryReducer);
  const { conversations: textConversations } = useSelector(
    (state: State) => state.textReducer
  );

  const { filteredGroupChannels, filteredDMChannels } = useSendbirdContext();
  const itemCreators = useItemCreators();

  const businessContacts = useMemo(
    () => companyContacts.filter((contact) => contact.userId),
    [companyContacts]
  );

  const validPersonalContacts = useMemo(
    () => personalContacts.filter((contact) => contact.number),
    [personalContacts]
  );

  const getSelectedUserIds = useCallback(() => {
    const recipients = getSelectedRecipients();
    return new Set(recipients.map((r) => r.userId).filter(Boolean));
  }, [getSelectedRecipients]);

  const isDIDNumber = useCallback(
    (phoneNumber: string): boolean => {
      if (!provisionedNumbers || provisionedNumbers.length === 0) return false;
      const stripped = stripPhoneNumber(phoneNumber);
      return provisionedNumbers.some(
        (pn) => stripPhoneNumber(pn.number) === stripped
      );
    },
    [provisionedNumbers]
  );

  const dmContainsSelectedUsers = useCallback(
    (memberUserIds?: string[]) => {
      if (!memberUserIds) return false;
      const selectedUserIds = getSelectedUserIds();
      return memberUserIds.some((id) => selectedUserIds.has(id));
    },
    [getSelectedUserIds]
  );

  const findContactByNumber = useCallback(
    (phoneNumber: string) => {
      const stripped = stripPhoneNumber(phoneNumber);

      // Check personal contacts
      for (const contact of validPersonalContacts) {
        if (stripPhoneNumber(contact.number) === stripped) {
          return contact;
        }
      }

      // Check company contacts
      for (const contact of businessContacts) {
        if (stripPhoneNumber(contact.number) === stripped) {
          return contact;
        }
      }

      return null;
    },
    [validPersonalContacts, businessContacts]
  );

  const getSearchFilters = useCallback(
    (searchTerm: string): SearchFilters => {
      const searchingChannels = searchTerm.startsWith("#");
      const selectedRecipients = getSelectedRecipients();
      const selectedMessagingType = getSelectedMessagingType();

      return {
        canSearchChannels:
          selectedRecipients.length === 0 ||
          selectedMessagingType === "sendbird",
        canSearchSendbirdContacts:
          selectedRecipients.length === 0 ||
          selectedMessagingType === "sendbird",
        canSearchTextContacts:
          selectedRecipients.length === 0 ||
          selectedMessagingType === "text" ||
          isValidPhoneNumber(searchTerm),
        canSearchContacts: !searchingChannels
      };
    },
    [getSelectedRecipients, getSelectedMessagingType]
  );

  const searchChannels = useCallback(
    (searchQuery: string, filters: SearchFilters): NewMessageItem[] => {
      if (!filters.canSearchChannels) return [];

      const channelFuse = new Fuse(filteredGroupChannels, {
        threshold: 0.3,
        ignoreLocation: true,
        keys: ["name"]
      });

      const channelResults = searchQuery
        ? channelFuse.search(searchQuery).map((result) => result.item)
        : filteredGroupChannels.slice(0, 50);

      return channelResults.map(itemCreators.createChannelItem);
    },
    [filteredGroupChannels, itemCreators]
  );

  const searchSendbirdContacts = useCallback(
    (searchQuery: string, filters: SearchFilters): NewMessageItem[] => {
      if (!filters.canSearchSendbirdContacts || !searchQuery) return [];

      const results: NewMessageItem[] = [];

      const eligibleDMs = filteredDMChannels.filter(
        (dm) => !dm.personal && !dmContainsSelectedUsers(dm.memberUserIds)
      );

      const dmFuse = new Fuse(eligibleDMs, {
        threshold: 0.3,
        ignoreLocation: true,
        keys: ["name"]
      });

      const dmResults = dmFuse.search(searchQuery).map((result) => result.item);

      const selectedUserIds = getSelectedUserIds();
      const eligibleBusinessContacts = businessContacts.filter(
        (contact) => !selectedUserIds.has(contact.userId?.toString())
      );

      const businessFuse = new Fuse(eligibleBusinessContacts, {
        threshold: 0.3,
        ignoreLocation: true,
        keys: ["name", "number", "email"]
      });

      const businessResults = businessFuse
        .search(searchQuery)
        .map((result) => result.item);

      // Directory users before DM channel rows so a named contact ranks above a matching channel name.
      businessResults.forEach((contact) => {
        results.push(itemCreators.createUserItem(contact));
      });

      dmResults.forEach((dm) => {
        results.push(itemCreators.createDMItem(dm));
      });

      return results;
    },
    [
      filteredDMChannels,
      businessContacts,
      getSelectedUserIds,
      dmContainsSelectedUsers,
      itemCreators
    ]
  );

  const searchTextContacts = useCallback(
    (searchQuery: string, filters: SearchFilters): NewMessageItem[] => {
      if (!filters.canSearchTextContacts || !searchQuery) return [];

      const results: NewMessageItem[] = [];

      const personalFuse = new Fuse(validPersonalContacts, {
        threshold: 0.3,
        ignoreLocation: true,
        keys: ["name", "number", "email", "firstName", "lastName"]
      });

      const personalResults = personalFuse
        .search(searchQuery)
        .map((result) => result.item);

      personalResults.slice(0, 10).forEach((contact) => {
        results.push(itemCreators.createPersonalContactItem(contact));
      });

      const phoneFuse = new Fuse(phoneContacts, {
        threshold: 0.3,
        ignoreLocation: true,
        keys: ["displayName", "givenName", "familyName", "phoneNumbers.number"]
      });

      const phoneResults = phoneFuse
        .search(searchQuery)
        .map((result) => result.item);

      phoneResults.slice(0, 10).forEach((contact) => {
        if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
          const primaryPhone = contact.phoneNumbers[0];
          results.push(
            itemCreators.createPhoneContactItem(contact, primaryPhone.number)
          );
        }
      });

      const conversationFuse = new Fuse(textConversations, {
        threshold: 0.3,
        ignoreLocation: true,
        keys: ["name", "conversationName", "participants"]
      });

      const conversationResults = conversationFuse
        .search(searchQuery)
        .map((result) => result.item);

      conversationResults.slice(0, 5).forEach((conversation) => {
        results.push(itemCreators.createConversationItem(conversation));
      });

      return results;
    },
    [validPersonalContacts, phoneContacts, textConversations, itemCreators]
  );

  const handlePhoneNumberEntry = useCallback(
    (
      searchQuery: string,
      currentResults: NewMessageItem[],
      filters: SearchFilters
    ): NewMessageItem | null => {
      if (
        !filters.canSearchTextContacts ||
        !isValidPhoneNumber(searchQuery) ||
        isDIDNumber(searchQuery)
      ) {
        return null;
      }

      const stripped = stripPhoneNumber(searchQuery);

      const phoneAlreadyAdded = currentResults.some(
        (item) =>
          (item.type === "phone" && item.phoneNumber === stripped) ||
          (item.type === "personal" && item.phoneNumber === stripped) ||
          (item.type === "phone-contact" && item.phoneNumber === stripped) ||
          (item.type === "user" &&
            item.userId &&
            directory.some(
              (contact) =>
                contact.userId?.toString() === item.userId &&
                stripPhoneNumber(contact.number) === stripped
            ))
      );

      if (phoneAlreadyAdded) return null;

      const matchingContact = findContactByNumber(searchQuery);
      if (matchingContact) {
        return itemCreators.createPersonalContactItem(matchingContact);
      }

      return itemCreators.createPhoneItem(searchQuery);
    },
    [isDIDNumber, findContactByNumber, directory, itemCreators]
  );

  const handleSearch = useCallback(
    async (searchTerm: string) => {
      setIsSearching(true);

      if (!searchTerm.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      const normalizedSearch = searchTerm.toLowerCase().trim();
      const searchingChannels = normalizedSearch.startsWith("#");
      const searchingUsers = normalizedSearch.startsWith("@");
      const searchQuery =
        searchingChannels || searchingUsers
          ? normalizedSearch.slice(1)
          : normalizedSearch;

      const filters = getSearchFilters(normalizedSearch);

      const channelItems: NewMessageItem[] =
        searchingChannels || !searchingUsers
          ? searchChannels(searchQuery, filters)
          : [];

      const peopleItems: NewMessageItem[] = [];
      if (filters.canSearchContacts && searchQuery) {
        peopleItems.push(...searchSendbirdContacts(searchQuery, filters));
        peopleItems.push(...searchTextContacts(searchQuery, filters));
      }

      const results: NewMessageItem[] = [];
      if (searchingChannels && !searchingUsers) {
        // Explicit #channel search — show matching channels first.
        results.push(...channelItems, ...peopleItems);
      } else if (!searchingUsers) {
        // Normal query: prioritize people (directory, DMs, SMS) over group channels.
        results.push(...peopleItems, ...channelItems);
      } else {
        // @mention-style query — contacts only (channelItems already empty).
        results.push(...peopleItems);
      }

      if (filters.canSearchContacts && searchQuery) {
        const phoneItem = handlePhoneNumberEntry(searchQuery, results, filters);
        if (phoneItem) {
          results.unshift(phoneItem);
        }
      }

      // Deduplicate results based on unique identifiers.
      const seenUserIds = new Set<string>();
      const seenPhoneNumbers = new Set<string>();
      const seenChannelUrls = new Set<string>();
      const seenConversationIds = new Set<string>();
      const seenRecordIds = new Set<string>();
      const seenNames = new Set<string>();

      const deduplicatedResults = results.filter((item) => {
        const nameLower = item.name.toLowerCase().trim();

        // If we've already seen this exact name, skip it (prevents same person from appearing twice).
        if (seenNames.has(nameLower)) {
          return false;
        }

        // Check userId.
        if (item.userId) {
          if (seenUserIds.has(item.userId)) {
            return false;
          }
          seenUserIds.add(item.userId);
        }

        // Check phone number.
        if (item.phoneNumber) {
          if (seenPhoneNumbers.has(item.phoneNumber)) {
            return false;
          }
          seenPhoneNumbers.add(item.phoneNumber);
        }

        // Check channel URL.
        if (item.channelUrl) {
          if (seenChannelUrls.has(item.channelUrl)) {
            return false;
          }
          seenChannelUrls.add(item.channelUrl);
        }

        // Check conversation ID.
        if (item.conversationId) {
          const convId = item.conversationId.toString();
          if (seenConversationIds.has(convId)) {
            return false;
          }
          seenConversationIds.add(convId);
        }

        // Check record ID.
        if (item.recordID) {
          if (seenRecordIds.has(item.recordID)) {
            return false;
          }
          seenRecordIds.add(item.recordID);
        }

        // Add name to seen set.
        seenNames.add(nameLower);

        return true;
      });

      setSearchResults(deduplicatedResults.slice(0, 50));
      setIsSearching(false);
    },
    [
      getSearchFilters,
      searchChannels,
      searchSendbirdContacts,
      searchTextContacts,
      handlePhoneNumberEntry
    ]
  );

  const { run: debouncedSearch } = useDebounceFn(handleSearch, { wait: 500 });

  const handleRecipientChange = useCallback(
    (value: string) => {
      setRecipient(value);
      debouncedSearch(value);
    },
    [debouncedSearch]
  );

  const clearSearch = useCallback(() => {
    setRecipient("");
    setSearchResults([]);
    setIsSearching(false);
  }, []);

  return {
    recipient,
    searchResults,
    isSearching,
    handleRecipientChange,
    clearSearch,
    itemCreators
  };
};
