import { CompanyContact, PersonalContact } from "shared/api/directory/types.ts";

export type Contact = CompanyContact | PersonalContact;

export type DirectoryRowProps = {
  item: Contact;
  personal?: boolean;
  handlePress: (contact: Contact) => void;
};
