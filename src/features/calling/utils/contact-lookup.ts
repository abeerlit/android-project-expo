import {
  DirectoryContact,
  CompanyContact,
  PersonalContact,
  PhoneContact
} from "shared/api/directory/types.ts";

export interface ContactInfo {
  name: string;
  avatarPath: string | null;
  type: "personal" | "company" | "directory" | "phone" | null;
}

/**
 * Find contact information by phone number across all contact types
 * @param phoneNumber Phone number to search for
 * @param personalContacts Array of personal contacts
 * @param companyContacts Array of company contacts
 * @param directoryContacts Array of directory contacts
 * @param phoneContacts Array of phone contacts from device (optional)
 * @returns Contact info with name and avatar path, or null if not found
 */
export function findContactByPhoneNumber(
  phoneNumber: string,
  personalContacts: PersonalContact[],
  companyContacts: CompanyContact[],
  directoryContacts: DirectoryContact[],
  phoneContacts?: PhoneContact[]
): ContactInfo | null {
  if (!phoneNumber) return null;

  // Clean phone number - remove non-digits for comparison
  const cleanPhoneNumber = phoneNumber.replace(/\D/g, "");

  // Helper function to clean and compare phone numbers
  // Handles matching with or without +1 prefix
  const phoneMatches = (contactNumber: string): boolean => {
    if (!contactNumber) return false;
    const cleanContactNumber = contactNumber.replace(/\D/g, "");

    // Exact match
    if (cleanContactNumber === cleanPhoneNumber) return true;

    // Compare last 10 digits (standard US phone number)
    // This handles cases with or without country code (+1)
    const last10Clean = cleanPhoneNumber.slice(-10);
    const last10Contact = cleanContactNumber.slice(-10);

    return last10Clean === last10Contact && last10Clean.length === 10;
  };

  // Helper function to get avatar with fallback
  const getAvatarPath = (contact: {
    avatarThumbnailPath: string | null;
    avatarPath: string | null;
  }): string | null => {
    return contact.avatarThumbnailPath || contact.avatarPath;
  };

  // 1. Search personal contacts first (highest priority)
  for (const contact of personalContacts) {
    if (phoneMatches(contact.number)) {
      return {
        name: contact.name,
        avatarPath: getAvatarPath(contact),
        type: "personal"
      };
    }
  }

  // 2. Search company contacts
  for (const contact of companyContacts) {
    if (phoneMatches(contact.number)) {
      return {
        name: contact.name,
        avatarPath: getAvatarPath(contact),
        type: "company"
      };
    }

    // Also check direct dials for company contacts
    if (contact.directDials && contact.directDials.length > 0) {
      for (const directDial of contact.directDials) {
        if (phoneMatches(directDial)) {
          return {
            name: contact.name,
            avatarPath: getAvatarPath(contact),
            type: "company"
          };
        }
      }
    }
  }

  // 3. Search directory contacts
  for (const contact of directoryContacts) {
    if (phoneMatches(contact.number)) {
      return {
        name: contact.name,
        avatarPath: getAvatarPath(contact),
        type: "directory"
      };
    }

    // Also check direct dials for directory contacts
    if (contact.directDials && contact.directDials.length > 0) {
      for (const directDial of contact.directDials) {
        if (phoneMatches(directDial)) {
          return {
            name: contact.name,
            avatarPath: getAvatarPath(contact),
            type: "directory"
          };
        }
      }
    }
  }

  // 4. Search phone contacts from device (lowest priority)
  if (phoneContacts && phoneContacts.length > 0) {
    for (const contact of phoneContacts) {
      if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
        for (const phone of contact.phoneNumbers) {
          if (phoneMatches(phone.number)) {
            return {
              name: contact.displayName,
              avatarPath: contact.thumbnailPath || null,
              type: "phone"
            };
          }
        }
      }
    }
  }

  return null;
}
