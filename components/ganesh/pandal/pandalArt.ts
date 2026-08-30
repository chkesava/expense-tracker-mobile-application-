import type { ImageSourcePropType } from "react-native";

/** Pandal-tab ornaments. Same cut-outs as People — not a composite sheet. */
export const PANDAL_ART = {
  temple: require("@/assets/branding/ganesh/people-temple.png") as ImageSourcePropType,
  goldDivider: require("@/assets/branding/ganesh/people-gold-divider.png") as ImageSourcePropType,
  lotusFooter: require("@/assets/branding/ganesh/people-lotus-footer.png") as ImageSourcePropType,
} as const;
