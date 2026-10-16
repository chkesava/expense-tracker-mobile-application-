/**
 * SPENDLY-111 — the Journal's period intelligence card.
 *
 * Shows spent / income / net for the rows in view, plus the two figures that
 * keep those honest: how much of the spending went on a card (so it is visibly
 * not cash), and the net cash movement. It also lists the day / week / month
 * breakdown.
 *
 * The card refuses to render figures while the ledger is still a staged page —
 * a total computed from a truncated ledger is worse than no total, because it
 * looks authoritative. That mirrors `assessCardAnalyticsCompleteness`.
 *
 * SPENDLY-534: rebuilt on the dashboard foundations — `Section`, signed
 * `FinancialAmount`s and `ProgressIndicator` bars — with the same props and
 * the same staged-ledger rule.
 */

import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ArrowDownLeft, ArrowUpRight, CalendarRange, Hourglass } from "lucide-react-native";

import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator } from "@/components/dashboard/ProgressIndicator";
import { MetaLabel, Section, useSurfaces } from "@/components/dashboard/primitives";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";
import { Chip } from "@/components/ui/Chip";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { formatMonthLabel } from "@/shared/utils/dateDisplay";
import type {
  JournalPeriodGranularity,
  JournalPeriodSummary as JournalPeriod,
  JournalTotals,
} from "@/shared/utils/journalPeriodSummary";
import { useTheme } from "@/theme/ThemeProvider";

const GRANULARITIES: { id: JournalPeriodGranularity; label: string }[] = [
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
];

/** How many buckets to list before it stops being a summary. */
const MAX_ROWS = 6;

function periodLabel(period: JournalPeriod): string {
  if (period.granularity === "month") return formatMonthLabel(period.key);
  if (period.granularity === "week") return `Week of ${period.fromDate}`;
  return period.fromDate;
}

export function JournalPeriodSummary({
  totals,
  periods,
  granularity,
  onGranularityChange,
  netCashFlow,
  complete,
}: {
  totals: JournalTotals;
  periods: JournalPeriod[];
  granularity: JournalPeriodGranularity;
  onGranularityChange: (granularity: JournalPeriodGranularity) => void;
  netCashFlow: number;
  /** False while the ledger is still the staged page. */
  complete: boolean;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const currency = useDisplayCurrency();

  const visible = useMemo(() => periods.slice(0, MAX_ROWS), [periods]);
  // Bars compare periods against the largest net movement in view.
  const maxAbsNet = useMemo(
    () => Math.max(1, ...visible.map((period) => Math.abs(period.net))),
    [visible]
  );

  if (!complete) {
    return (
      <Section
        title="Period totals paused"
        icon={<Hourglass size={16} color={theme.colors.warning} strokeWidth={2.3} />}
        iconTint={surfaces.wash(theme.colors.warning)}
      >
        <Text
          style={[styles.note, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
        >
          Totals stay hidden until your full history has loaded, so a partial
          ledger is never mistaken for a final figure.
        </Text>
      </Section>
    );
  }

  if (totals.transactionCount === 0) return null;

  return (
    <Section
      title="This view"
      subtitle={`${totals.transactionCount} transaction${totals.transactionCount === 1 ? "" : "s"}`}
      icon={<CalendarRange size={16} color={theme.colors.primary} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.primary)}
    >
      <HorizontalSwipeBoundary>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.granularityRow}
          accessibilityRole="tablist"
        >
          {GRANULARITIES.map((option) => (
            <Chip
              key={option.id}
              size="sm"
              label={option.label}
              selected={option.id === granularity}
              accessibilityRole="tab"
              onPress={() => onGranularityChange(option.id)}
            />
          ))}
        </ScrollView>
      </HorizontalSwipeBoundary>

      <View style={styles.totalsRow}>
        <Figure
          label="Spent"
          icon={<ArrowUpRight size={12} color={theme.colors.info} strokeWidth={2.6} />}
          tint={surfaces.wash(theme.colors.info)}
        >
          <FinancialAmount value={totals.spent} currency={currency} size="md" weight="bold" />
        </Figure>
        <View style={[styles.divider, { backgroundColor: surfaces.divider }]} />
        <Figure
          label="Income"
          icon={<ArrowDownLeft size={12} color={theme.colors.success} strokeWidth={2.6} />}
          tint={surfaces.wash(theme.colors.success)}
        >
          <FinancialAmount value={totals.income} currency={currency} size="md" weight="bold" />
        </Figure>
        <View style={[styles.divider, { backgroundColor: surfaces.divider }]} />
        <Figure label="Net">
          <FinancialAmount
            value={totals.net}
            currency={currency}
            size="md"
            weight="bold"
            sign="auto"
            tone="auto"
          />
        </Figure>
      </View>

      {/* The two figures that stop "Spent" being read as "cash gone". */}
      <View style={[styles.cashBox, { backgroundColor: surfaces.tile }]}>
        {totals.cardSpent > 0 ? (
          <View style={styles.cashLine}>
            <Text
              style={[styles.note, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
            >
              On cards, not yet left your accounts
            </Text>
            <FinancialAmount value={totals.cardSpent} currency={currency} size="xs" />
          </View>
        ) : null}
        <View style={styles.cashLine}>
          <Text
            style={[styles.note, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
          >
            Net cash movement
          </Text>
          <FinancialAmount value={netCashFlow} currency={currency} size="xs" sign="auto" tone="auto" />
        </View>
      </View>

      {visible.length > 1 ? (
        <View style={[styles.periods, { borderTopColor: surfaces.divider }]}>
          {visible.map((period) => (
            <ProgressIndicator
              key={period.key}
              label={periodLabel(period)}
              value={
                <FinancialAmount
                  value={period.net}
                  currency={currency}
                  size="sm"
                  sign="auto"
                  tone="auto"
                />
              }
              pct={(Math.abs(period.net) / maxAbsNet) * 100}
              status={period.net >= 0 ? "good" : "over"}
              statusLabel={period.net >= 0 ? "In" : "Out"}
              trailing={`${period.transactionCount} txn${period.transactionCount === 1 ? "" : "s"}`}
              height={4}
            />
          ))}
          {periods.length > visible.length ? (
            <MetaLabel>+{periods.length - visible.length} more in this view</MetaLabel>
          ) : null}
        </View>
      ) : null}
    </Section>
  );
}

function Figure({
  label,
  icon,
  tint,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  tint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.figure}>
      <View style={styles.figureLabel}>
        {icon ? <View style={[styles.glyph, { backgroundColor: tint }]}>{icon}</View> : null}
        <MetaLabel>{label}</MetaLabel>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  granularityRow: {
    flexDirection: "row",
    gap: 6,
    paddingBottom: 12,
  },
  totalsRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  figure: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  figureLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  glyph: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 10,
  },
  cashBox: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderCurve: "continuous",
    gap: 6,
  },
  cashLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  note: {
    flex: 1,
    minWidth: 0,
    fontSize: 11.5,
    lineHeight: 16,
  },
  periods: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
});
