import { Platform } from "react-native";
import { createMMKV } from "react-native-mmkv";
import type { PermissionType } from "core/permissions/types.ts";
import { checkPermission } from "core/permissions/utils.ts";

const storage = createMMKV({ id: "voxo-permission-prompts" });
const STORAGE_KEY = "voxo_permission_prompts_v1";

type PromptRecord = "never_prompted" | "prompted";

type StoredPayload = {
  version: 1;
  prompts: Partial<Record<PermissionType, PromptRecord>>;
};

const ONBOARDING_ANDROID: PermissionType[] = [
  "notifications",
  "microphone",
  "location",
  "phone",
  "phoneNumbers"
];

const ONBOARDING_IOS: PermissionType[] = [
  "notifications",
  "microphone",
  "location",
  "phone"
];

export function getOnboardingPermissionTypes(): PermissionType[] {
  return Platform.OS === "android" ? ONBOARDING_ANDROID : ONBOARDING_IOS;
}

function readPayload(): StoredPayload {
  const raw = storage.getString(STORAGE_KEY);
  if (!raw) {
    return { version: 1, prompts: {} };
  }
  try {
    const parsed = JSON.parse(raw) as StoredPayload;
    if (parsed?.version === 1 && parsed.prompts) {
      return parsed;
    }
  } catch {
    /* corrupt — reset */
  }
  return { version: 1, prompts: {} };
}

function writePayload(payload: StoredPayload): void {
  storage.set(STORAGE_KEY, JSON.stringify(payload));
}

export function hasBeenPrompted(type: PermissionType): boolean {
  const payload = readPayload();
  return payload.prompts[type] === "prompted";
}

export function markPrompted(type: PermissionType): void {
  const payload = readPayload();
  payload.prompts[type] = "prompted";
  writePayload(payload);
}

/** Granted permissions never need a system dialog on future launches. */
export async function markPromptedIfGranted(type: PermissionType): Promise<void> {
  const current = await checkPermission(type);
  if (current.granted) {
    markPrompted(type);
  }
}

/**
 * True when every onboarding permission is either already granted or was prompted once.
 */
export async function hasCompletedOnboardingPrompts(): Promise<boolean> {
  const types = getOnboardingPermissionTypes();
  for (const type of types) {
    const current = await checkPermission(type);
    if (current.granted) {
      continue;
    }
    if (!hasBeenPrompted(type)) {
      return false;
    }
  }
  return true;
}
