import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Flame } from "lucide-react-native";

import {
  AnalyticsCard,
  AnalyticsCardMeta,
} from "@/components/analytics/monthly/AnalyticsCard";
import { insightAccents } from "@/components/analytics/insightsTheme";
import { Amount } from "@/components/common/Amount";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface OutlierRow {
  id: string;
  title: string;
  date: string;
  category: string;
  amount: number;
}

export interface HighTicketOutliersCardProps {
  outliers: OutlierRow[];
  currency: string;
}

export function HighTicketOutliersCard({
  outliers,
  currency,
}: HighTicketOutliersCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const accents = insightAccents(isDark);

  return (
    <AnalyticsCard
      title="High-Ticket Outliers"
      icon={<Flame size={16} color={accents.pink} strokeWidth={2.4} />}
      right={<AnalyticsCardMeta>&gt;2x monthly average</AnalyticsCardMeta>}
      gap={8}
    >
      {outliers.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.mutedForeground }]}>
          No high-ticket transactions this month.
        </Text>
      ) : (
        outliers.map((item) => (
          <View
            key={item.id}
            style={[
              styles.row,
              {
                backgroundColor: isDark
                  ? "rgba(244, 63, 94, 0.08)"
                  : "rgba(220, 38, 38, 0.045)",
                borderColor: isDark
                  ? "rgba(244, 63, 94, 0.22)"
                  : "rgba(220, 38, 38, 0.16)",
              },
            ]}
          >
            <View style={styles.copy}>
              <Text
                style={[styles.title, { color: theme.colors.foreground }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.title}
              </Text>
              <Text
                style={[styles.meta, { color: theme.colors.mutedForeground }]}
                numberOfLines={1}
              >
                {item.date} · {item.category}
              </Text>
            </View>
            <Amount
              value={item.amount}
              currency={currency}
              ghostable
              numberOfLines={1}
              style={[styles.amount, { color: accents.pink }]}
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
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
  },
  meta: {
    fontSize: 10.5,
    fontWeight: "500",
  },
  amount: {
    fontSize: 14,
    fontWeight: "800",
    flexShrink: 0,
    maxWidth: "36%",
    textAlign: "right",
  },
  empty: {
    fontSize: 12.5,
    fontWeight: "500",
    paddingVertical: 6,
  },
});
