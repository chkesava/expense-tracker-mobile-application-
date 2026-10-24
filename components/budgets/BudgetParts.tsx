import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { AlertCircle, ChevronRight } from "lucide-react-native";

import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator, type ProgressStatus } from "@/components/dashboard/ProgressIndicator";
import { useSurfaces, withAlpha } from "@/components/dashboard/primitives";
import { CategoryIcon } from "@/components/spending/SpendingParts";
import { Card } from "@/components/ui/Card";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { haptic } from "@/lib/haptics";
import {
  BUDGET_STATUS_LABELS,
  budgetLabel,
  budgetStatusOf,
  budgetUsedPct,
  type BudgetStatus,
} from "@/shared/utils/budgetDrilldown";
import type { CategoryBudgetAlertItem } from "@/shared/utils/dashboardWidgets";
import { useTheme } from "@/theme/ThemeProvider";

/*
 * SPENDLY-575 — Budget Progress building blocks, in the SPENDLY-574 drill-down
 * style (outlined cards, line icons, tabular figures). Status always has a
 * word next to its colour.
 */

type Colors = ReturnType<typeof useTheme>["theme"]["colors"];

export function budgetStatusColor(status: BudgetStatus, colors: Colors): string {
  if (status === "over") return colors.destructive;
  if (status === "atRisk") return colors.warning;
  return colors.success;
}

export function budgetProgressStatus(status: BudgetStatus): ProgressStatus {
  if (status === "over") return "over";
  if (status === "atRisk") return "watch";
  return "good";
}

/* ---------------------------------------------------------------- ProgressRing */

/** A thin ring with the percentage in the middle; over 100% the ring stays full. */
export function ProgressRing({ pct, color, size = 92, stroke = 9 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = Math.max(0, Math.min(100, pct));
  return (
    <View style={{ width: size, height: size }} accessible accessibilityLabel={`${Math.round(pct)}% used`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={surfaces.control} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(shown / 100) * circumference} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
        <Text style={[styles.ringPct, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}>
          {`${Math.round(pct)}%`}
        </Text>
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- StatusPill */

export function BudgetStatusPill({ status }: { status: BudgetStatus }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const color = budgetStatusColor(status, theme.colors);
  return (
    <View style={[styles.pill, { backgroundColor: surfaces.wash(color) }]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color, fontFamily: theme.fontFamily.semibold }]}>{BUDGET_STATUS_LABELS[status]}</Text>
    </View>
  );
}

/* ----------------------------------------------------------- OverallBudgetCard */

/** Ring, spent of budget, remaining (or over by) and the days left in the month. */
export function OverallBudgetCard({
  title,
  spent,
  budgeted,
  usedPct,
  color,
  currency,
  daysLeft,
  caption,
}: {
  title: string;
  spent: number;
  budgeted: number;
  usedPct: number;
  color: string;
  currency: string;
  /** Shown only for the current month. */
  daysLeft?: number | null;
  caption?: string;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const money = useGhostMoney(currency);
  const remaining = budgeted - spent;
  const over = remaining < 0;
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular };
  return (
    <Card variant="outlined" elevation={0} radius={22} style={styles.cardEdge} contentStyle={styles.overall} testID="budget-overall">
      <View style={styles.overallHead}>
        <Text style={[styles.cardTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>{title}</Text>
        {caption ? <Text style={[styles.cardMeta, muted]}>{caption}</Text> : null}
      </View>
      <View style={styles.overallBody}>
        <ProgressRing pct={usedPct} color={color} />
        <View style={styles.overallFigures}>
          <FinancialAmount value={spent} currency={currency} size="xl" weight="bold" fit />
          <Text style={[styles.cardMeta, muted]}>{`of ${money(budgeted)} used`}</Text>
          <View style={[styles.remaining, { backgroundColor: surfaces.wash(over ? theme.colors.destructive : theme.colors.success) }]}>
            <Text
              style={[
                styles.remainingText,
                { color: over ? theme.colors.destructive : theme.colors.success, fontFamily: theme.fontFamily.semibold },
              ]}
            >
              {over ? `${money(-remaining)} over` : `${money(remaining)} left`}
            </Text>
          </View>
          {daysLeft != null ? (
            <Text style={[styles.cardMeta, muted]}>{daysLeft === 1 ? "1 day left this month" : `${daysLeft} days left this month`}</Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

/* -------------------------------------------------------------- StatusCounts */

export function BudgetStatusCounts({ counts }: { counts: { onTrack: number; atRisk: number; over: number; total: number } }) {
  const { theme } = useTheme();
  const cells: Array<{ key: string; label: string; value: number; color: string }> = [
    { key: "onTrack", label: "On track", value: counts.onTrack, color: theme.colors.success },
    { key: "atRisk", label: "Close to limit", value: counts.atRisk, color: theme.colors.warning },
    { key: "over", label: "Over limit", value: counts.over, color: theme.colors.destructive },
    { key: "total", label: "Budgets", value: counts.total, color: theme.colors.primary },
  ];
  return (
    <Card variant="outlined" elevation={0} radius={18} style={styles.cardEdge} contentStyle={styles.counts}>
      {cells.map((cell, i) => (
        <View
          key={cell.key}
          style={[styles.countCell, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.colors.border }]}
          accessible
          accessibilityLabel={`${cell.value} ${cell.label}`}
        >
          <View style={styles.countTop}>
            <View style={[styles.pillDot, { backgroundColor: cell.color }]} />
            <Text style={[styles.countValue, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}>{cell.value}</Text>
          </View>
          <Text style={[styles.countLabel, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]} numberOfLines={1}>
            {cell.label}
          </Text>
        </View>
      ))}
    </Card>
  );
}

/* ----------------------------------------------------------------- BudgetRow */

/** One budget: icon, name, spent of limit, % used and a status-coloured bar. */
export function BudgetRow({
  item,
  currency,
  onPress,
  divider,
}: {
  item: CategoryBudgetAlertItem;
  currency: string;
  onPress: () => void;
  divider?: boolean;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const money = useGhostMoney(currency);
  const status = budgetStatusOf(item);
  const color = budgetStatusColor(status, theme.colors);
  const used = budgetUsedPct(item);
  const label = budgetLabel(item);
  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      android_ripple={{ color: surfaces.control, borderless: false }}
      style={({ pressed }) => [
        styles.row,
        divider ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border } : null,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${money(item.spent)} of ${money(item.amount)}, ${Math.round(used)}% used, ${BUDGET_STATUS_LABELS[status]}. Open budget`}
    >
      <CategoryIcon category={item.category} color={theme.colors.primary} size={40} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowLabel, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[styles.rowPct, { color: status === "onTrack" ? theme.colors.foreground : color, fontFamily: theme.fontFamily.semibold }]}>
            {`${Math.round(used)}%`}
          </Text>
        </View>
        <ProgressIndicator pct={Math.min(100, used)} status={budgetProgressStatus(status)} height={6} />
        <View style={styles.rowTop}>
          <Text style={[styles.rowMeta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]} numberOfLines={1}>
            {`${money(item.spent)} of ${money(item.amount)}`}
          </Text>
          <Text style={[styles.rowMeta, { color, fontFamily: theme.fontFamily.medium }]}>{BUDGET_STATUS_LABELS[status]}</Text>
        </View>
      </View>
      <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />
    </Pressable>
  );
}

/* ------------------------------------------------------------- BudgetUsageCard */

/** One budget's usage: bar, spent / limit / % used, and its status. */
export function BudgetUsageCard({ spent, amount, status, currency }: { spent: number; amount: number; status: BudgetStatus; currency: string }) {
  const { theme } = useTheme();
  const used = amount > 0 ? (spent / amount) * 100 : 0;
  const color = budgetStatusColor(status, theme.colors);
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular };
  return (
    <Card variant="outlined" elevation={0} radius={18} style={styles.cardEdge} contentStyle={styles.usage} testID="budget-usage">
      <View style={styles.overallHead}>
        <Text style={[styles.cardTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>Budget usage</Text>
        <BudgetStatusPill status={status} />
      </View>
      <ProgressIndicator pct={Math.min(100, used)} status={budgetProgressStatus(status)} height={10} />
      <View style={styles.usageFigures}>
        <View style={styles.usageCell}>
          <FinancialAmount value={spent} currency={currency} size="lg" weight="bold" />
          <Text style={[styles.cardMeta, muted]}>Spent</Text>
        </View>
        <View style={styles.usageCell}>
          <FinancialAmount value={amount} currency={currency} size="lg" weight="bold" />
          <Text style={[styles.cardMeta, muted]}>Budget</Text>
        </View>
        <View style={[styles.usageCell, styles.usageEnd]}>
          <Text style={[styles.usagePct, { color: status === "onTrack" ? theme.colors.foreground : color, fontFamily: theme.fontFamily.bold }]}>
            {`${Math.round(used)}%`}
          </Text>
          <Text style={[styles.cardMeta, muted]}>used</Text>
        </View>
      </View>
    </Card>
  );
}

/* ------------------------------------------------------------ OverBudgetAlert */

/** The over-limit explanation, with a route to the transactions behind it. */
export function OverBudgetAlert({ overBy, currency, onPress }: { overBy: number; currency: string; onPress: () => void }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const money = useGhostMoney(currency);
  const color = theme.colors.destructive;
  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.alert,
        { backgroundColor: withAlpha(color, surfaces.isDark ? 0.12 : 0.06), borderColor: withAlpha(color, surfaces.isDark ? 0.35 : 0.2) },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Over budget by ${money(overBy)}. See the transactions`}
    >
      <AlertCircle size={20} color={color} strokeWidth={2.2} />
      <View style={styles.alertBody}>
        <Text style={[styles.alertTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
          {`You've gone ${money(overBy)} over this budget`}
        </Text>
        <Text style={[styles.cardMeta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
          See the transactions that make up this month's total.
        </Text>
      </View>
      <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8 },
  cardEdge: { borderWidth: StyleSheet.hairlineWidth },
  cardTitle: { fontSize: 16, letterSpacing: -0.2 },
  cardMeta: { fontSize: 12.5, lineHeight: 17 },

  ringCenter: { alignItems: "center", justifyContent: "center" },
  ringPct: { fontSize: 20, fontVariant: ["tabular-nums"] },

  pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, height: 24, borderRadius: 12 },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 12 },

  // The Card shell pads ~16dp already; these only top it up.
  overall: { padding: 4, gap: 14 },
  overallHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  overallBody: { flexDirection: "row", alignItems: "center", gap: 18 },
  overallFigures: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", gap: 4, alignItems: "flex-start" },
  remaining: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 4 },
  remainingText: { fontSize: 13, fontVariant: ["tabular-nums"] },

  counts: { padding: 0, flexDirection: "row" },
  countCell: { flex: 1, paddingHorizontal: 8, gap: 2 },
  countTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  countValue: { fontSize: 20, fontVariant: ["tabular-nums"] },
  countLabel: { fontSize: 11.5 },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  rowBody: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", gap: 6 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  rowLabel: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", fontSize: 14.5 },
  rowPct: { fontSize: 14, fontVariant: ["tabular-nums"] },
  rowMeta: { fontSize: 12, fontVariant: ["tabular-nums"] },

  usage: { padding: 2, gap: 14 },
  usageFigures: { flexDirection: "row", gap: 8 },
  usageCell: { flex: 1, gap: 2 },
  usageEnd: { alignItems: "flex-end" },
  usagePct: { fontSize: 20, lineHeight: 26, fontVariant: ["tabular-nums"] },

  alert: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  alertBody: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", gap: 2 },
  alertTitle: { fontSize: 14.5 },
});
