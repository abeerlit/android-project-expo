/** Expo dev shell — native mail app opener not linked until full native rebuild. */
export async function openInbox(_options?: {
  title?: string;
  message?: string;
  cancelLabel?: string;
}): Promise<void> {
  console.warn("[expo-shell] openInbox stub — rebuild dev client for react-native-email-link");
}

export async function openComposer(_options?: Record<string, string>): Promise<void> {
  console.warn("[expo-shell] openComposer stub");
}

export default { openInbox, openComposer };
