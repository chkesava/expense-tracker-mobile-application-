import type { ImageSourcePropType } from "react-native";

/** Cut-outs for maroon stack heroes. Never require the composite sheet. */
export const FESTIVAL_CHROME_ART = {
  flag: require("@/assets/branding/ganesh/saffron-flag.png") as ImageSourcePropType,
  medallion: require("@/assets/branding/ganesh/pandal-medallion.png") as ImageSourcePropType,
  temple: require("@/assets/branding/ganesh/people-temple.png") as ImageSourcePropType,
} as const;
