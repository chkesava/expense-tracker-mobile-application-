import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Amount } from "@/components/common/Amount";
import { usePortfolioColors } from "@/components/portfolio/portfolioColors";
import { useSettings } from "@/providers/SettingsProvider";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import type { PortfolioHistoryItem } from "@/shared/features/portfolio/utils/portfolioHistory";
import { formatHistoryQuantity } from "@/shared/features/portfolio/utils/portfolioHistory";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "@/theme/surfaces";

const COLUMNS = {
  date: 1.2,
  type: 1.0,
  instrument: 2.4,
  qtyPrice: 1.8,
  gross: 1.4,
  fees: 1.0,
  net: 1.8,
} as const;

export function PortfolioHistoryTableHeader() {
  const { theme } = useTheme();
  const muted = theme.colors.mutedForeground;

  const cell = (label: string, flex: number, alignRight = false) => (
    <Text
      style={[
        styles.headerCell,
        { flex, color: muted, textAlign: alignRight ? "right" : "left" },
      ]}
      numberOfLines={1}
    >
      {label}
    </Text>
  );

  return (
    <View
      style={styles.tableHeaderRow}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {cell("Date", COLUMNS.date)}
      {cell("Type", COLUMNS.type)}
      {cell("Instrument", COLUMNS.instrument)}
      {cell("Qty @ Price", COLUMNS.qtyPrice, true)}
      {cell("Gross", COLUMNS.gross, true)}
      {cell("Fees", COLUMNS.fees, true)}
      {cell("Net Cash", COLUMNS.net, true)}
    </View>
  );
}

export const PortfolioHistoryRow = memo(function PortfolioHistoryRow({
  item,
  currency,
  wide = false,
}: {
  item: PortfolioHistoryItem;
  currency: string;
  wide?: boolean;
}) {
  const { theme } = useTheme();
  const colors = usePortfolioColors();
  const { settings } = useSettings();
  const muted = theme.colors.mutedForeground;
  const foreground = theme.colors.foreground;

  const isBuy = item.type === "BUY";
  const isSell = item.type === "SELL";
  const isAdjustment = item.type === "ADJUSTMENT";

  const typeColor = isBuy
    ? colors.buy
    : isSell
      ? colors.sell
      : isAdjustment
        ? colors.adjust
        : theme.colors.info;

  const instrumentColor = colors.instrument(item.instrumentType);

  const displayDate = formatDisplayDate(item.date, settings?.dateFormat);
  const formattedQty = formatHistoryQuantity(item.quantity);

  if (wide) {
    return (
      <View
        style={[
          styles.wideRow,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
        accessible
        accessibilityLabel={`${item.type} ${item.symbol}, ${formattedQty} shares at ${item.price}, net ${item.net}`}
      >
        {/* Date */}
        <Text style={[styles.cellText, { flex: COLUMNS.date, color: muted }]}>
          {displayDate}
        </Text>

        {/* Type Badge */}
        <View style={{ flex: COLUMNS.type, flexDirection: "row", alignItems: "center" }}>
          <View
            style={[
              styles.typeBadge,
              {
                backgroundColor: withAlpha(typeColor, 0.14),
                borderColor: withAlpha(typeColor, 0.35),
              },
            ]}
          >
            <Text style={[styles.typeText, { color: typeColor }]}>
              {item.type === "ADJUSTMENT" ? "ADJ" : item.type}
            </Text>
          </View>
        </View>

        {/* Instrument Identity */}
        <View style={[styles.identityCell, { flex: COLUMNS.instrument }]}>
          <View style={styles.symbolRow}>
            <View style={[styles.dot, { backgroundColor: instrumentColor }]} />
            <Text style={[styles.symbolText, { color: foreground }]} numberOfLines={1}>
              {item.symbol}
            </Text>
            {item.broker ? (
              <View style={[styles.brokerBadge, { backgroundColor: colors.inset }]}>
                <Text style={[styles.brokerText, { color: muted }]}>{item.broker}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.nameText, { color: muted }]} numberOfLines={1}>
            {item.name || item.symbol}
          </Text>
        </View>

        {/* Qty @ Price */}
        <View style={[styles.alignEndCell, { flex: COLUMNS.qtyPrice }]}>
          {isAdjustment ? (
            <Text style={[styles.cellText, { color: muted }]}>Cost base</Text>
          ) : (
            <View style={styles.inlineAmountRow}>
              <Text style={[styles.cellText, { color: muted }]}>{formattedQty} @ </Text>
              <Amount value={item.price} currency={currency} ghostable style={styles.cellText} />
            </View>
          )}
        </View>

        {/* Gross */}
        <View style={[styles.alignEndCell, { flex: COLUMNS.gross }]}>
          <Amount value={item.gross} currency={currency} ghostable style={styles.cellText} />
        </View>

        {/* Fees */}
        <View style={[styles.alignEndCell, { flex: COLUMNS.fees }]}>
          <Amount
            value={item.fees}
            currency={currency}
            ghostable
            style={[styles.cellText, { color: item.fees > 0 ? muted : colors.adjust }]}
          />
        </View>

        {/* Net Cash Impact */}
        <View style={[styles.alignEndCell, { flex: COLUMNS.net }]}>
          <View style={styles.inlineAmountRow}>
            <Amount
              value={item.net}
              currency={currency}
              ghostable
              style={[
                styles.cellTextBold,
                {
                  color: isBuy
                    ? theme.colors.foreground
                    : isSell
                      ? colors.sell
                      : theme.colors.foreground,
                },
              ]}
            />
          </View>
          <Text style={[styles.captionText, { color: muted }]}>
            {isBuy ? "Total cost" : isSell ? "Net proceeds" : "Recorded"}
          </Text>
        </View>
      </View>
    );
  }

  // Mobile / compact card layout
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
      accessible
      accessibilityLabel={`${item.type} ${item.symbol}, ${formattedQty} units on ${displayDate}, net ${item.net}`}
    >
      {/* Top row: Symbol, Name, Badges, Date */}
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <View style={styles.symbolRow}>
            <View style={[styles.dot, { backgroundColor: instrumentColor }]} />
            <Text style={[styles.symbolText, { color: foreground }]} numberOfLines={1}>
              {item.symbol}
            </Text>
            <View
              style={[
                styles.typeBadge,
                {
                  backgroundColor: withAlpha(typeColor, 0.14),
                  borderColor: withAlpha(typeColor, 0.35),
                },
              ]}
            >
              <Text style={[styles.typeText, { color: typeColor }]}>
                {item.type === "ADJUSTMENT" ? "ADJ" : item.type}
              </Text>
            </View>
            {item.broker ? (
              <View style={[styles.brokerBadge, { backgroundColor: colors.inset }]}>
                <Text style={[styles.brokerText, { color: muted }]}>{item.broker}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.nameText, { color: muted }]} numberOfLines={1}>
            {item.name || item.symbol}
          </Text>
        </View>
        <Text style={[styles.dateText, { color: muted }]}>{displayDate}</Text>
      </View>

      {/* Details breakdown */}
      <View style={[styles.divider, { backgroundColor: colors.hairline }]} />

      <View style={styles.bottomRow}>
        <View style={styles.tradeSpec}>
          {isAdjustment ? (
            <Text style={[styles.metaText, { color: muted }]}>Cost base adjustment</Text>
          ) : (
            <View style={styles.inlineAmountRow}>
              <Text style={[styles.metaText, { color: muted }]}>{formattedQty} @ </Text>
              <Amount value={item.price} currency={currency} ghostable style={styles.metaText} />
            </View>
          )}
          {item.fees > 0 ? (
            <View style={styles.inlineAmountRow}>
              <Text style={[styles.captionText, { color: muted }]}>Fees: </Text>
              <Amount value={item.fees} currency={currency} ghostable style={styles.captionText} />
            </View>
          ) : null}
        </View>

        <View style={styles.netImpactCol}>
          <View style={styles.inlineAmountRow}>
            <Amount
              value={item.net}
              currency={currency}
              ghostable
              style={[
                styles.netAmountText,
                {
                  color: isBuy
                    ? foreground
                    : isSell
                      ? colors.sell
                      : foreground,
                },
              ]}
            />
          </View>
          <Text style={[styles.captionText, { color: muted }]}>
            {isBuy ? "Total cost" : isSell ? "Net proceeds" : "Value"}
          </Text>
        </View>
      </View>

      {item.notes ? (
        <Text style={[styles.notesText, { color: muted }]} numberOfLines={2}>
          {item.notes}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderCurve: "continuous",
    gap: 8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  topLeft: {
    flex: 1,
    gap: 2,
  },
  symbolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  symbolText: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  nameText: {
    fontSize: 12,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  brokerBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  brokerText: {
    fontSize: 10,
    fontWeight: "600",
  },
  dateText: {
    fontSize: 12,
    fontWeight: "500",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  tradeSpec: {
    flex: 1,
    gap: 2,
  },
  inlineAmountRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaText: {
    fontSize: 13,
    fontWeight: "500",
  },
  captionText: {
    fontSize: 11,
  },
  netImpactCol: {
    alignItems: "flex-end",
    gap: 1,
  },
  netAmountText: {
    fontSize: 14,
    fontWeight: "700",
  },
  notesText: {
    fontSize: 11,
    fontStyle: "italic",
    paddingTop: 2,
  },

  // Wide table layout styles
  tableHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  headerCell: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  wideRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  identityCell: {
    gap: 2,
  },
  alignEndCell: {
    alignItems: "flex-end",
    gap: 1,
  },
  cellText: {
    fontSize: 13,
    fontWeight: "500",
  },
  cellTextBold: {
    fontSize: 13,
    fontWeight: "700",
  },
});
