/**
 * Whether the Investments feature should be visible.
 *
 * Both flags must agree: the user's own `enableInvestments` preference and the
 * admin-wide `system_settings/global.enableInvestments`. The investments screen
 * already checked both, but the bottom nav, side drawer, and dashboard checked
 * only the user's — so an admin disabling the feature left a tab that navigated
 * straight to a "feature disabled" screen.
 */

import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";

export function useInvestmentsEnabled(): boolean {
  const { settings } = useSettings();
  const { settings: system } = useSystemSettings();
  return Boolean(settings.enableInvestments && system.enableInvestments);
}
