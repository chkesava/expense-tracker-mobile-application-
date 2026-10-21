import type { ImageSourcePropType } from "react-native";

import type { DayPeriod } from "@/shared/utils/dayPeriod";

/**
 * SPENDLY-566 — the dashboard hero's bundled time-of-day backdrops. Static
 * `require`s only: Metro bundles them and nothing is ever fetched at runtime.
 * The design references under `design/` are never imported.
 */
export const DASHBOARD_BACKGROUNDS: Record<DayPeriod, ImageSourcePropType> = {
  morning: require("@/assets/images/dashboard/dashboard-morning.webp"),
  afternoon: require("@/assets/images/dashboard/dashboard-afternoon.webp"),
  evening: require("@/assets/images/dashboard/dashboard-evening.webp"),
  night: require("@/assets/images/dashboard/dashboard-night.webp"),
};
