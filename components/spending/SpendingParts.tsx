import { memo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, CloudOff, Info, Lightbulb } from "lucide-react-native";

import { BarChart } from "@/components/charts/BarChart";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator } from "@/components/dashboard/ProgressIndicator";
import { RowGlyph, useSurfaces, withAlpha } from "@/components/dashboard/primitives";
import { Card } from "@/components/ui/Card";
import { haptic } from "@/lib/haptics";
import { getCategoryIcon } from "@/shared/data/categoryTaxonomy";
import { shiftMonthKey } from "@/shared/utils/dates";
import { monthLabel } from "@/shared/utils/monthLabel";
import type { MonthSpendPoint, SpendComparison } from "@/shared/utils/spendingDrilldown";
import { useTheme } from "@/theme/ThemeProvider";

/* ------------------------------------------------------- SpendingMonthSelector */

/**
 * SPENDLY-574 period selector: one month back or forward, never past
 * `maxMonth` (there is no spending to show in the future). The month lives in
 * the route, so it survives tab switches and drill-downs.
 */
export function SpendingMonthSelector({
  month,
  maxMonth,
  onChange,
}: {
  month: string;
  maxMonth: string;
  onChange: (month: string) => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const canGoForward = month < maxMonth;
  const step = (delta: number) => {
    void haptic.selection();
    onChange(shiftMonthKey(month, delta));
  };
  const arrow = (direction: -1 | 1) => {
    const enabled = direction === -1 || canGoForward;
    const Icon = direction === -1 ? ChevronLeft : ChevronRight;
    const target = monthLabel(shiftMonthKey(month, direction), "long");
    return (
      <Pressable
        onPress={() => step(direction)}
        disabled={!enabled}
        hitSlop={6}
        style={({ pressed }) => [styles.monthArrow, pressed && { backgroundColor: surfaces.control }]}
        accessibilityRole="button"
        accessibilityLabel={direction === -1 ? `Previous month, ${target}` : `Next month, ${target}`}
        accessibilityState={{ disabled: !enabled }}
      >
        <Icon
          size={18}
          color={enabled ? theme.colors.foreground : withAlpha(theme.colors.mutedForeground, 0.4)}
          strokeWidth={2.2}
        />
      </Pressable>
    );
  };

  return (
    <View
      style={[styles.monthSelector, { backgroundColor: surfaces.control, borderColor: theme.colors.border }]}
      accessibilityLabel={`Showing ${monthLabel(month, "long")}`}
    >
      {arrow(-1)}
      <Text
        style={[styles.monthText, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}
        numberOfLines={1}
      >
        {monthLabel(month)}
      </Text>
      {arrow(1)}
    </View>
  );
}

/* ------------------------------------------------------------ MonthlySpendBars */

/**
 * Month totals as bars, oldest first, the selected month highlighted. The
 * chart's accessible label reads every value, so nothing depends on a gesture.
 */
export const MonthlySpendBars = memo(function MonthlySpendBars({
  series,
  currency,
  formatMoney,
  color,
  height = 170,
}: {
  series: readonly MonthSpendPoint[];
  currency: string;
  formatMoney: (value: number) => string;
  color?: string;
  height?: number;
}) {
  const { theme } = useTheme();
  const accent = color ?? theme.colors.primary;
  const items = series.map((p, i) => ({
    label: monthLabel(p.month).slice(0, 3),
    value: p.amount,
    color: i === series.length - 1 ? accent : withAlpha(accent, 0.4),
  }));
  const spoken = series
    .map((p) => `${monthLabel(p.month, "long")}: ${p.hasData ? formatMoney(p.amount) : "no data"}`)
    .join(", ");
  return (
    <View accessible accessibilityLabel={`Monthly spending. ${spoken}`}>
      <BarChart
        data={items}
        height={height}
        currency={currency}
        primaryLabel="Spent"
        primaryColor={accent}
        showLegend={false}
        showYAxis
      />
    </View>
  );
});

/* ------------------------------------------------------------ CategoryShareRow */

/** A ranked category or subcategory: glyph, name, share, amount, bar, chevron. */
export function CategoryShareRow({
  label,
  icon,
  amount,
  percentage,
  percentageOf,
  color,
  currency,
  onPress,
  divider,
}: {
  label: string;
  /** Emoji glyph; the category's own when omitted. */
  icon?: string;
  amount: number;
  percentage: number;
  /** What the percentage is of, for the accessible label ("total spending"). */
  percentageOf: string;
  color: string;
  currency: string;
  onPress?: () => void;
  divider?: boolean;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const pct = Math.round(percentage);
  const body = (
    <>
      <RowGlyph tint={withAlpha(color, surfaces.isDark ? 0.18 : 0.12)} size={40}>
        <Text style={styles.emoji}>{icon ?? getCategoryIcon(label)}</Text>
      </RowGlyph>
      <View style={styles.shareBody}>
        <View style={styles.shareTop}>
          <Text
            style={[styles.shareLabel, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}
            numberOfLines={1}
          >
            {label}
          </Text>
          <Text style={[styles.sharePct, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            {pct}%
          </Text>
          <FinancialAmount value={amount} currency={currency} size="sm" weight="semibold" />
        </View>
        <ProgressIndicator pct={percentage} color={color} height={6} />
      </View>
      {onPress ? <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} /> : null}
    </>
  );
  const rowStyle = [
    styles.shareRow,
    divider ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border } : null,
  ];
  if (!onPress) {
    return <View style={rowStyle}>{body}</View>;
  }
  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      android_ripple={{ color: surfaces.control, borderless: false }}
      style={({ pressed }) => [...rowStyle, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${pct}% of ${percentageOf}. Open details`}
    >
      {body}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ TrendChip */

/**
 * A month-on-month change as a small pill (arrow + percent). Less spending is
 * shown as the good direction, as `TrendText invert` does elsewhere; the arrow
 * and the spoken label carry the meaning, not the colour alone.
 */
export function TrendChip({ change, subject = "" }: { change: SpendComparison; subject?: string }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const pct = Math.abs(Math.round(change.pct));
  const flat = change.direction === "flat" || pct === 0;
  const color = flat
    ? theme.colors.mutedForeground
    : change.direction === "down"
      ? theme.colors.success
      : theme.colors.destructive;
  const Icon = change.direction === "down" ? ArrowDown : ArrowUp;
  const spoken = flat ? `${subject} unchanged from last month` : `${subject} ${change.direction} ${pct}% from last month`;
  return (
    <View
      style={[styles.chip, { backgroundColor: flat ? surfaces.control : surfaces.wash(color) }]}
      accessible
      accessibilityLabel={spoken.trim()}
    >
      {flat ? null : <Icon size={12} color={color} strokeWidth={2.6} />}
      <Text style={[styles.chipText, { color, fontFamily: theme.fontFamily.semibold }]}>{flat ? "0%" : `${pct}%`}</Text>
    </View>
  );
}

/* ---------------------------------------------------------------- SpendingHero */

/**
 * The drill-down header card: a glyph tile, the share line, the amount with its
 * trend chip, and what it is compared against.
 */
export function SpendingHero({
  glyph,
  glyphTint,
  caption,
  amount,
  currency,
  change,
  previousLabel,
  testID,
}: {
  glyph: ReactNode;
  glyphTint: string;
  caption: string;
  amount: number;
  currency: string;
  change: SpendComparison | null;
  /** e.g. "vs last month (₹6,620.10)"; omitted with no comparison. */
  previousLabel?: string;
  testID?: string;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  return (
    <Card testID={testID} variant="outlined" elevation={0} radius={20} style={styles.cardEdge} contentStyle={styles.hero}>
      <View style={[styles.heroGlyph, { backgroundColor: withAlpha(glyphTint, surfaces.isDark ? 0.2 : 0.12) }]}>{glyph}</View>
      <View style={styles.heroBody}>
        <Text
          style={[styles.heroCaption, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
          numberOfLines={2}
        >
          {caption}
        </Text>
        <View style={styles.heroAmountRow}>
          <FinancialAmount value={amount} currency={currency} size="xl" weight="bold" fit />
          {change ? <TrendChip change={change} subject="Spending" /> : null}
        </View>
        {change && previousLabel ? (
          <Text style={[styles.heroCaption, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            {previousLabel}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/* ------------------------------------------------------------ ComparisonStat */

/** A stat card: glyph, label, value with trend chip, and last month's figure. */
export function ComparisonStat({
  icon,
  tint,
  label,
  value,
  change,
  footnote,
}: {
  icon: ReactNode;
  tint: string;
  label: string;
  value: ReactNode;
  change: SpendComparison | null;
  footnote?: string;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  return (
    <Card variant="outlined" elevation={0} radius={18} style={[styles.cardEdge, styles.statOuter]} contentStyle={styles.stat}>
      <View style={[styles.statGlyph, { backgroundColor: withAlpha(tint, surfaces.isDark ? 0.2 : 0.12) }]}>{icon}</View>
      <View style={styles.statBody}>
        <Text
          style={[styles.statLabel, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}
          numberOfLines={2}
        >
          {label}
        </Text>
        <View style={styles.statValueRow}>
          {value}
          {change ? <TrendChip change={change} subject={label} /> : null}
        </View>
        {footnote ? (
          <Text
            style={[styles.statFoot, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
            numberOfLines={2}
          >
            {footnote}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/* ---------------------------------------------------------------- CalloutCard */

/** The comparison callout under the stats; opens Insights when tappable. */
export function CalloutCard({ title, body, onPress }: { title: string; body: string; onPress?: () => void }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const content = (
    <>
      <View style={[styles.statGlyph, { backgroundColor: surfaces.wash(theme.colors.warning) }]}>
        <Lightbulb size={18} color={theme.colors.warning} strokeWidth={2.2} />
      </View>
      <View style={styles.statBody}>
        <Text style={[styles.calloutTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
          {title}
        </Text>
        <Text style={[styles.statFoot, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
          {body}
        </Text>
      </View>
      {onPress ? <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} /> : null}
    </>
  );
  const base = [styles.callout, { backgroundColor: surfaces.wash(theme.colors.primary), borderColor: theme.colors.border }];
  if (!onPress) return <View style={base}>{content}</View>;
  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      style={({ pressed }) => [...base, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}. Open insights`}
    >
      {content}
    </Pressable>
  );
}

/* ------------------------------------------------------------------- DataNote */

/** One-line explanatory note: offline data, partial lists, reconciliation gaps. */
export function DataNote({ children, offline = false }: { children: ReactNode; offline?: boolean }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const color = offline ? theme.colors.warning : theme.colors.info;
  const Icon = offline ? CloudOff : Info;
  return (
    <View style={[styles.note, { backgroundColor: surfaces.wash(color) }]} accessibilityRole="text">
      <Icon size={14} color={color} strokeWidth={2.2} />
      <Text style={[styles.noteText, { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  cardEdge: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
  },
  heroGlyph: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  heroBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  heroCaption: {
    fontSize: 13,
    lineHeight: 18,
  },
  heroAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  statOuter: {
    flexGrow: 1,
    flexBasis: 150,
  },
  stat: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
  },
  statGlyph: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  statBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  statLabel: {
    fontSize: 12.5,
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  statFoot: {
    fontSize: 12,
    lineHeight: 16,
  },
  callout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  calloutTitle: {
    fontSize: 14.5,
  },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 40,
  },
  monthArrow: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  monthText: {
    fontSize: 13.5,
    minWidth: 64,
    textAlign: "center",
  },
  emoji: {
    fontSize: 18,
  },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    minHeight: 56,
  },
  shareBody: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  shareTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  shareLabel: {
    flex: 1,
    fontSize: 14.5,
  },
  sharePct: {
    fontSize: 12.5,
    fontVariant: ["tabular-nums"],
  },
  pressed: {
    opacity: 0.82,
  },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
  },
  noteText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
  },
});
