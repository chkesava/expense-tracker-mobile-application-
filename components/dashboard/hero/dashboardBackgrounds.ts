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

/**
 * SPENDLY-572 — where each scene's subject sits, as `expo-image`
 * `contentPosition` (CSS object-position semantics). The scenes are near
 * square and the hero is wide, so only the vertical crop varies: these keep
 * the sun or moon and the ridgeline in the visible band from a 360 px phone
 * to wide web. Measured on the bundled art; re-measure if an image changes.
 */
export const DASHBOARD_SCENE_FOCUS: Record<DayPeriod, { top: `${number}%`; left: `${number}%` }> = {
  // Sun at ~40% height, ridgeline 35–55%.
  morning: { top: "44%", left: "50%" },
  // Sun at ~26%, ridges 32–50%, lake below. Lower than its ridges so the sun
  // survives the deep crop on wide web.
  afternoon: { top: "28%", left: "50%" },
  // Sunset at ~36%, ridges 30–48%.
  evening: { top: "40%", left: "50%" },
  // Moon at ~25%, ridges 32–48%; same wide-web reasoning as afternoon.
  night: { top: "26%", left: "50%" },
};
