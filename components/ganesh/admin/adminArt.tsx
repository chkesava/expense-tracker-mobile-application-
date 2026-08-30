import { Image, type ImageSourcePropType } from "react-native";

/** Individual Admin cut-outs. Never require the composite asset sheet. */
export const ADMIN_ART = {
  shield: require("@/assets/branding/ganesh/admin-shield.png") as ImageSourcePropType,
  temple: require("@/assets/branding/ganesh/people-temple.png") as ImageSourcePropType,
  goldDivider: require("@/assets/branding/ganesh/people-gold-divider.png") as ImageSourcePropType,
  lotusFooter: require("@/assets/branding/ganesh/people-lotus-footer.png") as ImageSourcePropType,
  lotusWatermark: require("@/assets/branding/ganesh/lotus-watermark.png") as ImageSourcePropType,
  diya: require("@/assets/branding/ganesh/diya.png") as ImageSourcePropType,
  statMembers: require("@/assets/branding/ganesh/admin-stat-members.png") as ImageSourcePropType,
  statFund: require("@/assets/branding/ganesh/admin-stat-fund.png") as ImageSourcePropType,
  statReimb: require("@/assets/branding/ganesh/admin-stat-reimb.png") as ImageSourcePropType,
  statAssets: require("@/assets/branding/ganesh/admin-stat-assets.png") as ImageSourcePropType,
  iconMembers: require("@/assets/branding/ganesh/admin-icon-members.png") as ImageSourcePropType,
  iconJoin: require("@/assets/branding/ganesh/admin-icon-join.png") as ImageSourcePropType,
  iconRoles: require("@/assets/branding/ganesh/admin-icon-roles.png") as ImageSourcePropType,
  iconCommittee: require("@/assets/branding/ganesh/admin-icon-committee.png") as ImageSourcePropType,
  iconFestival: require("@/assets/branding/ganesh/admin-icon-festival.png") as ImageSourcePropType,
  iconFund: require("@/assets/branding/ganesh/admin-icon-fund.png") as ImageSourcePropType,
  iconContribution: require("@/assets/branding/ganesh/admin-icon-contribution.png") as ImageSourcePropType,
  iconAssets: require("@/assets/branding/ganesh/admin-icon-assets.png") as ImageSourcePropType,
  iconSponsors: require("@/assets/branding/ganesh/admin-icon-sponsors.png") as ImageSourcePropType,
  iconReports: require("@/assets/branding/ganesh/admin-icon-reports.png") as ImageSourcePropType,
  iconAudit: require("@/assets/branding/ganesh/admin-icon-audit.png") as ImageSourcePropType,
  iconCategories: require("@/assets/branding/ganesh/admin-icon-categories.png") as ImageSourcePropType,
  iconSettings: require("@/assets/branding/ganesh/admin-icon-settings.png") as ImageSourcePropType,
} as const;

export type AdminArtName = keyof typeof ADMIN_ART;

export function AdminGlyph({ name, size = 36 }: { name: AdminArtName; size?: number }) {
  return (
    <Image
      source={ADMIN_ART[name]}
      resizeMode="contain"
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
