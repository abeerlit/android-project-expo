import { phoneNumberFormatter } from "shared/utils/utils.ts";
import { findContactByPhoneNumber } from "features/calling/utils/contact-lookup.ts";

// Types
import { Theme } from "core/theme/theme.ts";
import { CallData } from "shared/api/inbox/types.ts";
import {
  DirectoryContact,
  CompanyContact,
  PersonalContact,
  PhoneContact
} from "shared/api/directory/types.ts";

export const getDisplayName = (
  item: CallData,
  directory: DirectoryContact[],
  personalContacts: PersonalContact[],
  companyContacts: CompanyContact[],
  phoneContacts?: PhoneContact[]
): string | null => {
  const phoneNumber =
    item?.direction === "inbound" ? item.callerIdNum : item.dialedNum;
  const apiName =
    item?.direction === "inbound" ? item.callerIdName : item.dialedName;

  if (!phoneNumber) return null;

  const contactInfo = findContactByPhoneNumber(
    phoneNumber,
    personalContacts,
    companyContacts,
    directory,
    phoneContacts
  );
  if (contactInfo?.name) return contactInfo.name;
  if (apiName && !apiName.includes("unknown")) return apiName;
  return null;
};

export const getDisplayNumber = (item: CallData) =>
  phoneNumberFormatter(
    item.direction === "inbound" ? item.callerIdNum : item.dialedNum
  );

export const getDispositionIcon = (direction: string) =>
  direction === "inbound" ? "phone-incoming-01" : "phone-outgoing-01";

export const getDispositionColor = (disposition: string, theme: Theme) =>
  disposition === "ANSWERED"
    ? theme.colors["color-colors-text-text-primary"]
    : theme.colors["color-colors-foreground-fg-error-primary"];
