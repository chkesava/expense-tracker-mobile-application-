/**
 * Whether the Save Goals screens (SPENDLY-606) are visible.
 *
 * Staged rollout: `system_settings/global.enableSaveGoals` (admin-only; the
 * rules keep that document out of client reach) turns the Goals list and
 * detail screens on. Development builds always show them so the feature can be
 * reviewed on local Expo web and the emulator.
 *
 * The flag gates screens, not data: goal writes always use the audited model,
 * so turning it off again (rollback) leaves every goal readable by the
 * dashboard widget, the Money section and the optimizer.
 */

import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { saveGoalsEnabled } from "@/shared/utils/saveGoalsFlag";

export function useSaveGoalsEnabled(): boolean {
  const { settings } = useSystemSettings();
  return saveGoalsEnabled(settings, typeof __DEV__ !== "undefined" && __DEV__);
}
