import type { ImageSourcePropType } from "react-native";

/** People-tab ornaments. Kept local so Home / Funds do not load them. */
export const PEOPLE_ART = {
  temple: require("@/assets/branding/ganesh/people-temple.png") as ImageSourcePropType,
  mark: require("@/assets/branding/ganesh/people-mark.png") as ImageSourcePropType,
  goldDivider: require("@/assets/branding/ganesh/people-gold-divider.png") as ImageSourcePropType,
  lotusFooter: require("@/assets/branding/ganesh/people-lotus-footer.png") as ImageSourcePropType,
} as const;
