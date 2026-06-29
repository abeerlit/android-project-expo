// Type Imports
import React from "react";
import { CompanyContact } from "shared/api/directory/types.ts";

// Component Imports
import { Contact } from "features/contacts/types/types.ts";
import { CompanyContactDrawer } from "features/contacts/components/CompanyContactDrawer.tsx";
import { PersonalContactDrawer } from "features/contacts/components/PersonalContactDrawer.tsx";

type ContactDrawerProps = {
  item: Contact;
};

const isCompanyContact = (contact: Contact): contact is CompanyContact => {
  // Device phone book rows are shaped like CompanyContact but use type + userId 0;
  // they must use PersonalContactDrawer (SMS / NewMessage), not Sendbird-only CompanyContactDrawer.
  if ((contact as { type?: string }).type === "phone_contact") {
    return false;
  }
  return "company" in contact && "timezone" in contact;
};

export const ContactDrawer = ({ item }: ContactDrawerProps) => {
  if (isCompanyContact(item)) {
    return <CompanyContactDrawer item={item} />;
  }
  return <PersonalContactDrawer item={item} />;
};
