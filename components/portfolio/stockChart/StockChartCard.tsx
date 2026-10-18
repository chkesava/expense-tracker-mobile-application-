import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { ChartCandlestick, ChartLine, Clock, CloudOff, RefreshCw } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { SkeletonChart } from "@/components/common/Skeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { usePortfolioColors } from "@/components/portfolio/portfolioColors";
import { Chip } from "@/components/ui/Chip";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useStockHistory, useStockHistoryCacheReady } from "@/hooks/useStockHistory";
import { haptic } from "@/lib/haptics";
import { MarketDataError } from "@/services/marketDataService";
import type { StockHistoryRange } from "@/shared/types/market";
import {
  aggregateCandles,
  chartViewState,
  type ChartMode,
} from "@/shared/utils/stockChartGeometry";
import {
  RANGE_LABEL,
  RANGE_SPOKEN,
  STOCK_HISTORY_RANGES,
  formatAsOf,
  formatBarTime,
  historyErrorCopy,
  seriesChange,
} from "@/shared/utils/stockHistory";
import { formatSignedPercent } from "@/shared/utils/investmentPresentation";
import { useTheme } from "@/theme/ThemeProvider";

import { StockChartPlot } from "./StockChartPlot";

const PLOT_HEIGHT = 220;
/** Rapid chip taps settle before a request goes out. */
const RANGE_DEBOUNCE_MS = 200;

function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

/**
 * Price history for one stock or ETF (SPENDLY-558): line and candlestick
 * views over eight ranges. Data comes from /api/stock-history through
 * `useStockHistory`, never from Firestore, and is labelled as delayed with
 * its own as-of time rather than as live.
 */
export function StockChartCard({ symbol }: { symbol: string }) {
  const colors = usePortfolioColors();
  const ready = useStockHistoryCacheReady();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {ready ? <StockChartBody symbol={symbol} /> : <SkeletonChart height={PLOT_HEIGHT} />}
    </View>
  );
}

function StockChartBody({ symbol }: { symbol: string }) {
  const { theme } = useTheme();
  const colors = usePortfolioColors();
  const muted = theme.colors.mutedForeground;

  const [range, setRange] = useState<StockHistoryRange>("1D");
  const [mode, setMode] = useState<ChartMode>("line");
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const queryRange = useDebounced(range, RANGE_DEBOUNCE_MS);

  const query = useStockHistory(symbol, queryRange);
  const dto = query.data ?? null;
  const currency = dto?.currency ?? "INR";
  const formatPrice = useGhostMoney(currency);

  const hasData = !!dto && dto.candles.some((candle) => candle.c != null);
  const state = chartViewState({
    hasData,
    isLoading: query.isPending || (query.isFetching && !hasData),
    isError: query.isError,
    serverStale: dto?.stale,
  });
  const switching = range !== queryRange || query.isPlaceholderData;

  const candles = useMemo(() => {
    if (!dto || width <= 0) return [];
    // About one bar per 4 px for candles, one point per pixel for the line.
    const plotWidth = Math.max(1, width - 60);
    return aggregateCandles(dto.candles, mode === "candle" ? Math.floor(plotWidth / 4) : Math.floor(plotWidth));
  }, [dto, mode, width]);

  const change = useMemo(() => (dto ? seriesChange(dto) : null), [dto]);
  const lineColor = change ? colors.pnl(change.change) : muted;

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);

  const scrubbing = useRef(false);
  const onScrub = useCallback((index: number | null) => {
    // One tick when the finger lands, not one per bar crossed.
    if (index != null && !scrubbing.current) void haptic.selection();
    scrubbing.current = index != null;
    setActiveIndex(index);
  }, []);

  const selectRange = (next: StockHistoryRange) => {
    setActiveIndex(null);
    setRange(next);
  };

  const palette = useMemo(
    () => ({
      line: lineColor,
      bull: theme.colors.success,
      bear: theme.colors.destructive,
      grid: colors.hairline,
      label: muted,
      crosshair: theme.colors.foreground,
    }),
    [colors.hairline, lineColor, muted, theme.colors.destructive, theme.colors.foreground, theme.colors.success]
  );

  const summary = dto && change
    ? `${dto.symbol} price chart, ${RANGE_SPOKEN[dto.range]}: from ${formatPrice(change.from)} to ${formatPrice(change.to)}, ${change.change >= 0 ? "up" : "down"} ${Math.abs(change.changePercent).toFixed(1)} percent.`
    : `${symbol} price chart`;

  const active = activeIndex != null ? candles[activeIndex] : undefined;
  const errorCode = query.error instanceof MarketDataError ? query.error.code : undefined;

  return (
    <View style={styles.body}>
      <View style={styles.headerRow}>
        <View style={styles.readout}>
          {active && dto ? (
            <>
              <View style={styles.readoutLine}>
                {active.c != null ? (
                  <Amount value={active.c} currency={currency} style={[styles.readoutPrice, { color: theme.colors.foreground }]} ghostable />
                ) : (
                  <Text style={[styles.readoutPrice, { color: muted }]}>No trade</Text>
                )}
              </View>
              <Text style={[styles.meta, { color: muted }]} numberOfLines={1}>
                {mode === "candle" && active.o != null && active.h != null && active.l != null
                  ? `O ${formatPrice(active.o)} · H ${formatPrice(active.h)} · L ${formatPrice(active.l)} · `
                  : ""}
                {formatBarTime(active.t, dto.range, dto.gmtOffsetSec)}
              </Text>
            </>
          ) : change && dto ? (
            <>
              <View style={styles.readoutLine}>
                <FinancialAmount value={change.change} currency={currency} size="md" sign="auto" tone="auto" weight="bold" />
                <Text style={[styles.changePct, { color: lineColor }]}>
                  ({formatSignedPercent(change.changePercent, 2)})
                </Text>
                <Text style={[styles.meta, { color: muted }]}>{RANGE_SPOKEN[dto.range]}</Text>
              </View>
              <View style={styles.readoutLine}>
                {state === "stale" ? <CloudOff size={12} color={muted} /> : <Clock size={12} color={muted} />}
                <Text style={[styles.meta, { color: muted }]} numberOfLines={1}>
                  {state === "stale" ? "Saved prices" : "Delayed"} · as of {formatAsOf(dto.asOf, dto.gmtOffsetSec)}
                </Text>
              </View>
            </>
          ) : (
            <Text style={[styles.meta, { color: muted }]}>Price history</Text>
          )}
        </View>
        {switching || (query.isFetching && hasData) ? (
          <ActivityIndicator size="small" color={muted} accessibilityLabel="Updating chart" />
        ) : null}
      </View>

      <View onLayout={onLayout} style={[styles.plotArea, { opacity: switching ? 0.55 : 1 }]}>
        {state === "loading" || width === 0 ? (
          <SkeletonChart height={PLOT_HEIGHT} />
        ) : state === "empty" ? (
          <ChartMessage
            title="No trading data for this period"
            detail="The market may have been closed. Try a longer range."
            muted={muted}
            color={theme.colors.foreground}
          />
        ) : state === "error" ? (
          <ChartMessage
            title="Chart unavailable"
            detail={historyErrorCopy(errorCode)}
            muted={muted}
            color={theme.colors.foreground}
            onRetry={() => void query.refetch()}
            retryColor={theme.colors.primary}
          />
        ) : dto ? (
          <StockChartPlot
            candles={candles}
            mode={mode}
            range={dto.range}
            gmtOffsetSec={dto.gmtOffsetSec}
            baseline={dto.range === "1D" ? dto.previousClose : null}
            width={width}
            height={PLOT_HEIGHT}
            palette={palette}
            formatPrice={formatPrice}
            activeIndex={activeIndex}
            onScrub={onScrub}
            accessibilityLabel={summary}
          />
        ) : null}
      </View>

      {state === "stale" ? (
        <Pressable
          onPress={() => void query.refetch()}
          style={({ pressed }) => [styles.staleRow, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Showing saved prices. Retry loading the latest chart."
        >
          <RefreshCw size={12} color={muted} />
          <Text style={[styles.meta, { color: muted }]}>
            {query.isError ? historyErrorCopy(errorCode) : "Showing saved prices."} Tap to retry.
          </Text>
        </Pressable>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.ranges}
        accessibilityRole="tablist"
      >
        {STOCK_HISTORY_RANGES.map((value) => (
          <Chip
            key={value}
            label={RANGE_LABEL[value]}
            size="sm"
            appearance="tonal"
            selected={value === range}
            onPress={() => selectRange(value)}
            accessibilityRole="tab"
            accessibilityLabel={RANGE_SPOKEN[value]}
            style={styles.rangeChip}
          />
        ))}
      </ScrollView>

      <SegmentedControl<ChartMode>
        value={mode}
        onChange={(next) => {
          setActiveIndex(null);
          setMode(next);
        }}
        options={[
          { value: "line", label: "Line", icon: (c) => <ChartLine size={16} color={c} /> },
          {
            value: "candle",
            label: "Candles",
            accessibilityLabel: "Candlestick",
            icon: (c) => <ChartCandlestick size={16} color={c} />,
          },
        ]}
      />
    </View>
  );
}

function ChartMessage({
  title,
  detail,
  muted,
  color,
  onRetry,
  retryColor,
}: {
  title: string;
  detail: string;
  muted: string;
  color: string;
  onRetry?: () => void;
  retryColor?: string;
}) {
  return (
    <View style={styles.message} accessibilityLiveRegion="polite">
      <Text style={[styles.messageTitle, { color }]}>{title}</Text>
      <Text style={[styles.messageDetail, { color: muted }]}>{detail}</Text>
      {onRetry ? (
        <Pressable
          onPress={() => {
            void haptic.selection();
            onRetry();
          }}
          hitSlop={8}
          style={({ pressed }) => [styles.retry, { borderColor: retryColor }, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Retry loading the chart"
        >
          <RefreshCw size={14} color={retryColor} />
          <Text style={[styles.retryLabel, { color: retryColor }]}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 20,
    borderCurve: "continuous",
    padding: 16,
  },
  body: {
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    minHeight: 42,
  },
  readout: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  readoutLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  readoutPrice: {
    fontSize: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  changePct: {
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  meta: {
    fontSize: 12,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  plotArea: {
    height: PLOT_HEIGHT,
    justifyContent: "center",
  },
  staleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 32,
  },
  ranges: {
    gap: 6,
  },
  rangeChip: {
    minWidth: 44,
    minHeight: 36,
    justifyContent: "center",
  },
  message: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 16,
  },
  messageTitle: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  messageDetail: {
    fontSize: 13,
    textAlign: "center",
  },
  retry: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 20,
  },
  retryLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
});
