import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { ShoppingBag } from "lucide-react-native";

import { AnalyticsCard } from "@/components/analytics/shared/AnalyticsCard";
import {
  insightAccents,
  insightSurface,
} from "@/components/analytics/insightsTheme";
import { Amount } from "@/components/common/Amount";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface RecurringMerchantRow {
  note: string;
  count: number;
  total: number;
  /** Emoji glyph for the merchant's dominant category. */
  icon: string;
  /** Series colour for the merchant's dominant category. */
  color: string;
}

export interface RecurringMerchantsCardProps {
  merchants: RecurringMerchantRow[];
  currency: string;
}

export function RecurringMerchantsCard({
  merchants,
  currency,
}: RecurringMerchantsCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const surface = insightSurface(isDark);
  const accents = insightAccents(isDark);

  return (
    <AnalyticsCard
      title="Top Recurring Merchants & Notes"
      icon={<ShoppingBag size={16} color={accents.green} strokeWidth={2.4} />}
      gap={6}
    >
      {merchants.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.mutedForeground }]}>
          No recurring merchants found for this month.
        </Text>
      ) : (
        merchants.map((merchant, index) => (
          <View
            key={`${merchant.note}-${index}`}
            style={[
              styles.row,
              index < merchants.length - 1 && {
                borderBottomColor: surface.hairline,
                borderBottomWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            <Text
              style={[styles.rank, { color: theme.colors.mutedForeground }]}
              numberOfLines={1}
            >
              #{index + 1}
            </Text>

            <View
              style={[
                styles.iconBox,
                {
                  backgroundColor: `${merchant.color}22`,
                  borderColor: `${merchant.color}55`,
                },
              ]}
            >
              <Text style={styles.iconGlyph}>{merchant.icon}</Text>
            </View>

            <View style={styles.copy}>
              <Text
                style={[styles.name, { color: theme.colors.foreground }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {merchant.note}
              </Text>
              <Text
                style={[styles.meta, { color: theme.colors.mutedForeground }]}
                numberOfLines={1}
              >
                {merchant.count} transaction{merchant.count > 1 ? "s" : ""}
              </Text>
            </View>

            <Amount
              value={merchant.total}
              currency={currency}
              ghostable
              numberOfLines={1}
              style={[styles.amount, { color: theme.colors.foreground }]}
            />
          </View>
        ))
      )}
    </AnalyticsCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  rank: {
    fontSize: 10.5,
    fontWeight: "800",
    width: 20,
    flexShrink: 0,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 11,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconGlyph: {
    fontSize: 15,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
  },
  meta: {
    fontSize: 10.5,
    fontWeight: "500",
  },
  amount: {
    fontSize: 13.5,
    fontWeight: "800",
    flexShrink: 0,
    maxWidth: "34%",
    textAlign: "right",
  },
  empty: {
    fontSize: 12.5,
    fontWeight: "500",
    paddingVertical: 6,
  },
});
