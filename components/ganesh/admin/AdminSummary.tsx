import { type ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Landmark, Package, Users, Wallet } from "lucide-react-native";

import { Money } from "@/components/ganesh/ui/Money";
import { GANESH_RADIUS, withAlpha } from "@/components/ganesh/ui/surfaces";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useTheme } from "@/theme/ThemeProvider";

import { ADMIN_ART } from "./adminArt";

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
      <View style={[styles.rule, { backgroundColor: withAlpha(g.gold, 0.45) }]} />
      <View style={styles.grid}>
        <MetricTile
          basis={basis}
          label="Members"
          meta={membersMeta}
          wash={g.godFund}
          icon={<Users size={18} color={g.godFund} strokeWidth={2} />}
        >
          <Text style={[styles.value, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}>
            {memberCount}
          </Text>
        </MetricTile>
        <MetricTile
          basis={basis}
          label="Permanent Fund"
          meta="Carries across festivals"
          wash={g.gold}
          icon={<Landmark size={18} color={g.gold} strokeWidth={2} />}
        >
          <Money value={fundTotal} size="title" />
        </MetricTile>
        <MetricTile
          basis={basis}
          label="Pending reimbursement"
          meta={reimbMeta}
          wash={g.promised}
          icon={<Wallet size={18} color={g.promised} strokeWidth={2} />}
        >
          <Money value={pendingReimb} size="title" />
        </MetricTile>
        <MetricTile
          basis={basis}
          label="Pandal assets"
          meta={assetsMeta}
          wash={g.personal}
          icon={<Package size={18} color={g.personal} strokeWidth={2} />}
        >
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
  wash,
  icon,
  children,
}: {
  basis: `${number}%`;
  label: string;
  meta: string;
  wash: string;
  icon: ReactNode;
  children: ReactNode;
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
      {icon}
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
  },
  peak: {
    alignSelf: "center",
    width: 30,
    height: 30,
    backgroundColor: "transparent",
  },
  rule: {
    alignSelf: "center",
    width: "70%",
    height: 1,
    borderRadius: 1,
    marginBottom: 10,
    marginTop: 6,
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
