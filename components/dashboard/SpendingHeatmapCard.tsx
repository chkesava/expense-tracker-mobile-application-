import { memo, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useRouter, type Href } from "expo-router";
import { CalendarDays } from "lucide-react-native";

import { PeriodSelector } from "@/components/analytics/shared/PeriodSelector";
import { Card } from "@/components/ui/Card";
import { useSurfaces } from "@/components/dashboard/primitives";
import type { JournalRecord } from "@/shared/utils/journalActivities";
import {
  activeDaysCount,
  averageDailySpend,
  buildDailySpendingBuckets,
  dailySpendingAccessibilityRows,
  highestSpendingDay,
  intensityLevel,
  monthGridWeeks,
  type DailySpendingBucket,
} from "@/shared/utils/dashboard/spendingHeatmap";
import { currentMonthKey, orderedWeekdays, shiftMonthKey } from "@/shared/utils/dates";
import { monthLabel } from "@/shared/utils/monthLabel";
import { transactionsHref } from "@/shared/utils/transactionsFeed";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "@/theme/surfaces";

export interface SpendingHeatmapCardProps {
  records: readonly JournalRecord[];
  currency: string;
  fill?: boolean;
}

/**
 * The mandatory "Spending by Day" calendar heatmap. All figures come from
 * `buildDailySpendingBuckets` (`shared/utils/dashboard/spendingHeatmap.ts`),
 * which only counts eligible spend already present in the Journal's row
 * set — never a fresh total computed here.
 */
export const SpendingHeatmapCard = memo(function SpendingHeatmapCard({
  records,
  currency,
  fill = false,
}: SpendingHeatmapCardProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const [monthKey, setMonthKey] = useState(() => currentMonthKey());
  const [denominator, setDenominator] = useState<"activeDays" | "allDaysInMonth">("activeDays");
  const [selected, setSelected] = useState<DailySpendingBucket | null>(null);

  const buckets = useMemo(() => buildDailySpendingBuckets(records, monthKey), [records, monthKey]);
  const weeks = useMemo(() => monthGridWeeks(monthKey), [monthKey]);
  const scaleMax = useMemo(() => buckets.reduce((max, b) => Math.max(max, b.total), 0), [buckets]);
  const highest = useMemo(() => highestSpendingDay(buckets), [buckets]);
  const average = useMemo(() => averageDailySpend(buckets, denominator), [buckets, denominator]);
  const { active, total } = useMemo(() => activeDaysCount(buckets), [buckets]);
  const accessibilityRows = useMemo(
    () => dailySpendingAccessibilityRows(buckets, (amount) => formatAmount(amount, currency)),
    [buckets, currency]
  );
  const bucketByDate = useMemo(() => new Map(buckets.map((b) => [b.date, b])), [buckets]);
  const weekdays = useMemo(() => orderedWeekdays("sunday"), []);

  const isCurrent = monthKey === currentMonthKey();

  // SPENDLY dashboard redesign fix: size the 7 day-columns from the grid
  // column's own measured width instead of a fixed 16px, so the heatmap
  // actually uses the room the card has beside the stats column.
  const [gridWidth, setGridWidth] = useState<number | null>(null);
  const cellSize =
    gridWidth === null
      ? CELL_SIZE_MIN
      : Math.max(CELL_SIZE_MIN, Math.min(CELL_SIZE_MAX, Math.floor((gridWidth - 6 * CELL_GAP) / 7)));
  const handleGridLayout = (e: LayoutChangeEvent) => setGridWidth(e.nativeEvent.layout.width);

  return (
    <Card variant="outlined" style={fill ? styles.fill : undefined} contentStyle={styles.content} testID="dash-spending-heatmap">
      <View style={styles.header}>
        <View style={[styles.glyph, { backgroundColor: surfaces.wash(theme.colors.primary) }]}>
          <CalendarDays size={16} color={theme.colors.primary} strokeWidth={2.3} />
        </View>
        <Text style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
          Spending by Day
        </Text>
      </View>

      <PeriodSelector
        label={monthLabel(monthKey, "long")}
        badge={isCurrent ? "CURRENT" : null}
        onPrev={() => setMonthKey((m) => shiftMonthKey(m, -1))}
        onNext={() => setMonthKey((m) => shiftMonthKey(m, 1))}
      />

      <View style={styles.body}>
        <View style={styles.gridCol} onLayout={handleGridLayout}>
          <View style={styles.weekdayRow}>
            {weekdays.map(({ index, label }) => (
              <Text
                key={index}
                style={[
                  styles.weekdayLabel,
                  { width: cellSize, color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
                ]}
              >
                {label[0]}
              </Text>
            ))}
          </View>
          {weeks.map((week, weekIndex) => (
            <View key={weekIndex} style={styles.weekRow}>
              {week.map((date, dayIndex) => {
                if (!date) return <View key={dayIndex} style={{ width: cellSize, height: cellSize }} />;
                const bucket = bucketByDate.get(date);
                const level = intensityLevel(bucket?.total ?? 0, scaleMax);
                const isSelected = selected?.date === date;
                return (
                  <Pressable
                    key={date}
                    onPress={() => setSelected(bucket ?? null)}
                    accessibilityRole="button"
                    accessibilityLabel={`${date}: ${
                      bucket && bucket.total > 0 ? `${formatAmount(bucket.total, currency)} spent` : "No spending"
                    }`}
                    style={[
                      styles.cell,
                      {
                        width: cellSize,
                        height: cellSize,
                        backgroundColor:
                          level === 0
                            ? surfaces.tile
                            : withAlpha(theme.colors.primary, 0.15 + level * 0.2),
                        borderColor: isSelected ? theme.colors.primary : "transparent",
                        borderWidth: isSelected ? 1.5 : 0,
                      },
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.summaryCol}>
          <SummaryStat
            label="Highest spending day"
            value={highest ? formatAmount(highest.total, currency) : "—"}
            detail={highest ? highest.date : "No spending yet"}
          />
          <Pressable onPress={() => setDenominator((d) => (d === "activeDays" ? "allDaysInMonth" : "activeDays"))}>
            <SummaryStat
              label={denominator === "activeDays" ? "Average per spending day" : "Average per calendar day"}
              value={formatAmount(average, currency)}
              detail="Tap to switch"
            />
          </Pressable>
          <SummaryStat label="Active days" value={`${active} / ${total}`} detail="Days with eligible spending" />
        </View>
      </View>

      {selected ? (
        <Pressable
          onPress={() => router.push(transactionsHref(monthKey, "expenses").concat(`&date=${selected.date}`) as Href)}
          style={[styles.selectedRow, { borderTopColor: surfaces.divider }]}
        >
          <Text style={[styles.selectedText, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}>
            {selected.date}:{" "}
            {selected.total > 0
              ? `${formatAmount(selected.total, currency)} across ${selected.transactionCount} transaction${selected.transactionCount === 1 ? "" : "s"}`
              : "No spending"}
          </Text>
        </Pressable>
      ) : null}

      {/* Text/table fallback for screen readers and non-visual consumers. */}
      <View accessibilityElementsHidden={false} style={styles.srOnly}>
        {accessibilityRows.map((row) => (
          <Text key={row.label}>
            {row.label}: {row.detail}
          </Text>
        ))}
      </View>
    </Card>
  );
});

function SummaryStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.statValue, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.statDetail, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]} numberOfLines={1}>
        {detail}
      </Text>
    </View>
  );
}

/**
 * Fallback before the grid column's own width is measured, and the floor
 * once it is. `summaryCol` no longer grows (SPENDLY dashboard redesign fix:
 * the grid used to stay a fixed 16px/cell while the stat column absorbed
 * every bit of the row's remaining width), so `gridCol` can measure
 * meaningfully wider than its old fixed footprint.
 */
const CELL_SIZE_MIN = 16;
const CELL_SIZE_MAX = 40;
const CELL_GAP = 4;

const styles = StyleSheet.create({
  content: {
    gap: 12,
  },
  fill: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  glyph: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
  },
  body: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  gridCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  weekdayRow: {
    flexDirection: "row",
    gap: 4,
  },
  weekdayLabel: {
    fontSize: 9,
    textAlign: "center",
  },
  weekRow: {
    flexDirection: "row",
    gap: 4,
  },
  cell: {
    borderRadius: 4,
    borderCurve: "continuous",
  },
  summaryCol: {
    // Fixed to its content width (SPENDLY dashboard redesign fix): it no
    // longer competes with the grid for the row's flexible space, so the
    // grid can actually grow past its old fixed 16px/cell footprint.
    width: 150,
    gap: 10,
  },
  stat: {
    gap: 1,
  },
  statLabel: {
    fontSize: 11.5,
  },
  statValue: {
    fontSize: 16,
  },
  statDetail: {
    fontSize: 11,
  },
  selectedRow: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  selectedText: {
    fontSize: 13,
  },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },
});
