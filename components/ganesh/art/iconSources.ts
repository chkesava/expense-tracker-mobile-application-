import type { ImageSourcePropType } from "react-native";

export const GANESH_ACTION_ICONS = {
  seva: require("@/assets/branding/ganesh/icon-seva.png") as ImageSourcePropType,
  collection: require("@/assets/branding/ganesh/icon-collection.png") as ImageSourcePropType,
  expense: require("@/assets/branding/ganesh/icon-expense.png") as ImageSourcePropType,
  contribution: require("@/assets/branding/ganesh/icon-contribution.png") as ImageSourcePropType,
  volunteer: require("@/assets/branding/ganesh/icon-volunteer.png") as ImageSourcePropType,
  asset: require("@/assets/branding/ganesh/icon-asset.png") as ImageSourcePropType,
  memberPayment: require("@/assets/branding/ganesh/icon-member-pay.png") as ImageSourcePropType,
  openingFund: require("@/assets/branding/ganesh/icon-opening-fund.png") as ImageSourcePropType,
} as const;

export type GaneshActionIconName = keyof typeof GANESH_ACTION_ICONS;
