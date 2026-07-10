import { createSelector } from "@reduxjs/toolkit";
import { State } from "store/types.ts";

const selectDirectoryState = (state: State) => state.directoryReducer;

export const selectCompanyContactsData = createSelector(
  selectDirectoryState,
  (directory) => ({
    companyContacts: directory.companyContacts,
    loading: directory.loading.company
  })
);

export const selectPersonalContactsData = createSelector(
  selectDirectoryState,
  (directory) => ({
    personalContacts: directory.personalContacts,
    loading: directory.loading.personal
  })
);

export const selectGroupsData = createSelector(
  selectDirectoryState,
  (directory) => ({
    groups: directory.groups,
    loading: directory.loading.groups
  })
);

export const selectPhoneContactsData = createSelector(
  selectDirectoryState,
  (directory) => ({
    phoneContacts: directory.phoneContacts,
    loading: directory.loading.phoneContacts
  })
);

export const selectDirectoryWithPhoneContacts = createSelector(
  selectDirectoryState,
  (directory) => ({
    companyContacts: directory.companyContacts,
    phoneContacts: directory.phoneContacts,
    loading: directory.loading.company || directory.loading.phoneContacts
  })
);

export const selectPersonalContactsWithPhoneContacts = createSelector(
  selectDirectoryState,
  (directory) => ({
    personalContacts: directory.personalContacts,
    phoneContacts: directory.phoneContacts,
    loading: directory.loading.personal || directory.loading.phoneContacts
  })
);
