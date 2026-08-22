import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { LineChart, Receipt, Sigma } from "lucide-react-native";

import {
  insightAccents,
  insightSurface,
} from "@/components/analytics/insightsTheme";
import { Amount } from "@/components/common/Amount";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface SearchSummaryCardProps {
  matched: number;
  totalSum: number;
  /** Null when nothing matched — renders an em dash rather than NaN. */
  average: number | null;
  currency: string;
}

export function SearchSummaryCard({
  matched,
  totalSum,
  average,
  currency,
}: SearchSummaryCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const surface = insightSurface(isDark);
  const accents = insightAccents(isDark);

  const column = (
    label: string,
    icon: React.ReactNode,
    tintRgb: string,
    value: React.ReactNode,
    caption: string
  ) => (
    <View style={styles.column}>
      {/* Icon sits above the label: a three-column split on a 360dp phone is
          too narrow to keep them side by side without truncating. */}
      <View
        style={[
          styles.iconBox,
          {
            backgroundColor: `rgba(${tintRgb}, ${isDark ? 0.15 : 0.09})`,
            borderColor: `rgba(${tintRgb}, ${isDark ? 0.3 : 0.18})`,
          },
        ]}
      >
        {icon}
      </View>
      <Text
        style={[styles.label, { color: theme.colors.mutedForeground }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View style={styles.valueSlot}>{value}</View>
      <Text
        style={[styles.caption, { color: theme.colors.mutedForeground }]}
        numberOfLines={1}
      >
        {caption}
      </Text>
    </View>
  );

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: surface.card, borderColor: surface.border },
      ]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={surface.wash}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.row}>
        {column(
          "Matched",
          <Receipt size={14} color={accents.pink} strokeWidth={2.4} />,
          "244, 63, 94",
          <Text
            style={[styles.value, { color: theme.colors.foreground }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {matched}
          </Text>,
          "Transactions"
        )}

        <View style={[styles.rule, { backgroundColor: surface.hairline }]} />

        {column(
          "Total Sum",
          <Sigma size={14} color={accents.green} strokeWidth={2.4} />,
          "74, 222, 128",
          <Amount
            value={totalSum}
            currency={currency}
            ghostable
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.62}
            style={[styles.value, { color: theme.colors.foreground }]}
          />,
          "Total of matches"
        )}

        <View style={[styles.rule, { backgroundColor: surface.hairline }]} />

        {column(
          "Average",
          <LineChart size={14} color={accents.violet} strokeWidth={2.4} />,
          "139, 92, 246",
          average === null ? (
            <Text style={[styles.value, { color: theme.colors.mutedForeground }]}>
              —
            </Text>
          ) : (
            <Amount
              value={average}
              currency={currency}
              ghostable
              fractionDigits={2}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.62}
              style={[styles.value, { color: theme.colors.foreground }]}
            />
          ),
          "Per transaction"
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  column: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  label: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  valueSlot: {
    flexDirection: "row",
    alignItems: "center",
  },
  value: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  caption: {
    fontSize: 10,
    fontWeight: "500",
  },
  rule: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 8,
    alignSelf: "stretch",
  },
});
