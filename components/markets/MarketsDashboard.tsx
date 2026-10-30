import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Bell, Eye, LineChart } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton, SkeletonCard } from "@/components/common/Skeleton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useMarketOverview, useMarketOverviewCacheReady } from "@/hooks/useMarketOverview";
import type { PortfolioSubTabId } from "@/shared/config/navigation";
import { marketsView, type Instrument } from "@/shared/utils/marketsView";
import { useTheme } from "@/theme/ThemeProvider";

import { InstrumentSheet } from "./InstrumentSheet";
import {
  IndexCard,
  MarketBanner,
  MarketCard,
  MarketStatusStrip,
  MoverRow,
  SectionTitle,
  ShortcutRow,
} from "./MarketParts";

type MoversSide = "gainers" | "losers";

/** Re-render on a slow clock so "open" turns to "closed" at 15:30 without a refetch. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function MarketsSkeleton() {
  return (
    <View style={styles.stack} accessibilityLabel="Loading market data">
      <Skeleton height={16} width="60%" />
      <View style={styles.indexGrid}>
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} style={styles.skeletonIndex}>
            <Skeleton height={12} width="50%" />
            <Skeleton height={20} width="80%" />
            <Skeleton height={12} width="60%" />
          </SkeletonCard>
        ))}
      </View>
      <SkeletonCard>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={28} />
        ))}
      </SkeletonCard>
    </View>
  );
}

/**
 * The Markets tab (SPENDLY-622, story SPENDLY-645): benchmark indices, market
 * status and NIFTY 50 gainers and losers, with shortcuts into the Stocks tab.
 *
 * Data comes from /api/market-overview through `useMarketOverview` only. No
 * Firestore listener is mounted here, and nothing on this screen reads or
 * writes the user's portfolio.
 */
export function MarketsDashboard({ onOpenStocks }: { onOpenStocks: (sub: PortfolioSubTabId) => void }) {
  const ready = useMarketOverviewCacheReady();
  return ready ? <MarketsBody onOpenStocks={onOpenStocks} /> : <MarketsSkeleton />;
}

function MarketsBody({ onOpenStocks }: { onOpenStocks: (sub: PortfolioSubTabId) => void }) {
  const { theme } = useTheme();
  const overview = useMarketOverview();
  const nowMs = useNow(30_000);
  const [side, setSide] = useState<MoversSide>("gainers");
  const [selected, setSelected] = useState<Instrument | null>(null);
  const retry = () => void overview.query.refetch();

  const view = marketsView({
    data: overview.data,
    isFetching: overview.query.isFetching,
    isOffline: overview.isOffline,
    errorMessage: overview.errorMessage,
    nowMs,
  });

  const shortcuts = (
    <View style={styles.stack}>
      <SectionTitle title="Your stocks" />
      <MarketCard>
        <ShortcutRow
          icon={<Eye size={18} color={theme.colors.primary} />}
          label="Watchlist"
          hint="Stocks you're tracking"
          onPress={() => onOpenStocks("watchlist")}
          last={false}
        />
        <ShortcutRow
          icon={<Bell size={18} color={theme.colors.primary} />}
          label="Price alerts"
          hint="Alerts you've set on stocks"
          onPress={() => onOpenStocks("alerts")}
          last
        />
      </MarketCard>
    </View>
  );

  if (view.kind === "loading") {
    return (
      <View style={styles.stack}>
        <MarketsSkeleton />
        {shortcuts}
      </View>
    );
  }

  if (view.kind === "empty") {
    return (
      <View style={styles.stack}>
        <EmptyState
          icon={<LineChart size={28} color={theme.colors.mutedForeground} />}
          title={view.title}
          description={view.description}
          primaryAction={view.retry ? { label: "Retry", onPress: retry } : undefined}
          compact
        />
        {shortcuts}
      </View>
    );
  }

  const movers = view.movers;
  const list = movers.kind === "lists" ? (side === "gainers" ? movers.gainers : movers.losers) : [];

  return (
    <View style={styles.stack}>
      <MarketStatusStrip state={view.status.state} label={view.status.label} refreshing={view.refreshing} />
      {view.banner ? <MarketBanner banner={view.banner} onRetry={retry} /> : null}

      <View style={styles.stack}>
        <SectionTitle title="Indices" />
        {view.indices.kind === "list" ? (
          <View style={styles.indexGrid}>
            {view.indices.items.map((item) => (
              <IndexCard
                key={item.symbol}
                item={item}
                dimmed={view.dimmed}
                onPress={() => setSelected({ kind: "index", item })}
              />
            ))}
          </View>
        ) : (
          <MarketCard>
            <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.regular }}>
              {view.indices.text}
            </Text>
          </MarketCard>
        )}
      </View>

      <View style={styles.stack}>
        <SectionTitle
          title="Top movers"
          caption={movers.kind === "lists" ? `${movers.caption} · as of ${movers.asOf}` : undefined}
        />
        {movers.kind === "lists" ? (
          <MarketCard dimmed={view.dimmed}>
            <SegmentedControl<MoversSide>
              options={[
                { value: "gainers", label: "Gainers" },
                { value: "losers", label: "Losers" },
              ]}
              value={side}
              onChange={setSide}
            />
            {list.length > 0 ? (
              list.map((item, i) => (
                <MoverRow
                  key={item.symbol}
                  item={item}
                  last={i === list.length - 1}
                  onPress={() => setSelected({ kind: "stock", item })}
                />
              ))
            ) : (
              <Text
                style={[
                  styles.emptyList,
                  { color: theme.colors.mutedForeground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.regular },
                ]}
              >
                {side === "gainers" ? "No NIFTY 50 stock is up on this session." : "No NIFTY 50 stock is down on this session."}
              </Text>
            )}
          </MarketCard>
        ) : (
          <MarketCard>
            <Text style={{ color: theme.colors.foreground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.semibold }}>
              {movers.title}
            </Text>
            <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.regular }}>
              {movers.text}
            </Text>
          </MarketCard>
        )}
      </View>

      {shortcuts}

      <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
        Prices from Yahoo Finance and may be delayed. Index levels are in points.
      </Text>

      <InstrumentSheet instrument={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  indexGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  skeletonIndex: { flexGrow: 1, flexBasis: 160, minWidth: 150, gap: 8 },
  emptyList: { paddingVertical: 16, textAlign: "center" },
});
