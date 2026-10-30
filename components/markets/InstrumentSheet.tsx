import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";

import { usePortfolioColors } from "@/components/portfolio/portfolioColors";
import { StockChartCard } from "@/components/portfolio/stockChart/StockChartCard";
import { haptic } from "@/lib/haptics";
import {
  instrumentChartSymbol,
  instrumentHeader,
  instrumentPriceUnit,
  type Instrument,
} from "@/shared/utils/marketsView";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Read-only detail for an index or a NIFTY 50 mover tapped on the Markets tab
 * (SPENDLY-622, story SPENDLY-646): the figures the tab already has, plus the
 * price history chart.
 *
 * No buy or sell, no watchlist write and no Firestore: the chart reads
 * /api/stock-history only. "Add to watchlist" waits for SPENDLY-624.
 */
export function InstrumentSheet({ instrument, onClose }: { instrument: Instrument | null; onClose: () => void }) {
  const { theme } = useTheme();
  const colors = usePortfolioColors();
  const insets = useSafeAreaInsets();

  const header = instrument ? instrumentHeader(instrument) : null;
  const chartSymbol = instrument ? instrumentChartSymbol(instrument) : null;
  const moveColor = header ? colors.pnl(header.direction === "up" ? 1 : header.direction === "down" ? -1 : 0) : theme.colors.foreground;
  const dayRange = instrument?.kind === "index" ? instrument.item.dayRange : null;

  return (
    <Modal visible={!!instrument} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              void haptic.selection();
              onClose();
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <ChevronLeft size={24} color={theme.colors.foreground} />
          </Pressable>
          <Text
            style={{ flex: 1, color: theme.colors.foreground, fontSize: theme.typography.lg, fontFamily: theme.fontFamily.bold }}
            numberOfLines={1}
          >
            {instrument?.kind === "index" ? "Index" : "Stock"}
          </Text>
        </View>

        {header ? (
          <ScrollView
            style={styles.body}
            contentContainerStyle={[styles.bodyContent, { paddingBottom: 24 + insets.bottom }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.identity} accessible accessibilityLabel={instrument?.item.accessibilityLabel}>
              <Text
                style={{ color: theme.colors.foreground, fontSize: theme.typography.lg, fontFamily: theme.fontFamily.bold }}
                numberOfLines={2}
              >
                {header.title}
              </Text>
              <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
                {header.subtitle}
              </Text>
              <View style={styles.quoteRow}>
                <Text style={[styles.value, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}>{header.value}</Text>
                <Text style={{ color: moveColor, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.semibold }}>
                  {header.move}
                </Text>
              </View>
              {dayRange ? (
                <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
                  Day {dayRange}
                </Text>
              ) : null}
            </View>

            {chartSymbol && instrument ? (
              <StockChartCard symbol={chartSymbol} priceUnit={instrumentPriceUnit(instrument)} />
            ) : null}

            <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
              {instrument?.kind === "index"
                ? "Index levels are in points. Prices from Yahoo Finance and may be delayed."
                : "Prices from Yahoo Finance and may be delayed. Read only: this doesn't change your portfolio."}
            </Text>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, minHeight: 48, gap: 4 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  identity: { gap: 4 },
  quoteRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 8 },
  value: { fontSize: 28, fontVariant: ["tabular-nums"] },
});
