import { Platform, StyleSheet, Text, View } from "react-native";
import { CollectionIcon, ContributionIcon, ExpenseIcon } from "@/components/ganesh/art/icons";
import { LotusDivider } from "@/components/ganesh/art/LotusDivider";
import { Money, SectionAction, useGaneshTokens } from "@/components/ganesh/ui";
import { GANESH_RADIUS } from "@/components/ganesh/ui/surfaces";
import type { ContributionTotals } from "@/shared/utils/ganeshContributions";
import { useTheme } from "@/theme/ThemeProvider";

const TITLE_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  web: 'Georgia, "Times New Roman", serif',
  default: undefined,
});

/**
 * Contribution status for this festival. Values come from
 * `summarizeContributions` — promised is not cash.
 */
export function FestivalReportStrip({
  totals,
  onDetails,
}: {
  totals: ContributionTotals;
  onDetails: () => void;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const promised = totals.promisedCash + totals.promisedInKind;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: g.divider }]}>
      <View style={styles.heading}>
        <Text
          style={[
            styles.title,
            { color: g.saffron, fontFamily: TITLE_FONT ?? theme.fontFamily.semibold },
          ]}
        >
          Festival Report
        </Text>
        <SectionAction label="View Details" onPress={onDetails} />
      </View>
      <LotusDivider maxWidth={168} />

      <View style={styles.row}>
        <View style={[styles.tile, { backgroundColor: g.wash(g.godFund) }]}>
          <CollectionIcon size={28} />
          <Text style={[styles.label, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
            Received
          </Text>
          <Money value={totals.cashReceived} size="secondary" tone="positive" numberOfLines={1} adjustsFontSizeToFit />
          <Text style={[styles.meta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            Cash · in the God Fund
          </Text>
        </View>
        <View style={[styles.tile, { backgroundColor: g.wash(g.promised) }]}>
          <ContributionIcon size={28} />
          <Text style={[styles.label, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
            Promised
          </Text>
          <Money value={promised} size="secondary" tone="warning" numberOfLines={1} adjustsFontSizeToFit />
          <Text style={[styles.meta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            Not cash until received
          </Text>
        </View>
        <View style={[styles.tile, { backgroundColor: g.wash(g.maroon) }]}>
          <ExpenseIcon size={28} />
          <Text style={[styles.label, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
            Pending
          </Text>
          <Text
            style={[
              styles.count,
              {
                color: totals.overdueCount > 0 ? theme.colors.warning : theme.colors.foreground,
                fontFamily: theme.fontFamily.semibold,
              },
            ]}
          >
            {totals.overdueCount}
          </Text>
          <Text
            style={[
              styles.meta,
              {
                color: totals.overdueCount > 0 ? theme.colors.warning : theme.colors.mutedForeground,
                fontFamily: theme.fontFamily.regular,
              },
            ]}
          >
            {totals.overdueCount > 0 ? "Past the expected day" : "None overdue"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: GANESH_RADIUS.section,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    fontSize: 16,
    letterSpacing: -0.2,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    borderRadius: GANESH_RADIUS.tile,
    borderCurve: "continuous",
    padding: 8,
    gap: 4,
  },
  label: {
    fontSize: 11.5,
  },
  meta: {
    fontSize: 10.5,
    lineHeight: 14,
  },
  count: {
    fontSize: 14,
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"],
  },
});
