import { memo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight, CloudOff, Info } from "lucide-react-native";

import { BarChart } from "@/components/charts/BarChart";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator } from "@/components/dashboard/ProgressIndicator";
import { RowGlyph, useSurfaces, withAlpha } from "@/components/dashboard/primitives";
import { haptic } from "@/lib/haptics";
import { getCategoryIcon } from "@/shared/data/categoryTaxonomy";
import { shiftMonthKey } from "@/shared/utils/dates";
import { monthLabel } from "@/shared/utils/monthLabel";
import type { MonthSpendPoint } from "@/shared/utils/spendingDrilldown";
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
