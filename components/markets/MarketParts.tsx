import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowDownRight, ArrowUpRight, ChevronRight, CloudOff, Minus, RefreshCw, TriangleAlert } from "lucide-react-native";
import type { ReactNode } from "react";

import { usePortfolioColors } from "@/components/portfolio/portfolioColors";
import type { MarketState } from "@/shared/types/market";
import type { BannerView, Direction, IndexView, MoverView } from "@/shared/utils/marketsView";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Presentational pieces of the Markets tab (SPENDLY-645). They draw what
 * `marketsView` decided and make no decisions of their own.
 */

/** Rounded bordered surface, matching the stock chart card. */
export function MarketCard({ children, dimmed = false }: { children: ReactNode; dimmed?: boolean }) {
  const colors = usePortfolioColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, dimmed && styles.dimmed]}>
      {children}
    </View>
  );
}

export function SectionTitle({ title, caption }: { title: string; caption?: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <Text
        accessibilityRole="header"
        style={{ color: theme.colors.foreground, fontSize: theme.typography.lg, fontFamily: theme.fontFamily.bold }}
      >
        {title}
      </Text>
      {caption ? (
        <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

function useDirectionColor(direction: Direction): string {
  const colors = usePortfolioColors();
  return colors.pnl(direction === "up" ? 1 : direction === "down" ? -1 : 0);
}

function DirectionIcon({ direction, size = 14 }: { direction: Direction; size?: number }) {
  const color = useDirectionColor(direction);
  if (direction === "up") return <ArrowUpRight size={size} color={color} />;
  if (direction === "down") return <ArrowDownRight size={size} color={color} />;
  return <Minus size={size} color={color} />;
}

/** Open / closed pill plus the freshness line. Never says "live". */
export function MarketStatusStrip({ state, label, refreshing }: { state: MarketState; label: string; refreshing: boolean }) {
  const { theme } = useTheme();
  const dot = state === "open" ? theme.colors.success : state === "closed" ? theme.colors.mutedForeground : theme.colors.warning;
  return (
    <View style={styles.statusRow} accessibilityRole="text" accessibilityLabel={label}>
      <View style={[styles.statusDot, { backgroundColor: dot }]} />
      <Text
        style={{ flex: 1, color: theme.colors.mutedForeground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.medium }}
        numberOfLines={2}
      >
        {label}
      </Text>
      {refreshing ? (
        <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
          Refreshing…
        </Text>
      ) : null}
    </View>
  );
}

export function MarketBanner({ banner, onRetry }: { banner: BannerView; onRetry: () => void }) {
  const { theme } = useTheme();
  const tint =
    banner.tone === "error" ? theme.colors.destructive : banner.tone === "warning" ? theme.colors.warning : theme.colors.mutedForeground;
  const Icon = banner.tone === "info" ? CloudOff : TriangleAlert;
  const body = (
    <>
      <Icon size={16} color={tint} />
      <Text style={{ flex: 1, color: theme.colors.foreground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.regular }}>
        {banner.text}
      </Text>
      {banner.retry ? <RefreshCw size={16} color={theme.colors.primary} /> : null}
    </>
  );
  return banner.retry ? (
    <Pressable
      onPress={onRetry}
      accessibilityRole="button"
      accessibilityLabel={`${banner.text} Retry.`}
      style={({ pressed }) => [styles.banner, { borderColor: tint }, pressed && { opacity: 0.7 }]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={[styles.banner, { borderColor: tint }]} accessibilityRole="text">
      {body}
    </View>
  );
}

export function IndexCard({ item, dimmed, onPress }: { item: IndexView; dimmed: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const color = useDirectionColor(item.direction);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.accessibilityLabel}
      accessibilityHint="Opens the chart"
      style={({ pressed }) => [styles.indexCell, pressed && { opacity: 0.7 }]}
    >
      <MarketCard dimmed={dimmed}>
        <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.semibold }}>
          {item.name}
        </Text>
        <Text
          style={{ color: theme.colors.foreground, fontSize: theme.typography.lg, fontFamily: theme.fontFamily.bold, fontVariant: ["tabular-nums"] }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {item.value}
        </Text>
        <View style={styles.changeRow}>
          <DirectionIcon direction={item.direction} />
          <Text style={{ color, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.semibold, fontVariant: ["tabular-nums"] }}>
            {item.change} ({item.changePercent})
          </Text>
        </View>
        {item.dayRange ? (
          <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
            Day {item.dayRange}
          </Text>
        ) : null}
        <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
          As of {item.asOf}
        </Text>
      </MarketCard>
    </Pressable>
  );
}

export function MoverRow({ item, last, onPress }: { item: MoverView; last: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const colors = usePortfolioColors();
  const color = useDirectionColor(item.direction);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.accessibilityLabel}
      accessibilityHint="Opens the chart"
      style={({ pressed }) => [
        styles.moverRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.moverName}>
        <Text style={{ color: theme.colors.foreground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.semibold }} numberOfLines={1}>
          {item.ticker}
        </Text>
        <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }} numberOfLines={1}>
          {item.name}
        </Text>
      </View>
      <View style={styles.moverFigures}>
        <Text style={{ color: theme.colors.foreground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.medium, fontVariant: ["tabular-nums"] }}>
          {item.price}
        </Text>
        <View style={styles.changeRow}>
          <DirectionIcon direction={item.direction} size={12} />
          <Text style={{ color, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.semibold, fontVariant: ["tabular-nums"] }}>
            {item.changePercent}
          </Text>
        </View>
      </View>
      <ChevronRight size={16} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

export function ShortcutRow({ icon, label, hint, onPress, last }: { icon: ReactNode; label: string; hint: string; onPress: () => void; last: boolean }) {
  const { theme } = useTheme();
  const colors = usePortfolioColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [
        styles.shortcut,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
        pressed && { opacity: 0.7 },
      ]}
    >
      {icon}
      <View style={styles.moverName}>
        <Text style={{ color: theme.colors.foreground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.semibold }}>{label}</Text>
        <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>{hint}</Text>
      </View>
      <ChevronRight size={16} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 20,
    borderCurve: "continuous",
    padding: 16,
    gap: 4,
  },
  dimmed: { opacity: 0.6 },
  sectionTitle: { gap: 2 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  indexCell: { flexGrow: 1, flexBasis: 160, minWidth: 150 },
  changeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  moverRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  moverName: { flex: 1, minWidth: 0, gap: 2 },
  moverFigures: { alignItems: "flex-end", gap: 2 },
  shortcut: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
});
