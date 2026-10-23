import { memo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronLeft, ChevronRight, CloudOff, Info, Lightbulb } from "lucide-react-native";

import { BarChart } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator } from "@/components/dashboard/ProgressIndicator";
import { useSurfaces, withAlpha } from "@/components/dashboard/primitives";
import { categoryLucideIcon } from "@/components/spending/categoryIcons";
import { Card } from "@/components/ui/Card";
import { haptic } from "@/lib/haptics";
import { shiftMonthKey } from "@/shared/utils/dates";
import { monthLabel } from "@/shared/utils/monthLabel";
import type { MonthSpendPoint, SpendComparison } from "@/shared/utils/spendingDrilldown";
import { useTheme } from "@/theme/ThemeProvider";

/*
 * SPENDLY-574 — the drill-down building blocks. One type scale, one radius
 * (18 for cards, 12 for controls), line icons only, and figures in tabular
 * numerals, so Total Spending and every category page read as one product.
 */

const CARD_RADIUS = 18;

/* ------------------------------------------------------------- CategoryIcon */

/** A category's line icon on a soft tinted disc. */
export function CategoryIcon({ category, color, size = 40 }: { category: string; color: string; size?: number }) {
  const surfaces = useSurfaces();
  const Icon = categoryLucideIcon(category);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: withAlpha(color, surfaces.isDark ? 0.18 : 0.1),
      }}
    >
      <Icon size={Math.round(size * 0.46)} color={color} strokeWidth={2} />
    </View>
  );
}

/* ----------------------------------------------------------- DrilldownTopBar */

/** Back on the left, the period on the right — nothing else competes for the row. */
export function DrilldownTopBar({
  onBack,
  month,
  maxMonth,
  onChangeMonth,
}: {
  onBack: () => void;
  month: string;
  maxMonth: string;
  onChangeMonth: (month: string) => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  return (
    <View style={styles.topBar}>
      <Pressable
        onPress={onBack}
        hitSlop={8}
        style={({ pressed }) => [
          styles.backButton,
          { backgroundColor: surfaces.control, borderColor: theme.colors.border },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <ArrowLeft size={20} color={theme.colors.foreground} strokeWidth={2.2} />
      </Pressable>
      <SpendingMonthSelector month={month} maxMonth={maxMonth} onChange={onChangeMonth} />
    </View>
  );
}

/* ------------------------------------------------------------- DrilldownTabs */

/** Equal-width underline tabs with a 44dp target each. */
export function DrilldownTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (tab: T) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.tabs, { borderBottomColor: theme.colors.border }]} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <Pressable
            key={tab.id}
            onPress={() => {
              if (active) return;
              void haptic.selection();
              onChange(tab.id);
            }}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={[
                styles.tabLabel,
                {
                  color: active ? theme.colors.primary : theme.colors.mutedForeground,
                  fontFamily: active ? theme.fontFamily.semibold : theme.fontFamily.medium,
                },
              ]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
            <View style={[styles.tabIndicator, { backgroundColor: active ? theme.colors.primary : "transparent" }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------- SpendingMonthSelector */

/**
 * The period selector: one month back or forward, never past `maxMonth`. The
 * month lives in the route, so it survives tab switches and drill-downs.
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
  const arrow = (direction: -1 | 1) => {
    const enabled = direction === -1 || canGoForward;
    const Icon = direction === -1 ? ChevronLeft : ChevronRight;
    const target = monthLabel(shiftMonthKey(month, direction), "long");
    return (
      <Pressable
        onPress={() => {
          void haptic.selection();
          onChange(shiftMonthKey(month, direction));
        }}
        disabled={!enabled}
        hitSlop={4}
        style={({ pressed }) => [styles.monthArrow, pressed && { backgroundColor: surfaces.control }]}
        accessibilityRole="button"
        accessibilityLabel={direction === -1 ? `Previous month, ${target}` : `Next month, ${target}`}
        accessibilityState={{ disabled: !enabled }}
      >
        <Icon
          size={17}
          color={enabled ? theme.colors.foreground : withAlpha(theme.colors.mutedForeground, 0.35)}
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
        style={[styles.monthText, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
        numberOfLines={1}
      >
        {monthLabel(month)}
      </Text>
      {arrow(1)}
    </View>
  );
}

/* ------------------------------------------------------------------ TrendChip */

/**
 * A month-on-month change as a small pill. Less spending shows as the good
 * direction, as `TrendText invert` does elsewhere; the arrow and the spoken
 * label carry the meaning, not the colour alone.
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
      {flat ? null : <Icon size={11} color={color} strokeWidth={2.8} />}
      <Text style={[styles.chipText, { color, fontFamily: theme.fontFamily.semibold }]}>{flat ? "0%" : `${pct}%`}</Text>
    </View>
  );
}

/* ---------------------------------------------------------------- SpendingHero */

/** The drill-down's identity and headline figure. */
export function SpendingHero({
  icon,
  title,
  caption,
  amount,
  currency,
  change,
  previousLabel,
  testID,
}: {
  icon: ReactNode;
  title: string;
  caption: string;
  amount: number;
  currency: string;
  change: SpendComparison | null;
  /** e.g. "₹15,137 last month"; shown only with a comparison. */
  previousLabel?: string;
  testID?: string;
}) {
  const { theme } = useTheme();
  return (
    <Card testID={testID} variant="outlined" elevation={0} radius={22} style={styles.cardEdge} contentStyle={styles.hero}>
      <View style={styles.heroIdentity}>
        {icon}
        <View style={styles.heroTitles}>
          <Text style={[styles.heroTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.heroCaption, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]} numberOfLines={1}>
            {caption}
          </Text>
        </View>
      </View>
      <View style={styles.heroFigure}>
        <FinancialAmount value={amount} currency={currency} size="hero" weight="bold" fit />
        {change ? (
          <View style={styles.heroCompare}>
            <TrendChip change={change} subject="Spending" />
            {previousLabel ? (
              <Text style={[styles.heroCaption, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
                {previousLabel}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

/* ----------------------------------------------------------------- SurfaceCard */

/** A titled card in the drill-down style: title left, a quiet meta right. */
export function SurfaceCard({
  title,
  meta,
  action,
  children,
  testID,
}: {
  title?: string;
  meta?: string;
  /** A control on the right of the title (replaces `meta`). */
  action?: ReactNode;
  children: ReactNode;
  testID?: string;
}) {
  const { theme } = useTheme();
  return (
    <Card testID={testID} variant="outlined" elevation={0} radius={CARD_RADIUS} style={styles.cardEdge} contentStyle={styles.surface}>
      {title ? (
        <View style={styles.surfaceHeader}>
          <Text style={[styles.surfaceTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>{title}</Text>
          {action ?? (meta ? (
            <Text style={[styles.surfaceMeta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>{meta}</Text>
          ) : null)}
        </View>
      ) : null}
      {children}
    </Card>
  );
}

/* --------------------------------------------------------------- BreakdownCard */

export type BreakdownItem = { key: string; label: string; amount: number; percentage: number; color: string };

/**
 * Donut above a full-width legend (name, share, amount), so long names like
 * "Restaurants & Dining" are never cut to "Restaur…" on a phone. Rows and
 * slices are the same targets.
 */
export function BreakdownCard({
  title,
  items,
  currency,
  formatMoney,
  shareOf,
  onPick,
}: {
  title: string;
  items: readonly BreakdownItem[];
  currency: string;
  formatMoney: (value: number) => string;
  /** For the spoken label: "of Food & Groceries", "of total spending". */
  shareOf: string;
  onPick?: (index: number) => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const segments = items.map((item) => ({ id: item.key, label: item.label, value: item.amount, color: item.color }));
  return (
    <SurfaceCard title={title} meta={`${items.length} ${items.length === 1 ? "item" : "items"}`}>
      <View style={styles.breakdown}>
        <DonutChart
          data={segments}
          size={168}
          strokeWidth={16}
          currency={currency}
          title="Total"
          titleBelow
          centerFractionDigits={0}
          showLegend={false}
          onSlicePress={onPick ? (_, index) => onPick(index) : undefined}
        />
        <View style={styles.legend}>
          {items.map((item, index) => {
            const row = (
              <>
                <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                <Text
                  style={[styles.legendName, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
                <Text style={[styles.legendPct, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
                  {`${Math.round(item.percentage)}%`}
                </Text>
                <Text style={[styles.legendAmount, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
                  {formatMoney(item.amount)}
                </Text>
              </>
            );
            if (!onPick) {
              return (
                <View key={item.key} style={styles.legendRow}>
                  {row}
                </View>
              );
            }
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  void haptic.selection();
                  onPick(index);
                }}
                style={({ pressed }) => [styles.legendRow, pressed && { backgroundColor: surfaces.control }]}
                accessibilityRole="button"
                accessibilityLabel={`${item.label}, ${Math.round(item.percentage)}% ${shareOf}, ${formatMoney(item.amount)}`}
              >
                {row}
              </Pressable>
            );
          })}
        </View>
      </View>
    </SurfaceCard>
  );
}

/* ------------------------------------------------------------ MonthlySpendBars */

/**
 * Month totals as bars, oldest first, the selected month highlighted. The
 * accessible label reads every value, so nothing depends on a gesture.
 */
export const MonthlySpendBars = memo(function MonthlySpendBars({
  series,
  currency,
  formatMoney,
  color,
  height = 180,
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
    color: i === series.length - 1 ? accent : withAlpha(accent, 0.28),
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

/** A ranked category: icon, name, amount, share bar with its percent, chevron. */
export function CategoryShareRow({
  label,
  amount,
  percentage,
  percentageOf,
  color,
  currency,
  onPress,
  divider,
}: {
  label: string;
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
      <CategoryIcon category={label} color={color} size={40} />
      <View style={styles.shareBody}>
        <View style={styles.shareTop}>
          <Text
            style={[styles.shareLabel, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}
            numberOfLines={1}
          >
            {label}
          </Text>
          <FinancialAmount value={amount} currency={currency} size="sm" weight="semibold" />
        </View>
        <View style={styles.shareBottom}>
          <ProgressIndicator pct={percentage} color={color} height={5} style={styles.shareBar} />
          <Text style={[styles.sharePct, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
            {pct}%
          </Text>
        </View>
      </View>
      {onPress ? <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} /> : null}
    </>
  );
  const rowStyle = [
    styles.shareRow,
    divider ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border } : null,
  ];
  if (!onPress) return <View style={rowStyle}>{body}</View>;
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

/* ------------------------------------------------------------ ComparisonStat */

/**
 * A stat card: icon and label on top, the value on its own full-width line,
 * then the change and last month's figure — so nothing has to truncate.
 */
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
    <Card variant="outlined" elevation={0} radius={CARD_RADIUS} style={[styles.cardEdge, styles.statOuter]} contentStyle={styles.stat}>
      <View style={styles.statHead}>
        <View style={[styles.statGlyph, { backgroundColor: withAlpha(tint, surfaces.isDark ? 0.18 : 0.1) }]}>{icon}</View>
        <Text
          style={[styles.statLabel, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      {value}
      <View style={styles.statFootRow}>
        {change ? <TrendChip change={change} subject={label} /> : null}
        {footnote ? (
          <Text
            style={[styles.statFoot, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
            numberOfLines={1}
          >
            {footnote}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/* ---------------------------------------------------------------- CalloutCard */

/** The comparison callout under the stats; opens deeper analysis when tappable. */
export function CalloutCard({ title, body, onPress }: { title: string; body: string; onPress?: () => void }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const content = (
    <>
      <View style={[styles.statGlyph, { backgroundColor: withAlpha(theme.colors.primary, surfaces.isDark ? 0.22 : 0.12) }]}>
        <Lightbulb size={16} color={theme.colors.primary} strokeWidth={2.2} />
      </View>
      <View style={styles.calloutBody}>
        <Text style={[styles.calloutTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
          {title}
        </Text>
        <Text style={[styles.calloutText, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
          {body}
        </Text>
      </View>
      {onPress ? <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} /> : null}
    </>
  );
  const base = [
    styles.callout,
    {
      backgroundColor: withAlpha(theme.colors.primary, surfaces.isDark ? 0.1 : 0.05),
      borderColor: withAlpha(theme.colors.primary, surfaces.isDark ? 0.28 : 0.16),
    },
  ];
  if (!onPress) return <View style={base}>{content}</View>;
  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      style={({ pressed }) => [...base, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
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
  pressed: { opacity: 0.8 },
  cardEdge: { borderWidth: StyleSheet.hairlineWidth },

  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },

  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "flex-end" },
  tabLabel: { fontSize: 14, paddingBottom: 10 },
  tabIndicator: { height: 2.5, width: "70%", borderRadius: 2 },

  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 42,
    paddingHorizontal: 2,
  },
  monthArrow: { width: 36, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  monthText: { fontSize: 14, minWidth: 70, textAlign: "center", fontVariant: ["tabular-nums"] },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    height: 22,
    borderRadius: 11,
  },
  chipText: { fontSize: 12, fontVariant: ["tabular-nums"] },

  // The Card shell already pads ~16dp; these top it up, never double it.
  hero: { padding: 4, gap: 16 },
  heroIdentity: { flexDirection: "row", alignItems: "center", gap: 14 },
  heroTitles: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", minWidth: 0, gap: 2 },
  heroTitle: { fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  heroCaption: { fontSize: 13, lineHeight: 18 },
  heroFigure: { gap: 8 },
  heroCompare: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },

  surface: { padding: 2, gap: 14 },
  surfaceHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 28 },
  surfaceTitle: { fontSize: 16, letterSpacing: -0.2 },
  surfaceMeta: { fontSize: 12.5 },

  breakdown: { alignItems: "center", gap: 12 },
  legend: { alignSelf: "stretch" },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 40,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    borderRadius: 10,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendName: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", fontSize: 14 },
  legendPct: { fontSize: 12.5, minWidth: 36, textAlign: "right", fontVariant: ["tabular-nums"] },
  legendAmount: { fontSize: 14, minWidth: 72, textAlign: "right", fontVariant: ["tabular-nums"] },

  shareRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, minHeight: 64 },
  shareBody: { flex: 1, minWidth: 0, gap: 8 },
  shareTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  shareLabel: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", fontSize: 14.5 },
  shareBottom: { flexDirection: "row", alignItems: "center", gap: 10 },
  shareBar: { flex: 1 },
  sharePct: { fontSize: 12, minWidth: 30, textAlign: "right", fontVariant: ["tabular-nums"] },

  statOuter: { flexGrow: 1, flexBasis: 150 },
  stat: { padding: 0, gap: 10 },
  statHead: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", gap: 8 },
  statGlyph: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  statLabel: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", fontSize: 13 },
  statFootRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  statFoot: { fontSize: 12, flexShrink: 1 },

  callout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
  },
  calloutBody: { flex: 1, minWidth: 0, gap: 2 },
  calloutTitle: { fontSize: 14.5 },
  calloutText: { fontSize: 12.5, lineHeight: 17 },

  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12 },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 17 },
});
