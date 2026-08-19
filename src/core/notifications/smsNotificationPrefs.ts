/**
 * SMS toggle (Preferences → Notifications → SMS Messages), enableMobileTextNotifications:
 * - 1 = ON
 * - 0 = OFF
 *
 * Backend FCM contract (Android):
 * - Toggle OFF: data-only payload (no `notification` object). App updates badge/Redux only.
 * - Toggle ON: payload includes `notification` (title/body). App shows one Notifee tray via JS;
 *   do not rely on the OS auto-display path.
 *
 * `ignorePush` in data is legacy/extra; tray display is gated by the SMS toggle above.
 */
export function areSmsNotificationsEnabled(
  enableMobileTextNotifications?: number | null
): boolean {
  return enableMobileTextNotifications === 1;
}
