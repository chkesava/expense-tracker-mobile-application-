/**
 * Whether the Tax & ITR Readiness Center (SPENDLY-288) is visible for this
 * user: a uid allowlist, then a global switch, from `system_settings/global`
 * (admin-only). Development builds always show it, so it can be reviewed on
 * local Expo web and the emulator. Rules: shared/features/tax/utils/flag.ts.
 *
 * `loading`: the provider starts from defaults (flag off), so a route redirect
 * must wait for it to clear.
 */

import { useAuth } from "@/providers/AuthProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { taxCenterEnabled } from "@/shared/features/tax/utils/flag";

export function useTaxCenterFlag(): { enabled: boolean; loading: boolean } {
  const { settings, loading } = useSystemSettings();
  const { user } = useAuth();
  return {
    enabled: taxCenterEnabled(settings, typeof __DEV__ !== "undefined" && __DEV__, user?.uid),
    loading,
  };
}
