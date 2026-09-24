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
 */

import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Amount } from "@/components/common/Amount";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { formatMonthLabel } from "@/shared/utils/dateDisplay";
import type {
  JournalPeriodGranularity,
  JournalPeriodSummary as JournalPeriod,
  JournalTotals,
} from "@/shared/utils/journalPeriodSummary";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

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
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const currency = useDisplayCurrency();

  const visible = useMemo(() => periods.slice(0, MAX_ROWS), [periods]);

  const surface = {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
  };

  if (!complete) {
    return (
      <View style={[styles.card, surface, { borderColor: theme.colors.warning }]}>
        <Text style={[styles.title, { color: theme.colors.foreground }]}>
          Period totals paused
        </Text>
        <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
          Totals stay hidden until your full history has loaded, so a partial
          ledger can never be mistaken for a final figure.
        </Text>
      </View>
    );
  }

  if (totals.transactionCount === 0) return null;

  return (
    <View style={[styles.card, surface]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.colors.foreground }]}>
          This view
        </Text>
        <View style={styles.granularityRow}>
          {GRANULARITIES.map((option) => {
            const active = option.id === granularity;
            return (
              <Pressable
                key={option.id}
                onPress={() => onGranularityChange(option.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.granularityChip,
                  {
                    backgroundColor: active
                      ? theme.colors.primary
                      : isDark
                        ? "rgba(255,255,255,0.05)"
                        : "rgba(0,0,0,0.04)",
                    borderColor: active
                      ? theme.colors.primary
                      : theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.granularityText,
                    {
                      color: active
                        ? theme.colors.primaryForeground
                        : theme.colors.mutedForeground,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.totalsRow}>
        <View style={styles.totalCol}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            Spent
          </Text>
          <Amount
            value={totals.spent}
            currency={currency}
            ghostable
            style={[styles.value, { color: theme.colors.destructive }]}
          />
        </View>
        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
        <View style={styles.totalCol}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            Income
          </Text>
          <Amount
            value={totals.income}
            currency={currency}
            ghostable
            style={[styles.value, { color: theme.colors.success }]}
          />
        </View>
        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
        <View style={styles.totalCol}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            Net
          </Text>
          <Amount
            value={totals.net}
            currency={currency}
            ghostable
            style={[
              styles.value,
              {
                color:
                  totals.net >= 0
                    ? theme.colors.success
                    : theme.colors.destructive,
              },
            ]}
          />
        </View>
      </View>

      {/* The two figures that stop "Spent" being read as "cash gone". */}
      <View style={styles.cashRow}>
        {totals.cardSpent > 0 ? (
          <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
            Includes{" "}
            <Amount
              value={totals.cardSpent}
              currency={currency}
              ghostable
              style={[styles.noteStrong, { color: theme.colors.foreground }]}
            />{" "}
            on cards, which has not left your accounts yet.
          </Text>
        ) : null}
        <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
          Net cash movement{" "}
          <Amount
            value={netCashFlow}
            currency={currency}
            ghostable
            style={[
              styles.noteStrong,
              {
                color:
                  netCashFlow >= 0
                    ? theme.colors.success
                    : theme.colors.destructive,
              },
            ]}
          />
        </Text>
      </View>

      {visible.length > 1 ? (
        <View style={styles.periods}>
          {visible.map((period) => (
            <View key={period.key} style={styles.periodRow}>
              <Text
                style={[styles.periodLabel, { color: theme.colors.foreground }]}
                numberOfLines={1}
              >
                {periodLabel(period)}
              </Text>
              <Text
                style={[
                  styles.periodCount,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                {period.transactionCount}
              </Text>
              <Amount
                value={period.net}
                currency={currency}
                ghostable
                style={[
                  styles.periodValue,
                  {
                    color:
                      period.net >= 0
                        ? theme.colors.success
                        : theme.colors.destructive,
                  },
                ]}
              />
            </View>
          ))}
          {periods.length > visible.length ? (
            <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
              +{periods.length - visible.length} more in this view
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
  },
  granularityRow: {
    flexDirection: "row",
    gap: 6,
  },
  granularityChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  granularityText: {
    fontSize: 11,
    fontWeight: "700",
  },
  totalsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  totalCol: {
    flex: 1,
    gap: 2,
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    marginHorizontal: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
  },
  value: {
    fontSize: 15,
    fontWeight: "800",
  },
  cashRow: {
    gap: 4,
  },
  note: {
    fontSize: 11,
    lineHeight: 16,
  },
  noteStrong: {
    fontSize: 11,
    fontWeight: "700",
  },
  periods: {
    gap: 6,
  },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  periodLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
  },
  periodCount: {
    fontSize: 11,
    minWidth: 24,
    textAlign: "right",
  },
  periodValue: {
    fontSize: 12,
    fontWeight: "700",
  },
});
