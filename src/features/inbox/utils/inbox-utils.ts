import { phoneNumberFormatter } from "shared/utils/utils.ts";
import {
  DirectoryContact,
  PersonalContact
} from "shared/api/directory/types.ts";

export function getCallerNameFromVoicemailCallerId(
  callerId: string,
  directory: DirectoryContact[]
) {
  if (!callerId) return "Unknown";
  const trimmedCallerId = callerId.trim().replace(/^["']|["']$/g, "");

  // Match formats like: "Name" <number>, "" <number>, "<1015>", "<+16013329283>".
  // Note: Do NOT use 1? - it incorrectly strips leading 1 from extensions like 1015, producing "015".
  const regex = /"([^"]*)"?\s*<\+?(\d+)>/;
  const match = trimmedCallerId.match(regex);

  if (match) {
    // Clean name: remove trailing backslash from escaped quotes (e.g. "Abeer\" -> "Abeer").
    const rawName = match[1] || "";
    const name = rawName.replace(/\\+$/, "").trim();
    const phoneNumber = match[2];

    // Look up by full phone number first (with and without leading 1).
    let contact =
      directory.find((c) => c.number === phoneNumber) ||
      directory.find((c) => c.number === phoneNumber.replace(/^1/, "")) ||
      null;

    if (contact) return contact.name;

    // If name looks like extension (short numeric like "123") but we have full phone number, prefer formatted number.
    const nameIsExtension =
      /^\d{1,6}$/.test((name || "").trim()) && (name || "").trim().length < 10;

    if (nameIsExtension && phoneNumber.length >= 10) {
      contact = directory.find((c) => c.number === (name || "").trim()) || null;
      if (contact) return contact.name;
      return phoneNumberFormatter(phoneNumber);
    }

    // If name is extension but number is also short - try directory by name (extension).
    if (nameIsExtension) {
      contact = directory.find((c) => c.number === (name || "").trim()) || null;
      if (contact) return contact.name;
      return `Extension ${(name || "").trim()}`;
    }

    if (name && name.trim()) return name;
    return phoneNumberFormatter(phoneNumber);
  }

  // Handle plain phone numbers (extract digits).
  const digitsOnly = trimmedCallerId.replace(/\D/g, "");
  if (digitsOnly.length >= 10) {
    // Remove country code if present (1 for US).
    const phoneNumber =
      digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
    const contact =
      directory.find(
        (c) => c.number === digitsOnly || c.number === phoneNumber
      ) || null;
    if (contact) return contact.name;
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(
      3,
      6
    )}-${phoneNumber.slice(6)}`;
  }

  return trimmedCallerId || "Unknown";
}

export function getContactName(
  number: string,
  name: string | null,
  directory: DirectoryContact[],
  personalContacts?: PersonalContact[]
) {
  const directoryContact = directory.find(
    (contact) => contact.number === number
  );
  if (directoryContact?.name) return directoryContact.name;

  const personalList = personalContacts ?? [];
  const personalContact = personalList.find(
    (contact) => contact.number === number
  );
  if (personalContact?.name) return personalContact.name;

  // 3. Use provided name or formatted number
  if (!name || name.includes("unknown")) {
    return !name ? phoneNumberFormatter(number) : "Unknown";
  }
  return name;
}
