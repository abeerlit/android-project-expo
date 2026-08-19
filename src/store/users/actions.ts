export const REFRESH_PUSH_ID = "REFRESH_PUSH_ID";
export const DELETE_PUSH_ID = "DELETE_PUSH_ID";
export const STORE_PUSH_ID = "STORE_PUSH_ID";
export const PROVISION_USER = "PROVISION_USER";
export const CLEAR_USER = "CLEAR_USER";
export const USER_PROVISIONED = "USER_PROVISIONED";
export const REFRESH_AVATAR = "REFRESH_AVATAR";
export const UPDATE_USER = "UPDATE_USER";
export const RESET_TOKEN_REGISTRATION = "RESET_TOKEN_REGISTRATION";
export const REFRESH_USER_PROFILE = "REFRESH_USER_PROFILE";

import { User } from "shared/api/users/types.ts";

/**
 * Updates specific properties in the user object in the store
 * @param updates - Object with user properties to update
 * @returns Action object
 */
export const updateUser = (updates: Partial<User>) => ({
  type: UPDATE_USER,
  payload: updates
});
