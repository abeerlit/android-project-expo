/**
 * Permission Types
 * Core permission type definitions used throughout the app
 */

/**
 * Permission Types
 * Types of permissions that can be requested in the app
 */
export type PermissionType =
  | "microphone"
  | "location"
  | "notifications"
  | "contacts"
  | "phone"
  | "phoneNumbers";

/**
 * Permission Status
 * Possible status values for a permission
 */
export type PermissionStatus =
  | "granted"
  | "denied"
  | "unavailable"
  | "blocked"
  | "limited"
  | "not-determined";

/**
 * Permission Result
 * Represents the result of a permission check or request
 */
export interface PermissionResult {
  status: PermissionStatus;
  granted: boolean;
}

/**
 * Permissions State
 * Contains the state of all permissions tracked by the app
 */
export interface PermissionsState {
  microphone: PermissionResult;
  location: PermissionResult;
  notifications: PermissionResult;
  phone?: PermissionResult;
  phoneNumbers?: PermissionResult;
}
