/**
 * In-memory flag while the onboarding permission dialog sequence runs.
 * Used to suppress APP_FOREGROUND churn from permission sheet AppState flicker.
 */
let permissionPromptInProgress = false;

export function getPermissionPromptInProgress(): boolean {
  return permissionPromptInProgress;
}

export function setPermissionPromptInProgress(value: boolean): void {
  permissionPromptInProgress = value;
}
