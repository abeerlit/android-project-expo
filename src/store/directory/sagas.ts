/**
 * Redux saga class init
 * There can be multiple sagas
 * Export them as an array
 * Top level sagas in store will take care of combining sagas
 */
import { takeEvery, put, call, select } from "redux-saga/effects";
import * as directoryActions from "./actions.ts";
import * as globalActions from "../global-actions.ts";
import {
  getCompanyContacts,
  getDirectory,
  getPersonalContacts
} from "shared/api/directory/methods.ts";
import {
  DirectoryContact,
  PersonalContact,
  PhoneContact,
  CompanyContact
} from "shared/api/directory/types.ts";
import { Logger } from "shared/utils/Logger.ts";
import { CallGroup } from "shared/api/call-groups/types.ts";
import { getCallGroups } from "shared/api/call-groups/methods.ts";
import { State } from "store/types.ts";
import { getCallQueues } from "shared/api/queues/methods.ts";
import {
  fetchPhoneContacts,
  deduplicatePhoneContacts
} from "shared/utils/phone-contacts.ts";
import { checkPermission, requestPermission } from "core/permissions/utils.ts";
import { Platform } from "react-native";
import { hasActiveCall } from "../../core/callState";
import { syncSmsContactNameCacheFromStore } from "core/notifications/androidSmsContactNameCache.ts";

/** Skip redundant company-contact refetch on foreground right after initial/login load. */
let lastCompanyContactsFetchCompletedAt = 0;
const COMPANY_CONTACTS_FOREGROUND_MIN_INTERVAL_MS = 45_000;

const getToken = (state: State) => state.authReducer.accessToken;
const getTenantId = (state: State) => state.userReducer.user?.tenantId;
const getCompanyContactsState = (state: State) =>
  state.directoryReducer.companyContacts;
const getPersonalContactsState = (state: State) =>
  state.directoryReducer.personalContacts;

function* fetchDirectory() {
  try {
    const logger = new Logger("Directory Sagas: ");
    logger.debug("fetchDirectory() saga: fetching directory");

    const token: string = yield select(getToken);
    const contacts: DirectoryContact[] = yield call(getDirectory, token);
    yield put({
      type: directoryActions.FETCH_DIRECTORY_SUCCESS,
      payload: contacts
    });
    syncSmsContactNameCacheFromStore();
  } catch (error) {
    // TODO : Error Handling
    yield put({ type: directoryActions.FETCH_DIRECTORY_ERROR, error: error });
  }
}

function* fetchCompanyContacts() {
  try {
    const logger = new Logger("Directory Sagas: ");
    logger.debug("fetchCompanyContacts() saga: fetching company contacts");

    const token: string = yield select(getToken);
    const contacts: DirectoryContact[] = yield call(getCompanyContacts, token);
    yield put({
      type: directoryActions.FETCH_COMPANY_CONTACTS_SUCCESS,
      payload: contacts
    });
    syncSmsContactNameCacheFromStore();
    lastCompanyContactsFetchCompletedAt = Date.now();
  } catch (error) {
    // TODO : Error Handling
    yield put({
      type: directoryActions.FETCH_COMPANY_CONTACTS_ERROR,
      error: error
    });
  }
}

function* fetchPersonalContacts() {
  try {
    const logger = new Logger("Directory Sagas: ");
    logger.debug("fetchPersonalContacts() saga: fetching personal contacts");
    const token: string = yield select(getToken);
    const contacts: PersonalContact[] = yield call(getPersonalContacts, token);
    yield put({
      type: directoryActions.FETCH_PERSONAL_CONTACTS_SUCCESS,
      payload: contacts
    });
    syncSmsContactNameCacheFromStore();
  } catch (error) {
    yield put({
      type: directoryActions.FETCH_PERSONAL_CONTACTS_ERROR,
      error: error
    });
  }
}

function* fetchGroups() {
  try {
    const logger = new Logger("Directory Sagas: ");
    logger.debug("fetchGroups() saga: fetching groups");
    const token: string = yield select(getToken);
    const tenantId: number = yield select(getTenantId);
    const groups: CallGroup[] = yield call(getCallGroups, token, tenantId);
    const queues: CallGroup[] = yield call(getCallQueues, token, tenantId);
    const allGroups = [...groups, ...queues]
      .filter((callGroup) => callGroup.number)
      .sort((a, b) => a.name.localeCompare(b.name));
    yield put({
      type: directoryActions.FETCH_GROUPS_SUCCESS,
      payload: allGroups
    });
  } catch (error) {
    yield put({
      type: directoryActions.FETCH_GROUPS_ERROR,
      error: error
    });
  }
}

function* fetchPhoneContactsSaga(): Generator<any, void, any> {
  try {
    const logger = new Logger("Directory Sagas: ");
    logger.debug("fetchPhoneContacts() saga: fetching phone contacts");

    // Check if we have permission to read contacts
    let permissionResult = yield call(checkPermission, "contacts");

    // If permission is not granted, try to request it (iOS). Android requests from
    // Contacts / Personal screens — saga requests often fail to show the system sheet.
    if (!permissionResult.granted) {
      logger.debug(
        "Contacts permission not granted, current status:",
        permissionResult.status
      );

      if (
        Platform.OS !== "android" &&
        permissionResult.status !== "blocked"
      ) {
        logger.debug("Attempting to request contacts permission");
        permissionResult = yield call(requestPermission, "contacts");
      }

      // If still not granted after request attempt, skip sync
      if (!permissionResult.granted) {
        logger.warn(
          "Contacts permission not granted, skipping phone contacts sync"
        );
        yield put({
          type: directoryActions.FETCH_PHONE_CONTACTS_ERROR,
          error: "Permission not granted"
        });
        return;
      }
    }

    logger.debug("Contacts permission granted, fetching phone contacts");

    // Fetch all phone contacts
    const phoneContacts: PhoneContact[] = yield call(fetchPhoneContacts);

    // Get current company and personal contacts for deduplication
    const companyContacts: CompanyContact[] = yield select(
      getCompanyContactsState
    );
    const personalContacts: PersonalContact[] = yield select(
      getPersonalContactsState
    );

    // Deduplicate phone contacts
    const deduplicatedContacts = deduplicatePhoneContacts(
      phoneContacts,
      companyContacts,
      personalContacts
    );

    logger.debug(
      `Successfully synced ${deduplicatedContacts.length} unique phone contacts`
    );

    yield put({
      type: directoryActions.FETCH_PHONE_CONTACTS_SUCCESS,
      payload: deduplicatedContacts
    });
    syncSmsContactNameCacheFromStore();
  } catch (error) {
    const logger = new Logger("Directory Sagas: ");
    logger.error("Error fetching phone contacts:", error);
    yield put({
      type: directoryActions.FETCH_PHONE_CONTACTS_ERROR,
      error: error
    });
  }
}

function* handleAppForeground(): Generator<any, void, any> {
  try {
    const _logger = new Logger("Directory Sagas: ");
    const authReducer = yield select((state: State) => state.authReducer);
    if (!authReducer.isLoggedIn) {
      return;
    }

    // Skip when in call (user accepted from notification, app briefly backgrounded)
    if (typeof hasActiveCall === "function" && hasActiveCall()) {
      _logger.debug("Skipping fetchCompanyContacts - active/connecting call");
      return;
    }

    const sinceLast =
      Date.now() - lastCompanyContactsFetchCompletedAt;
    if (
      lastCompanyContactsFetchCompletedAt > 0 &&
      sinceLast < COMPANY_CONTACTS_FOREGROUND_MIN_INTERVAL_MS
    ) {
      _logger.debug(
        "Skipping fetchCompanyContacts on foreground — fetched recently"
      );
      return;
    }

    // Refresh on foreground so profile avatar/banner changes from other devices show up.
    yield put({ type: directoryActions.FETCH_COMPANY_CONTACTS });
  } catch (error) {
    console.error("Error refreshing directory on foreground:", error);
  }
}

export const directorySagas = [
  takeEvery(directoryActions.FETCH_DIRECTORY, fetchDirectory),
  takeEvery(directoryActions.FETCH_COMPANY_CONTACTS, fetchCompanyContacts),
  takeEvery(directoryActions.FETCH_PERSONAL_CONTACTS, fetchPersonalContacts),
  takeEvery(directoryActions.FETCH_GROUPS, fetchGroups),
  takeEvery(directoryActions.FETCH_PHONE_CONTACTS, fetchPhoneContactsSaga),
  takeEvery(globalActions.APP_FOREGROUND, handleAppForeground)
];
