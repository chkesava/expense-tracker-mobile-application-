import type { ImageSourcePropType } from "react-native";

/**
 * Decorative artwork used by GaneshArt. Hero chrome (garland/bells) and
 * action icons live in their own modules so unused screens do not load them.
 *
 * Never require the composite asset sheet here.
 */
export const GANESH_ART = {
  ganesha: require("@/assets/branding/ganesh/god.png") as ImageSourcePropType,
  temple: require("@/assets/branding/ganesh/mandap.png") as ImageSourcePropType,
  diya: require("@/assets/branding/ganesh/diya.png") as ImageSourcePropType,
  mandala: require("@/assets/branding/ganesh/mandala.png") as ImageSourcePropType,
  lotusWatermark: require("@/assets/branding/ganesh/lotus-watermark.png") as ImageSourcePropType,
} as const;

export type GaneshArtName = keyof typeof GANESH_ART;
