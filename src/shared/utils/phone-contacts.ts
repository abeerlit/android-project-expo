import Contacts from "react-native-contacts";
import { Logger } from "./Logger.ts";
import { PhoneContact } from "shared/api/directory/types.ts";
import { CompanyContact, PersonalContact } from "shared/api/directory/types.ts";

const logger = new Logger("PhoneContacts: ");

/**
 * Normalizes a phone number by removing all non-digit characters
 */
export const normalizePhoneNumber = (phoneNumber: string): string => {
  return phoneNumber.replace(/\D/g, "");
};

/**
 * Checks if two phone numbers match
 * Compares normalized versions and handles partial matches (last 10 digits)
 */
export const phoneNumbersMatch = (phone1: string, phone2: string): boolean => {
  const normalized1 = normalizePhoneNumber(phone1);
  const normalized2 = normalizePhoneNumber(phone2);

  // Exact match
  if (normalized1 === normalized2) return true;

  // Compare last 10 digits (standard US phone number)
  const last10_1 = normalized1.slice(-10);
  const last10_2 = normalized2.slice(-10);

  return last10_1 === last10_2 && last10_1.length === 10;
};

/**
 * Fetches all contacts from the device
 */
export const fetchPhoneContacts = async (): Promise<PhoneContact[]> => {
  try {
    logger.debug("Fetching phone contacts");

    const contacts = await Contacts.getAll();

    // Map to our PhoneContact interface
    const phoneContacts: PhoneContact[] = contacts
      .filter(
        (contact) => contact.phoneNumbers && contact.phoneNumbers.length > 0
      )
      .map((contact) => ({
        recordID: contact.recordID,
        givenName: contact.givenName || "",
        familyName: contact.familyName || "",
        displayName:
          contact.displayName ||
          `${contact.givenName || ""} ${contact.familyName || ""}`.trim() ||
          "Unknown",
        phoneNumbers: contact.phoneNumbers.map((phone) => ({
          label: phone.label || "mobile",
          number: phone.number
        })),
        emailAddresses: contact.emailAddresses?.map((email) => ({
          label: email.label || "home",
          email: email.email
        })),
        thumbnailPath: contact.thumbnailPath || undefined,
        hasThumbnail: contact.hasThumbnail || false
      }));

    logger.debug(`Fetched ${phoneContacts.length} phone contacts`);
    return phoneContacts;
  } catch (error) {
    logger.error("Error fetching phone contacts:", error);
    throw error;
  }
};

/**
 * Checks if a phone contact already exists in company or personal contacts
 */
export const isContactDuplicate = (
  phoneContact: PhoneContact,
  companyContacts: CompanyContact[],
  personalContacts: PersonalContact[]
): boolean => {
  // Get all phone numbers from the phone contact
  const phoneNumbers = phoneContact.phoneNumbers.map((phone) => phone.number);

  // Check against company contacts
  for (const companyContact of companyContacts) {
    if (companyContact.number) {
      for (const phoneNumber of phoneNumbers) {
        if (phoneNumbersMatch(phoneNumber, companyContact.number)) {
          return true;
        }
      }
    }

    // Also check direct dials
    if (companyContact.directDials && companyContact.directDials.length > 0) {
      for (const directDial of companyContact.directDials) {
        for (const phoneNumber of phoneNumbers) {
          if (phoneNumbersMatch(phoneNumber, directDial)) {
            return true;
          }
        }
      }
    }
  }

  // Check against personal contacts
  for (const personalContact of personalContacts) {
    if (personalContact.number) {
      for (const phoneNumber of phoneNumbers) {
        if (phoneNumbersMatch(phoneNumber, personalContact.number)) {
          return true;
        }
      }
    }
  }

  return false;
};

/**
 * Filters out phone contacts that already exist in company or personal contacts
 */
export const deduplicatePhoneContacts = (
  phoneContacts: PhoneContact[],
  companyContacts: CompanyContact[],
  personalContacts: PersonalContact[]
): PhoneContact[] => {
  logger.debug(
    `Deduplicating ${phoneContacts.length} phone contacts against ${companyContacts.length} company contacts and ${personalContacts.length} personal contacts`
  );

  const deduplicated = phoneContacts.filter(
    (phoneContact) =>
      !isContactDuplicate(phoneContact, companyContacts, personalContacts)
  );

  logger.debug(
    `After deduplication: ${deduplicated.length} unique phone contacts`
  );

  return deduplicated;
};

/**
 * Converts a PhoneContact to a format compatible with directory display
 * Takes the first phone number from the contact
 */
export const convertPhoneContactToDisplay = (
  phoneContact: PhoneContact
): CompanyContact => {
  const primaryPhone = phoneContact.phoneNumbers[0]?.number || "";
  const primaryEmail =
    phoneContact.emailAddresses && phoneContact.emailAddresses.length > 0
      ? phoneContact.emailAddresses[0].email
      : "";

  return {
    extId: parseInt(phoneContact.recordID) || 0,
    name: phoneContact.displayName,
    tenantId: 0,
    number: primaryPhone,
    email: primaryEmail,
    peerName: "",
    type: "phone_contact",
    company: "",
    branchId: "",
    avatarPath: phoneContact.thumbnailPath || null,
    avatarThumbnailPath: phoneContact.thumbnailPath || null,
    coverPhoto: "",
    directDials: phoneContact.phoneNumbers
      .slice(1)
      .map((phone) => phone.number),
    userId: 0,
    timezone: null,
    dnd: ""
  };
};
