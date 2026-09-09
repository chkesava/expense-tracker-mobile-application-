import { type GaneshMessageKey } from "@/shared/i18n/ganesh/keys";

/**
 * The single source of truth for Ganesh Seva's tab names.
 *
 * These labels used to be written out twice — once as `Tabs.Screen`
 * `options.title` in `app/(ganesh)/(tabs)/_layout.tsx` and again in the `TABS`
 * array in `components/ganesh/GaneshTabBar.tsx`. Two copies of the same string
 * means two translations that can disagree, so they are keyed here instead and
 * both files read from this map.
 *
 * Includes the registered-but-not-visible routes (`collections`, `expenses`,
 * `contributions`, `committee`), which still need titles for deep links and
 * screen readers.
 */
export const GANESH_TAB_LABEL_KEYS: Record<string, GaneshMessageKey> = {
  index: "nav.home",
  seva: "nav.seva",
  funds: "nav.funds",
  people: "nav.people",
  pandal: "nav.pandal",
  collections: "nav.collections",
  expenses: "nav.expenses",
  contributions: "nav.contributions",
  committee: "nav.committee",
};
