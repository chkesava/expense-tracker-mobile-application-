import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowDownLeft, ArrowUpRight, ChevronRight } from "lucide-react-native";

import { HighlightedText } from "@/components/analytics/search/HighlightedText";
import {
  insightAccents,
  insightSurface,
} from "@/components/analytics/insightsTheme";
import { Amount } from "@/components/common/Amount";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface SearchResultRowProps {
  type: "expense" | "income";
  title: string;
  date: string;
  category: string;
  accountName?: string;
  amount: number;
  currency: string;
  /** Active search term, highlighted inside the text fields. */
  query: string;
  onPress?: () => void;
}

export function SearchResultRow({
  type,
  title,
  date,
  category,
  accountName,
  amount,
  currency,
  query,
  onPress,
}: SearchResultRowProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const surface = insightSurface(isDark);
  const accents = insightAccents(isDark);

  const isExpense = type === "expense";
  const accent = isExpense ? accents.pink : accents.green;
  const tintRgb = isExpense ? "244, 63, 94" : "74, 222, 128";

  const highlight = { color: accent, fontWeight: "800" as const };

  const body = (
    <>
      <View
        style={[
          styles.iconBox,
          {
            backgroundColor: `rgba(${tintRgb}, ${isDark ? 0.13 : 0.08})`,
            borderColor: `rgba(${tintRgb}, ${isDark ? 0.26 : 0.16})`,
          },
        ]}
      >
        {isExpense ? (
          <ArrowUpRight size={17} color={accent} strokeWidth={2.5} />
        ) : (
          <ArrowDownLeft size={17} color={accent} strokeWidth={2.5} />
        )}
      </View>

      <View style={styles.copy}>
        <HighlightedText
          text={title}
          query={query}
          numberOfLines={1}
          style={[styles.title, { color: theme.colors.foreground }]}
          highlightStyle={highlight}
        />
        <View style={styles.metaRow}>
          <Text
            style={[styles.meta, { color: theme.colors.mutedForeground }]}
            numberOfLines={1}
          >
            {date} ·{" "}
          </Text>
          <HighlightedText
            text={category}
            query={query}
            numberOfLines={1}
            style={[styles.meta, styles.metaFlex, { color: theme.colors.mutedForeground }]}
            highlightStyle={highlight}
          />
        </View>
        {accountName ? (
          <HighlightedText
            text={accountName}
            query={query}
            numberOfLines={1}
            style={[styles.account, { color: accent }]}
            highlightStyle={styles.accountHighlight}
          />
        ) : null}
      </View>

      <View style={styles.trailing}>
        <Amount
          value={amount}
          currency={currency}
          prefix={isExpense ? undefined : "+"}
          ghostable
          numberOfLines={1}
          style={[
            styles.amount,
            { color: isExpense ? theme.colors.foreground : accents.green },
          ]}
        />
        {onPress ? (
          <ChevronRight
            size={16}
            color={theme.colors.mutedForeground}
            strokeWidth={2.2}
          />
        ) : null}
      </View>
    </>
  );

  const shell = [
    styles.row,
    { backgroundColor: surface.card, borderColor: surface.border },
  ];

  if (!onPress) {
    return <View style={shell}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${date}, ${category}`}
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      style={({ pressed }) => [shell, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontSize: 13.5,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  meta: {
    fontSize: 11,
    fontWeight: "500",
  },
  metaFlex: {
    flexShrink: 1,
  },
  account: {
    fontSize: 11,
    fontWeight: "600",
  },
  accountHighlight: {
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
    maxWidth: "34%",
  },
  amount: {
    fontSize: 14,
    fontWeight: "800",
    textAlign: "right",
  },
  pressed: {
    opacity: 0.78,
  },
});
