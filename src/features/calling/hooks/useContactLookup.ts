import { useMemo } from "react";
import { useSelector } from "react-redux";
import { State } from "store/types.ts";
import {
  findContactByPhoneNumber,
  ContactInfo
} from "../utils/contact-lookup.ts";

/**
 * Hook to lookup contact information by phone number
 * @param phoneNumber Phone number to search for
 * @returns Contact info with name and avatar path, or null if not found
 */
export function useContactLookup(phoneNumber: string): ContactInfo | null {
  const directoryState = useSelector((state: State) => state.directoryReducer);

  const contactInfo = useMemo(() => {
    if (!phoneNumber) return null;

    return findContactByPhoneNumber(
      phoneNumber,
      directoryState.personalContacts,
      directoryState.companyContacts,
      directoryState.directory,
      directoryState.phoneContacts
    );
  }, [
    phoneNumber,
    directoryState.personalContacts,
    directoryState.companyContacts,
    directoryState.directory,
    directoryState.phoneContacts
  ]);

  return contactInfo;
}
