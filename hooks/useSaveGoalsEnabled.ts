/**
 * Whether the Save Goals screens (SPENDLY-606) are visible for this user.
 *
 * Staged rollout (SPENDLY-615), from `system_settings/global` (admin-only; the
 * rules keep that document out of client reach): a uid allowlist for internal
 * and staged users, then a global switch. Development builds always show the
 * screens so the feature can be reviewed on local Expo web and the emulator.
 * Rules: shared/utils/saveGoalsFlag.ts.
 *
 * The flag gates screens, not data: goal writes always use the audited model,
 * so turning it off again (rollback) leaves every goal readable by the
 * dashboard widget, the Money section and the optimizer.
 */

import { useAuth } from "@/providers/AuthProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { saveGoalsEnabled } from "@/shared/utils/saveGoalsFlag";

export function useSaveGoalsEnabled(): boolean {
  return useSaveGoalsFlag().enabled;
}

/**
 * The flag plus whether `system_settings` is still loading. The provider
 * starts from defaults (flag off), so anything that acts on "off" — a route
 * redirect, cancelling reminders — must wait for `loading` to clear.
 */
export function useSaveGoalsFlag(): { enabled: boolean; loading: boolean } {
  const { settings, loading } = useSystemSettings();
  const { user } = useAuth();
  return {
    enabled: saveGoalsEnabled(settings, typeof __DEV__ !== "undefined" && __DEV__, user?.uid),
    loading,
  };
}
