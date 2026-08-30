import { Image, StyleSheet, Text, View } from "react-native";

import { Money } from "@/components/ganesh/ui/Money";
import { GANESH_RADIUS } from "@/components/ganesh/ui/surfaces";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useTheme } from "@/theme/ThemeProvider";

import { ADMIN_ART, type AdminArtName } from "./adminArt";

export function AdminSummary({
  memberCount,
  membersMeta,
  fundTotal,
  pendingReimb,
  reimbMeta,
  assetCount,
  assetsMeta,
}: {
  memberCount: number;
  membersMeta: string;
  fundTotal: number;
  pendingReimb: number;
  reimbMeta: string;
  assetCount: number;
  assetsMeta: string;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { twoCol } = useBreakpoint();
  const basis = twoCol ? "23%" : "47%";

  return (
    <View
      style={[styles.card, { backgroundColor: theme.colors.card, borderColor: g.gold }]}
      accessibilityRole="summary"
      accessibilityLabel={[
        `${memberCount} members. ${membersMeta}`,
        `Permanent Fund ${fundTotal}`,
        `Pending reimbursement ${pendingReimb}. ${reimbMeta}`,
        `${assetCount} Pandal assets. ${assetsMeta}`,
      ].join(". ")}
    >
      <Image
        source={ADMIN_ART.shield}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={styles.peak}
      />
      <Image
        source={ADMIN_ART.goldDivider}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={styles.rule}
      />
      <View style={styles.grid}>
        <MetricTile basis={basis} label="Members" meta={membersMeta} art="statMembers" wash="#2E7D32">
          <Text style={[styles.value, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}>
            {memberCount}
          </Text>
        </MetricTile>
        <MetricTile basis={basis} label="Permanent Fund" meta="Carries across festivals" art="statFund" wash={g.gold}>
          <Money value={fundTotal} size="title" />
        </MetricTile>
        <MetricTile basis={basis} label="Pending reimbursement" meta={reimbMeta} art="statReimb" wash="#7E57C2">
          <Money value={pendingReimb} size="title" />
        </MetricTile>
        <MetricTile basis={basis} label="Pandal assets" meta={assetsMeta} art="statAssets" wash="#4FC3F7">
          <Text style={[styles.value, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}>
            {assetCount}
          </Text>
        </MetricTile>
      </View>
    </View>
  );
}

function MetricTile({
  basis,
  label,
  meta,
  art,
  wash,
  children,
}: {
  basis: `${number}%`;
  label: string;
  meta: string;
  art: AdminArtName;
  wash: string;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  return (
    <View
      style={[
        styles.tile,
        {
          flexBasis: basis,
          backgroundColor: g.wash(wash),
          borderColor: g.divider,
        },
      ]}
    >
      <Image source={ADMIN_ART[art]} resizeMode="contain" style={styles.statIcon} />
      <Text style={[styles.label, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
        {label}
      </Text>
      {children}
      <Text style={[styles.meta, { color: theme.colors.mutedForeground }]} numberOfLines={2}>
        {meta}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: GANESH_RADIUS.section,
    borderCurve: "continuous",
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 10,
    boxShadow: "0 6px 18px rgba(122, 24, 54, 0.08)",
  },
  peak: {
    alignSelf: "center",
    width: 30,
    height: 30,
  },
  rule: {
    alignSelf: "center",
    width: 188,
    height: 18,
    marginBottom: 6,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tile: {
    flexGrow: 1,
    minWidth: 140,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
  },
  statIcon: {
    width: 44,
    height: 44,
  },
  label: {
    fontSize: 11.5,
  },
  value: {
    fontSize: 22,
    letterSpacing: -0.4,
    fontVariant: ["tabular-nums"],
  },
  meta: {
    fontSize: 11,
    lineHeight: 14,
  },
});
