import { memo, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Eye, EyeOff, Info, Minus } from "lucide-react-native";

import { SpendingCurveChart } from "@/components/charts/SpendingCurveChart";
import { Amount } from "@/components/common/Amount";
import { NetWorthCardBackdrop } from "@/components/dashboard/NetWorthCardBackdrop";
import { RangeSegmentedControl } from "@/components/dashboard/RangeSegmentedControl";
import type { UnifiedNetWorthSummary } from "@/hooks/useUnifiedNetWorth";
import { NET_WORTH_CARD_WASH_ALPHA } from "@/theme/netWorthScene";
import { haptic } from "@/lib/haptics";
import { useSettings } from "@/providers/SettingsProvider";
import { compactAmount } from "@/shared/utils/compactAmount";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { signedCurrencyPrefix } from "@/shared/utils/formatCurrency";
import {
  MIN_POINTS_FOR_TREND,
  NET_WORTH_PERIODS,
  netWorthRecorderMessage,
  netWorthTrend,
  type NetWorthPeriod,
  type NetWorthRecorderStatus,
  type NetWorthPoint,
  type NetWorthTrend,
} from "@/shared/utils/netWorthHistory";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces, withAlpha } from "@/theme/surfaces";

const PERIOD_LABELS: Record<NetWorthPeriod, string> = {
  "1W": "Past week",
  "1M": "Past month",
  "3M": "3 months",
  "6M": "6 months",
  "1Y": "1 year",
};

const PERIOD_WORDS: Record<NetWorthPeriod, string> = {
  "1W": "over the past week",
  "1M": "over the past month",
  "3M": "over 3 months",
  "6M": "over 6 months",
  "1Y": "over the year",
};

/** "over the past month", or "since 12 Oct" when history starts inside the period. */
export function trendWhen(
  trend: Pick<NetWorthTrend, "coversFullPeriod" | "baseline">,
  period: NetWorthPeriod,
  dateFormat: Parameters<typeof formatDisplayDate>[1]
): string {
  return trend.coversFullPeriod || !trend.baseline
    ? PERIOD_WORDS[period]
    : `since ${formatDisplayDate(trend.baseline.date, dateFormat)}`;
}

/**
 * SPENDLY-572 — the Visual First net-worth card: an emerald glass surface
 * (gradient, lit edge and soft glow — no blur layer), net worth in whole
 * rupees, the change for the chosen period, the trend line and an
 * Assets | Liabilities | Gain/Loss footer.
 *
 * Figures: the totals are fields of the one `useUnifiedNetWorth` summary; the
 * change, line and Gain/Loss come only from stored snapshots
 * (`netWorthTrend`, SPENDLY-568). Rounding to whole rupees and the compact
 * footer are display only. Ghost mode hides every amount and percentage.
 *
 * SPENDLY-718: the `desktop` variant is the wide dashboard's hero. The period
 * is a segmented control, the chart grows to fill the card, and the
 * Assets | Liabilities footer moves out to their own cards beside it, which
 * share this card's period through `period` / `onPeriodChange`.
 */
export const NetWorthGlassCard = memo(function NetWorthGlassCard({
  netWorth,
  currency,
  points,
  todayKey,
  historyLoading,
  historyFailed,
  recorder,
  variant = "stack",
  period: controlledPeriod,
  onPeriodChange,
  style,
}: {
  netWorth: UnifiedNetWorthSummary;
  currency: string;
  points: NetWorthPoint[];
  todayKey: string;
  historyLoading: boolean;
  historyFailed: boolean;
  /** SPENDLY-620: whether today's point is saved, and why not. */
  recorder: NetWorthRecorderStatus;
  variant?: "stack" | "desktop";
  /** Controlled period (SPENDLY-718); uncontrolled when omitted. */
  period?: NetWorthPeriod;
  onPeriodChange?: (period: NetWorthPeriod) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings, setGhostMode } = useSettings();
  const ghost = Boolean(settings.ghostMode);
  const [ownPeriod, setOwnPeriod] = useState<NetWorthPeriod>("1M");
  const period = controlledPeriod ?? ownPeriod;
  const setPeriod = onPeriodChange ?? setOwnPeriod;
  const desktop = variant === "desktop";
  const [footerNarrow, setFooterNarrow] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  const trend = useMemo(() => netWorthTrend(points, period, todayKey), [points, period, todayKey]);
  const chartPoints = useMemo(
    () => trend.series.map((p) => ({ date: formatDisplayDate(p.date, settings.dateFormat), amount: p.netWorth })),
    [trend.series, settings.dateFormat]
  );
  const enoughHistory = !historyFailed && points.length >= MIN_POINTS_FOR_TREND;

  const negative = netWorth.totalNetWorth < 0;
  const change = enoughHistory ? trend.change : null;
  const direction = change === null || change === 0 ? "flat" : change > 0 ? "up" : "down";
  const tone =
    direction === "up" ? theme.colors.success : direction === "down" ? theme.colors.destructive : theme.colors.mutedForeground;
  const Arrow = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const pct = enoughHistory ? trend.changePct : null;
  const when = trendWhen(trend, period, settings.dateFormat);

  // SPENDLY: the mountain-sunrise scene sits behind a theme-derived wash
  // (never a hardcoded accent). On a light palette the wash stays thin so the
  // scene reads vividly (the reference's look — dark text over a pale sky is
  // legible on its own); on a dark palette it stays strong, since the scene
  // itself is kept faint there to protect light-coloured text
  // (`theme/netWorthScene.ts`). Either way it fades in toward the bottom,
  // where the chart's axis and the card's edge sit.
  const surfaceTop = withAlpha(
    theme.colors.card,
    surfaces.isDark ? NET_WORTH_CARD_WASH_ALPHA.dark : NET_WORTH_CARD_WASH_ALPHA.light
  );
  const surfaceBottom = withAlpha(theme.colors.background, surfaces.isDark ? 0.72 : 0.5);

  return (
    <View
      style={[
        styles.shell,
        {
          borderColor: withAlpha(theme.colors.primary, 0.38),
          boxShadow: `0 12px 32px ${withAlpha(theme.colors.primary, 0.14)}`,
        },
        style,
      ]}
      testID="dashboard-net-worth"
    >
      <NetWorthCardBackdrop height={desktop ? 220 : 160} />
      <LinearGradient colors={[surfaceTop, surfaceBottom]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* Lit top edge. */}
      <LinearGradient
        colors={[withAlpha("#FFFFFF", 0.07), withAlpha("#FFFFFF", 0)]}
        style={styles.sheen}
        pointerEvents="none"
      />

      <View style={[styles.body, desktop && styles.bodyDesktop]}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
              Net Worth
            </Text>
            <Pressable
              onPress={() => {
                void haptic.selection();
                setGhostMode(!ghost);
              }}
              hitSlop={10}
              accessibilityRole="switch"
              accessibilityState={{ checked: ghost }}
              accessibilityLabel={ghost ? "Show amounts" : "Hide amounts"}
              style={({ pressed }) => [styles.iconHit, pressed && styles.pressed]}
            >
              {ghost ? (
                <EyeOff size={18} color={theme.colors.primary} strokeWidth={2.1} />
              ) : (
                <Eye size={18} color={theme.colors.foreground} strokeWidth={2.1} />
              )}
            </Pressable>
            {netWorth.liquidBalanceMayBePartial ? (
              <Pressable
                onPress={() => setNoteOpen((v) => !v)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Why this figure may be partial"
                style={({ pressed }) => [styles.iconHit, pressed && styles.pressed]}
              >
                <Info size={16} color={theme.colors.warning} strokeWidth={2.2} />
              </Pressable>
            ) : null}
          </View>

          {desktop ? (
            <RangeSegmentedControl
              periods={NET_WORTH_PERIODS}
              value={period}
              onChange={setPeriod}
              labels={PERIOD_LABELS}
              accessibilityLabel="Trend period"
              testIDPrefix="net-worth-period"
            />
          ) : (
            <View>
              <Pressable
                onPress={() => {
                  void haptic.selection();
                  setMenuOpen((v) => !v);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Trend period, ${PERIOD_LABELS[period]}. Change`}
                style={({ pressed }) => [
                  styles.periodChip,
                  {
                    backgroundColor: surfaces.isDark ? withAlpha("#000000", 0.22) : withAlpha(theme.colors.foreground, 0.06),
                    borderColor: withAlpha(theme.colors.foreground, 0.12),
                  },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.periodText, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}>
                  {PERIOD_LABELS[period]}
                </Text>
                <ChevronDown size={14} color={theme.colors.mutedForeground} strokeWidth={2.2} />
              </Pressable>
              {menuOpen ? (
                <View
                  style={[styles.menu, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
                  accessibilityRole="menu"
                >
                  {NET_WORTH_PERIODS.map((p) => (
                    <Pressable
                      key={p}
                      onPress={() => {
                        void haptic.selection();
                        setPeriod(p);
                        setMenuOpen(false);
                      }}
                      accessibilityRole="menuitem"
                      accessibilityState={{ selected: p === period }}
                      style={({ pressed }) => [
                        styles.menuItem,
                        p === period && { backgroundColor: surfaces.wash(theme.colors.primary) },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={{
                          color: p === period ? theme.colors.primary : theme.colors.foreground,
                          fontFamily: theme.fontFamily.medium,
                          fontSize: 13.5,
                        }}
                      >
                        {PERIOD_LABELS[p]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          )}
        </View>

        {noteOpen ? (
          <Text style={[styles.note, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            Based on recent activity — set an opening balance date on long-running accounts for full accuracy.
          </Text>
        ) : null}

        <Amount
          value={Math.round(Math.abs(netWorth.totalNetWorth))}
          currency={currency}
          prefix={negative ? signedCurrencyPrefix("-", currency) : undefined}
          fractionDigits={0}
          ghostable
          animated
          startFromZero={false}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          style={{
            fontSize: desktop ? 44 : 40,
            lineHeight: desktop ? 52 : 48,
            letterSpacing: -1.2,
            fontFamily: theme.fontFamily.bold,
            color: negative ? theme.colors.destructive : theme.colors.foreground,
            fontVariant: ["tabular-nums"],
          }}
        />

        {change !== null ? (
          <View style={styles.changeRow} accessibilityLabel={`${direction === "flat" ? "No change" : direction === "up" ? "Up" : "Down"} ${when}`}>
            <Arrow size={18} color={tone} strokeWidth={2.6} />
            {change !== 0 ? (
              <Amount
                value={Math.round(Math.abs(change))}
                currency={currency}
                prefix={signedCurrencyPrefix(change > 0 ? "+" : "-", currency)}
                fractionDigits={0}
                ghostable
                numberOfLines={1}
                style={{ fontSize: 17, fontFamily: theme.fontFamily.semibold, color: tone, fontVariant: ["tabular-nums"] }}
              />
            ) : (
              <Text style={[styles.changeText, { color: tone, fontFamily: theme.fontFamily.semibold }]}>No change</Text>
            )}
            {pct !== null && !ghost && change !== 0 ? (
              <Text style={[styles.changeText, { color: tone, fontFamily: theme.fontFamily.semibold }]}>
                ({pct >= 0 ? "+" : ""}
                {pct.toFixed(1)}%)
              </Text>
            ) : null}
            <Text style={[styles.when, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]} numberOfLines={1}>
              {when}
            </Text>
          </View>
        ) : null}

        <View style={[styles.chartSlot, desktop && styles.chartSlotDesktop]}>
          {historyLoading ? null : enoughHistory && chartPoints.length >= 2 ? (
            <SpendingCurveChart
              points={chartPoints}
              height={desktop ? 168 : 112}
              currency={currency}
              lineColor={theme.colors.primary}
              autoDomain
              tightDomain
              dots="ends"
              showXAxis={false}
            />
          ) : (
            <Text
              style={[styles.note, desktop && styles.noteDesktop, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
              testID="net-worth-trend-empty"
            >
              {historyFailed
                ? "Couldn't load your net-worth history."
                : points.length < MIN_POINTS_FOR_TREND
                  ? `Trend appears after ${MIN_POINTS_FOR_TREND} saved days (${points.length} so far).`
                  : "Not enough history in this period yet."}
            </Text>
          )}
        </View>

        {historyLoading || historyFailed ? null : (
          <Text
            style={[
              styles.status,
              {
                color: recorder.state === "blocked" || recorder.state === "failed" ? theme.colors.warning : theme.colors.mutedForeground,
                fontFamily: theme.fontFamily.regular,
              },
            ]}
            testID="net-worth-recorder-status"
          >
            {netWorthRecorderMessage(recorder)}
          </Text>
        )}

        {desktop ? null : (
          <View
            style={[styles.footer, { borderTopColor: withAlpha(theme.colors.foreground, 0.1) }]}
            onLayout={(e) => {
              const next = e.nativeEvent.layout.width < FOOTER_NARROW_BELOW;
              if (next !== footerNarrow) setFooterNarrow(next);
            }}
          >
            <FooterFigure label="Assets" ghost={ghost} narrow={footerNarrow} value={compactAmount(netWorth.totalAssets, currency)} />
            <View style={[styles.footerDivider, footerNarrow && styles.footerDividerNarrow, { backgroundColor: withAlpha(theme.colors.foreground, 0.12) }]} />
            <FooterFigure label="Liabilities" ghost={ghost} narrow={footerNarrow} value={compactAmount(netWorth.totalLiabilities, currency)} />
            <View style={[styles.footerDivider, footerNarrow && styles.footerDividerNarrow, { backgroundColor: withAlpha(theme.colors.foreground, 0.12) }]} />
            <FooterFigure
              label="Gain/Loss"
              ghost={ghost}
              narrow={footerNarrow}
              value={pct === null ? "—" : `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct).toFixed(1)}%`}
              color={pct === null ? theme.colors.mutedForeground : pct >= 0 ? theme.colors.success : theme.colors.destructive}
            />
          </View>
        )}
      </View>
    </View>
  );
});

function FooterFigure({ label, value, ghost, color, narrow = false }: { label: string; value: string; ghost: boolean; color?: string; narrow?: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={styles.figure}>
      <Text style={[styles.figureLabel, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>{label}</Text>
      <Text
        style={[styles.figureValue, narrow && styles.figureValueNarrow, { color: color ?? theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        accessibilityLabel={ghost ? `${label} hidden` : `${label} ${value}`}
      >
        {ghost ? "••••" : value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  sheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 72,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 4,
  },
  bodyDesktop: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 5,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 17,
  },
  iconHit: {
    padding: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  periodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    minHeight: 34,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  periodText: {
    fontSize: 13,
  },
  menu: {
    position: "absolute",
    top: 40,
    right: 0,
    minWidth: 140,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    zIndex: 10,
    elevation: 6,
  },
  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  note: {
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 2,
  },
  status: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: 5,
    rowGap: 2,
  },
  changeText: {
    fontSize: 17,
  },
  when: {
    fontSize: 13,
    flexShrink: 1,
  },
  chartSlot: {
    minHeight: 40,
    marginHorizontal: -10,
    marginTop: 2,
  },
  chartSlotDesktop: {
    flex: 1,
    justifyContent: "center",
    marginTop: 8,
  },
  noteDesktop: {
    textAlign: "center",
    fontSize: 13.5,
    paddingHorizontal: 24,
  },
  footer: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 12,
  },
  figure: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  figureLabel: {
    fontSize: 13,
  },
  figureValue: {
    fontSize: 18,
    letterSpacing: -0.3,
    fontVariant: ["tabular-nums"],
  },
  // A footer under FOOTER_NARROW_BELOW: on web adjustsFontSizeToFit does
  // nothing, so "₹59,905" was cut to "₹59,9…" in a ~75px column.
  figureValueNarrow: {
    fontSize: 15,
  },
  footerDividerNarrow: {
    marginHorizontal: 8,
  },
});

/** Footer width (px) below which its three figures use the smaller size. */
const FOOTER_NARROW_BELOW = 300;
