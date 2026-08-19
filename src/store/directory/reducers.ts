/* Directory Reducer
 * handles directory states in the app
 */
import * as directoryActions from "./actions.ts";
import {
  CompanyContact,
  DirectoryContact,
  PersonalContact,
  PhoneContact
} from "shared/api/directory/types.ts";
import { State } from "store/types.ts";
import createReducer from "store/utils/create-reducer.ts";
import { CallGroup } from "shared/api/call-groups/types.ts";

export interface DirectoryState {
  directory: Array<DirectoryContact>;
  companyContacts: Array<CompanyContact>;
  personalContacts: Array<PersonalContact>;
  phoneContacts: Array<PhoneContact>;
  groups: Array<CallGroup>;
  directoryAvatarVersion: number;
  loading: {
    directory: boolean;
    company: boolean;
    personal: boolean;
    groups: boolean;
    phoneContacts: boolean;
  };
}

const initialState: DirectoryState = {
  directory: [],
  companyContacts: [],
  personalContacts: [],
  phoneContacts: [],
  groups: [],
  directoryAvatarVersion: 0,
  loading: {
    directory: false,
    company: false,
    personal: false,
    groups: false,
    phoneContacts: false
  }
};

type AvatarContact = {
  userId?: number;
  avatarPath?: string | null;
  avatarThumbnailPath?: string | null;
};

function avatarDataChanged(
  oldList: AvatarContact[],
  newList: AvatarContact[]
): boolean {
  const oldMap = new Map<string, { a: string; t: string }>();
  oldList.forEach((c) => {
    if (c.userId != null)
      oldMap.set(String(c.userId), {
        a: c.avatarPath ?? "",
        t: c.avatarThumbnailPath ?? ""
      });
  });
  for (const c of newList) {
    if (c.userId == null) continue;
    const k = String(c.userId);
    const old = oldMap.get(k);
    const na = c.avatarPath ?? "";
    const nt = c.avatarThumbnailPath ?? "";
    if (!old) return true;
    if (old.a !== na || old.t !== nt) return true;
  }
  return false;
}

// @ts-expect-error Ignoring the type error because making it typesafe involves a lot of work when we already know it will be safe
export const directoryReducer = createReducer<DirectoryState, unknown>(
  initialState,
  {
    [directoryActions.FETCH_DIRECTORY_SUCCESS](
      state: State["directoryReducer"],
      action: { type: string; payload: DirectoryContact[] }
    ) {
      return {
        ...state,
        directory: action.payload,
        loading: { ...state.loading, directory: false }
      };
    },

    [directoryActions.FETCH_COMPANY_CONTACTS_SUCCESS](
      state: State["directoryReducer"],
      action: { type: string; payload: CompanyContact[] }
    ) {
      const changed = avatarDataChanged(state.companyContacts, action.payload);
      return {
        ...state,
        companyContacts: action.payload,
        directoryAvatarVersion: changed
          ? Date.now()
          : state.directoryAvatarVersion,
        loading: { ...state.loading, company: false }
      };
    },

    [directoryActions.FETCH_PERSONAL_CONTACTS_SUCCESS](
      state: State["directoryReducer"],
      action: { type: string; payload: PersonalContact[] }
    ) {
      const changed = avatarDataChanged(state.personalContacts, action.payload);
      return {
        ...state,
        personalContacts: action.payload,
        directoryAvatarVersion: changed
          ? Date.now()
          : state.directoryAvatarVersion,
        loading: { ...state.loading, personal: false }
      };
    },

    [directoryActions.FETCH_GROUPS_SUCCESS](
      state: State["directoryReducer"],
      action: { type: string; payload: CallGroup[] }
    ) {
      return {
        ...state,
        groups: action.payload,
        loading: { ...state.loading, groups: false }
      };
    },

    [directoryActions.FETCH_DIRECTORY](state) {
      return {
        ...state,
        loading: { ...state.loading, directory: true }
      };
    },

    [directoryActions.FETCH_COMPANY_CONTACTS](state) {
      return {
        ...state,
        loading: { ...state.loading, company: true }
      };
    },

    [directoryActions.FETCH_PERSONAL_CONTACTS](state) {
      return {
        ...state,
        loading: { ...state.loading, personal: true }
      };
    },

    [directoryActions.FETCH_GROUPS](state) {
      return {
        ...state,
        loading: { ...state.loading, groups: true }
      };
    },

    [directoryActions.FETCH_PHONE_CONTACTS](state) {
      return {
        ...state,
        loading: { ...state.loading, phoneContacts: true }
      };
    },

    [directoryActions.FETCH_PHONE_CONTACTS_SUCCESS](
      state: State["directoryReducer"],
      action: { type: string; payload: PhoneContact[] }
    ) {
      return {
        ...state,
        phoneContacts: action.payload,
        loading: { ...state.loading, phoneContacts: false }
      };
    },

    [directoryActions.FETCH_PHONE_CONTACTS_ERROR](state) {
      return {
        ...state,
        loading: { ...state.loading, phoneContacts: false }
      };
    },

    [directoryActions.FETCH_DIRECTORY_ERROR](state) {
      return {
        ...state,
        loading: { ...state.loading, directory: false }
      };
    },

    [directoryActions.FETCH_COMPANY_CONTACTS_ERROR](state) {
      return {
        ...state,
        loading: { ...state.loading, company: false }
      };
    },

    [directoryActions.FETCH_PERSONAL_CONTACTS_ERROR](state) {
      return {
        ...state,
        loading: { ...state.loading, personal: false }
      };
    },

    [directoryActions.FETCH_GROUPS_ERROR](state) {
      return {
        ...state,
        loading: { ...state.loading, groups: false }
      };
    },

    [directoryActions.UPDATE_COMPANY_CONTACT](
      state: State["directoryReducer"],
      action: {
        type: string;
        payload: { userId: number | string; updates: Partial<CompanyContact> };
      }
    ) {
      const { userId, updates } = action.payload;
      const userIdStr = userId.toString();

      // Update in companyContacts array
      const updatedCompanyContacts = state.companyContacts.map((contact) => {
        if (contact.userId?.toString() === userIdStr) {
          return { ...contact, ...updates };
        }
        return contact;
      });

      // Update in directory array (which contains all contacts)
      const updatedDirectory = state.directory.map((contact) => {
        if (
          contact.userId?.toString() === userIdStr &&
          contact.type === "company"
        ) {
          return { ...contact, ...updates };
        }
        return contact;
      });

      const before = state.companyContacts.find(
        (c) => c.userId?.toString() === userIdStr
      );
      const after = updatedCompanyContacts.find(
        (c) => c.userId?.toString() === userIdStr
      );
      const avatarChanged =
        before && after && avatarDataChanged([before], [after]);

      return {
        ...state,
        companyContacts: updatedCompanyContacts,
        directory: updatedDirectory,
        directoryAvatarVersion: avatarChanged
          ? Date.now()
          : state.directoryAvatarVersion
      };
    }
  }
);
