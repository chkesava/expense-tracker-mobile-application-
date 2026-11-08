import { memo, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  Briefcase,
  ChevronRight,
  CreditCard,
  HandCoins,
  Landmark,
  LineChart,
  PiggyBank,
  Scale,
  Wallet,
  Users,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Skeleton } from "@/components/common/Skeleton";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { NetWorthGlassCard, trendWhen } from "@/components/dashboard/NetWorthGlassCard";
import { NetWorthTotalCard } from "@/components/dashboard/NetWorthTotalCard";
import {
  DASH_RADIUS,
  DASH_TYPE,
  HeroSection,
  MetaLabel,
  SectionAction,
  useHeroInk,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { useInvestmentsEnabled } from "@/hooks/useInvestmentsEnabled";
import { useNetWorthHistory } from "@/hooks/useNetWorthHistory";
import { useNetWorthSnapshotRecorder } from "@/hooks/useNetWorthSnapshotRecorder";
import type { UnifiedNetWorthSummary } from "@/hooks/useUnifiedNetWorth";
import { haptic } from "@/lib/haptics";
import {
  dashboardAccountCards,
  type DashboardAccountCard,
  type DashboardAccountCardKey,
} from "@/shared/utils/dashboardAccountCards";
import { useSettings } from "@/providers/SettingsProvider";
import { todayDateKey } from "@/shared/utils/dates";
import { totalChange } from "@/shared/utils/dashboardDesktop";
import { MIN_POINTS_FOR_TREND, netWorthTrend, type NetWorthPeriod } from "@/shared/utils/netWorthHistory";
import { signedCurrencyPrefix } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";

export interface NetWorthWidgetProps {
  /** The screen's one `useUnifiedNetWorth` summary (SPENDLY-566). */
  netWorth: UnifiedNetWorthSummary;
  currency: string;
}

export interface NetWorthWidgetDesktopProps {
  /**
   * SPENDLY-718: `desktop` lays the hero beside Total Assets / Total
   * Liabilities, with `aside` (the quick actions) under them.
   */
  variant?: "stack" | "desktop";
  aside?: ReactNode;
  /** Card gap for the desktop composition. */
  gap?: number;
}

/**
 * The dashboard's net-worth card (SPENDLY-532, Visual First since
 * SPENDLY-566): net worth with the privacy switch beside it, then assets and
 * liabilities. Every figure is a field of the one `useUnifiedNetWorth` summary
 * — nothing here adds, nets or projects values. The trend and change come
 * from the daily points recorded below (SPENDLY-568), and the card says
 * whether today's point is saved (SPENDLY-620).
 */
export const NetWorthWidget = memo(function NetWorthWidget({
  netWorth,
  currency,
  variant = "stack",
  aside,
  gap = 16,
}: NetWorthWidgetProps & NetWorthWidgetDesktopProps) {
  const { settings } = useSettings();
  const todayKey = todayDateKey(settings.timezone);
  // SPENDLY-568: history is read only here, where the trend renders, and
  // today's point is recorded from this same summary once it is complete.
  const history = useNetWorthHistory(todayKey);
  const recorder = useNetWorthSnapshotRecorder({ summary: netWorth, todayKey, history });

  if (variant === "desktop") {
    return (
      <DesktopNetWorth
        netWorth={netWorth}
        currency={currency}
        history={history}
        recorder={recorder}
        todayKey={todayKey}
        aside={aside}
        gap={gap}
      />
    );
  }

  // First load: a placeholder shaped like the card, so nothing jumps when the
  // totals land (SPENDLY-533).
  if (netWorth.loading) {
    return <DashboardSkeleton variant="hero" />;
  }

  // SPENDLY-572: the dashboard's own glass card; the Money hub keeps
  // `NetWorthHeroCard`.
  return (
    <NetWorthGlassCard
      netWorth={netWorth}
      currency={currency}
      points={history.points}
      todayKey={todayKey}
      historyLoading={history.loading}
      historyFailed={Boolean(history.error)}
      recorder={recorder}
    />
  );
});

/**
 * SPENDLY-718 — the desktop first row: the net-worth hero (left) beside
 * Total Assets | Total Liabilities with `aside` under them (right). One
 * period drives the hero's line and both totals' change. Same summary, same
 * history listener and recorder as the stacked card; nothing new is read.
 */
function DesktopNetWorth({
  netWorth,
  currency,
  history,
  recorder,
  todayKey,
  aside,
  gap,
}: {
  netWorth: UnifiedNetWorthSummary;
  currency: string;
  history: ReturnType<typeof useNetWorthHistory>;
  recorder: ReturnType<typeof useNetWorthSnapshotRecorder>;
  todayKey: string;
  aside: ReactNode;
  gap: number;
}) {
  const router = useRouter();
  const { settings } = useSettings();
  const [period, setPeriod] = useState<NetWorthPeriod>("1M");
  const trend = useMemo(() => netWorthTrend(history.points, period, todayKey), [history.points, period, todayKey]);
  // Same rule as the hero (NetWorthGlassCard): no change until enough saved
  // days, so the totals and the hero never disagree about the period.
  const usable = !history.error && !history.loading && history.points.length >= MIN_POINTS_FOR_TREND;
  const assetsChange = usable ? totalChange(trend.baseline, trend.latest, "assets") : NO_CHANGE;
  const liabilitiesChange = usable ? totalChange(trend.baseline, trend.latest, "liabilities") : NO_CHANGE;
  const when = trendWhen(trend, period, settings.dateFormat);
  const openAccounts = () => router.push("/ledger?tab=accounts" as Href);

  return (
    <View style={[desktopStyles.row, { gap }]}>
      <View style={desktopStyles.hero} testID="dash-networth">
        {netWorth.loading ? (
          <DashboardSkeleton variant="hero" />
        ) : (
          <NetWorthGlassCard
            variant="desktop"
            period={period}
            onPeriodChange={setPeriod}
            netWorth={netWorth}
            currency={currency}
            points={history.points}
            todayKey={todayKey}
            historyLoading={history.loading}
            historyFailed={Boolean(history.error)}
            recorder={recorder}
            style={desktopStyles.fill}
          />
        )}
      </View>
      <View style={[desktopStyles.side, { gap }]}>
        <View style={[desktopStyles.totals, { gap }]}>
          <NetWorthTotalCard
            kind="assets"
            value={netWorth.totalAssets}
            currency={currency}
            change={assetsChange}
            when={when}
            loading={netWorth.loading}
            onPress={openAccounts}
          />
          <NetWorthTotalCard
            kind="liabilities"
            value={netWorth.totalLiabilities}
            currency={currency}
            change={liabilitiesChange}
            when={when}
            loading={netWorth.loading}
            onPress={openAccounts}
          />
        </View>
        {aside}
      </View>
    </View>
  );
}

const NO_CHANGE = { change: null, changePct: null } as const;

const desktopStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  hero: {
    flex: 56,
    minWidth: 0,
  },
  side: {
    flex: 44,
    minWidth: 0,
  },
  totals: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  fill: {
    flex: 1,
  },
});

/**
 * One card per kind of money the user holds (SPENDLY-532). It sat under the
 * net-worth card; the Visual First layout (SPENDLY-566) shows it with the
 * dashboard's "More" cards, from the same summary.
 */
export const AccountSummaryWidget = memo(function AccountSummaryWidget({
  netWorth,
  currency,
}: NetWorthWidgetProps) {
  if (netWorth.loading) return <DashboardSkeleton variant="cards" />;
  return <AccountSummaryCards netWorth={netWorth} currency={currency} />;
});

/* ------------------------------------------------------------- Hero card */

/**
 * The net-worth hero, presentational. Exported (SPENDLY-535) so the Money
 * hub's Accounts section shows the same card from the same summary; it passes
 * `showAccountsLink={false}` because it already is that screen.
 */
export function NetWorthHeroCard({
  netWorth,
  currency,
  showAccountsLink = true,
  action,
  trend,
}: {
  netWorth: UnifiedNetWorthSummary;
  currency: string;
  showAccountsLink?: boolean;
  /** Replaces the Accounts link, e.g. the dashboard's privacy switch. */
  action?: ReactNode;
  /** Drawn under the figure, e.g. the dashboard's trend (SPENDLY-568). */
  trend?: ReactNode;
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const ink = useHeroInk("deep");
  const surfaces = useSurfaces();
  const negative = netWorth.totalNetWorth < 0;

  return (
    <HeroSection
      variant="deep"
      testID="dashboard-net-worth"
      title="Net worth"
      subtitle={netWorth.secondaryLoading ? "Updating valuations…" : "Assets minus liabilities"}
      icon={<Scale size={16} color={theme.colors.primary} strokeWidth={2.3} />}
      action={
        action ?? (showAccountsLink ? (
          <SectionAction
            label="Accounts"
            onPress={() => router.push("/ledger?tab=accounts" as Href)}
            accessibilityLabel="Open accounts"
          />
        ) : undefined)
      }
    >
      {netWorth.loading ? (
        <View style={styles.heroValueSlot}>
          <Skeleton width={190} height={DASH_TYPE.heroValueLine} borderRadius={10} />
        </View>
      ) : (
        <View style={styles.heroValueSlot}>
          <Amount
            value={Math.abs(netWorth.totalNetWorth)}
            currency={currency}
            prefix={negative ? signedCurrencyPrefix("-", currency) : undefined}
            ghostable
            // Counts only from the previous value, so it moves when the
            // figure changes and stays put on first paint.
            animated
            startFromZero={false}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={{
              fontSize: DASH_TYPE.heroValue,
              lineHeight: DASH_TYPE.heroValueLine,
              letterSpacing: -1,
              fontFamily: theme.fontFamily.bold,
              color: negative ? theme.colors.destructive : ink,
            }}
          />
          {negative ? (
            <Text
              style={[styles.heroNote, { color: theme.colors.destructive, fontFamily: theme.fontFamily.medium }]}
            >
              You owe more than you hold
            </Text>
          ) : null}
        </View>
      )}

      {!netWorth.loading && netWorth.liquidBalanceMayBePartial ? (
        <MetaLabel style={styles.partialNote} numberOfLines={3}>
          Based on recent activity — set an opening balance date on
          long-running accounts for full accuracy.
        </MetaLabel>
      ) : null}

      {trend}

      <View style={[styles.splitRow, { borderTopColor: surfaces.divider }]}>
        <HeroFigure
          label="Assets"
          value={netWorth.totalAssets}
          currency={currency}
          loading={netWorth.loading}
          icon={<ArrowUpRight size={13} color={theme.colors.success} strokeWidth={2.6} />}
          tint={surfaces.wash(theme.colors.success)}
        />
        <View style={[styles.splitDivider, { backgroundColor: surfaces.divider }]} />
        <HeroFigure
          label="Liabilities"
          value={netWorth.totalLiabilities}
          currency={currency}
          loading={netWorth.loading}
          prefix={netWorth.totalLiabilities > 0 ? signedCurrencyPrefix("-", currency) : undefined}
          valueColor={netWorth.totalLiabilities > 0 ? theme.colors.destructive : undefined}
          icon={<ArrowDownRight size={13} color={theme.colors.destructive} strokeWidth={2.6} />}
          tint={surfaces.wash(theme.colors.destructive)}
        />
      </View>
    </HeroSection>
  );
}

function HeroFigure({
  label,
  value,
  currency,
  loading,
  prefix,
  valueColor,
  icon,
  tint,
}: {
  label: string;
  value: number;
  currency: string;
  loading: boolean;
  prefix?: string;
  valueColor?: string;
  icon: React.ReactNode;
  tint: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.figure}>
      <View style={styles.figureLabelRow}>
        <View style={[styles.figureGlyph, { backgroundColor: tint }]}>{icon}</View>
        <MetaLabel>{label}</MetaLabel>
      </View>
      {loading ? (
        <Skeleton width={90} height={20} borderRadius={5} />
      ) : (
        <Amount
          value={value}
          currency={currency}
          prefix={prefix}
          ghostable
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{
            fontSize: 17,
            letterSpacing: -0.3,
            fontFamily: theme.fontFamily.semibold,
            color: valueColor ?? theme.colors.foreground,
          }}
        />
      )}
    </View>
  );
}

/* ------------------------------------------------------- Account summary */

type IconType = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const CARD_ICONS: Record<DashboardAccountCardKey, IconType> = {
  bank: Landmark,
  cards: CreditCard,
  deposits: PiggyBank,
  stocks: LineChart,
  epf: Briefcase,
  lent: HandCoins,
  loans: Wallet,
  groupFunds: Users,
  overdraft: Landmark,
};

function AccountSummaryCards({
  netWorth,
  currency,
}: {
  netWorth: UnifiedNetWorthSummary;
  currency: string;
}) {
  const investmentsEnabled = useInvestmentsEnabled();
  const cards = useMemo(
    () => dashboardAccountCards(netWorth, investmentsEnabled),
    [netWorth, investmentsEnabled]
  );

  return (
    <View style={styles.grid}>
      {cards.map((card) => (
        <AccountSummaryCard
          key={card.key}
          card={card}
          currency={currency}
          loading={netWorth.loading}
        />
      ))}
    </View>
  );
}

function AccountSummaryCard({
  card,
  currency,
  loading,
}: {
  card: DashboardAccountCard;
  currency: string;
  loading: boolean;
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const Icon = CARD_ICONS[card.key];
  const accent = card.owed ? theme.colors.destructive : theme.colors.primary;
  const caption = card.owed ? "Owed" : card.caption;

  const body = (
    <>
      <View style={styles.cardTop}>
        <View style={[styles.cardGlyph, { backgroundColor: surfaces.wash(accent) }]}>
          <Icon size={15} color={accent} strokeWidth={2.3} />
        </View>
        {card.route ? (
          <ChevronRight size={14} color={theme.colors.mutedForeground} strokeWidth={2.2} />
        ) : null}
      </View>
      <Text
        style={[styles.cardLabel, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}
        numberOfLines={1}
      >
        {card.label}
      </Text>
      {loading ? (
        <Skeleton width={80} height={18} borderRadius={5} />
      ) : (
        <Amount
          value={card.value}
          currency={currency}
          prefix={card.owed && card.value > 0 ? signedCurrencyPrefix("-", currency) : undefined}
          ghostable
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.65}
          style={{
            fontSize: 16,
            letterSpacing: -0.3,
            fontFamily: theme.fontFamily.semibold,
            color: card.owed ? theme.colors.destructive : theme.colors.foreground,
          }}
        />
      )}
      {caption ? (
        <Text
          style={[styles.cardCaption, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
          numberOfLines={1}
        >
          {caption}
        </Text>
      ) : null}
    </>
  );

  const surfaceStyle = [
    styles.card,
    { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
  ];

  if (!card.route) {
    return <View style={surfaceStyle}>{body}</View>;
  }

  const href = card.route as Href;
  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        router.push(href);
      }}
      android_ripple={{ color: surfaces.control, borderless: false }}
      style={({ pressed }) => [surfaceStyle, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${card.label}`}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 10,
  },
  heroValueSlot: {
    minHeight: DASH_TYPE.heroValueLine,
    justifyContent: "center",
  },
  heroNote: {
    fontSize: 12,
    marginTop: 2,
  },
  partialNote: {
    marginTop: 6,
  },
  splitRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  splitDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  figure: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  figureLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  figureGlyph: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  card: {
    // Two per row on phones; wraps cleanly on wide screens.
    flexGrow: 1,
    flexBasis: "45%",
    minWidth: 140,
    padding: 14,
    gap: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: DASH_RADIUS.tile + 2,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  cardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cardGlyph: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  cardLabel: {
    fontSize: 12,
  },
  cardCaption: {
    fontSize: 11,
  },
});
