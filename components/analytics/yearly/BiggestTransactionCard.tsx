import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Award, ChevronRight } from "lucide-react-native";

import { CARD_ORANGE } from "@/components/accounts/accountScreenTheme";
import { insightSurface } from "@/components/analytics/insightsTheme";
import { Amount } from "@/components/common/Amount";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface BiggestTransactionCardProps {
  year: number;
  title: string;
  date: string;
  category: string;
  amount: number;
  currency: string;
  /** Opens the existing transaction editor. */
  onPress?: () => void;
}

/**
 * The year's single largest expense, given a gold treatment because it is a
 * highlight rather than a warning.
 */
export function BiggestTransactionCard({
  year,
  title,
  date,
  category,
  amount,
  currency,
  onPress,
}: BiggestTransactionCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const surface = insightSurface(isDark);
  const gold = isDark ? CARD_ORANGE : "#B45309";

  const body = (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={
          isDark
            ? ["rgba(251, 191, 36, 0.14)", "rgba(12, 17, 29, 0)", "#0A0D17"]
            : ["rgba(180, 83, 9, 0.08)", "rgba(255, 255, 255, 0)", "#FFFBEB"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* The kicker gets its own row so the full label survives on narrow
          phones instead of truncating mid-word. */}
      <View style={styles.kickerRow}>
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor: isDark
                ? "rgba(251, 191, 36, 0.14)"
                : "rgba(180, 83, 9, 0.1)",
              borderColor: isDark
                ? "rgba(251, 191, 36, 0.34)"
                : "rgba(180, 83, 9, 0.2)",
            },
          ]}
        >
          <Award size={17} color={gold} strokeWidth={2.3} />
        </View>
        <Text style={[styles.kicker, { color: gold }]} numberOfLines={1}>
          BIGGEST TRANSACTION OF {year}
        </Text>
      </View>

      <View style={styles.bodyRow}>
        <View style={styles.copy}>
          <Text
            style={[styles.title, { color: theme.colors.foreground }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
          <Text
            style={[styles.meta, { color: theme.colors.mutedForeground }]}
            numberOfLines={1}
          >
            {date} · {category}
          </Text>
        </View>

        <View style={styles.trailing}>
          <Amount
            value={amount}
            currency={currency}
            ghostable
            numberOfLines={1}
            style={[styles.amount, { color: gold }]}
          />
          {onPress ? (
            <ChevronRight
              size={18}
              color={theme.colors.mutedForeground}
              strokeWidth={2.2}
            />
          ) : null}
        </View>
      </View>
    </>
  );

  const shell = [
    styles.card,
    {
      backgroundColor: surface.card,
      borderColor: isDark
        ? "rgba(251, 191, 36, 0.34)"
        : "rgba(180, 83, 9, 0.22)",
    },
  ];

  if (!onPress) {
    return <View style={shell}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Biggest transaction of ${year}: ${title}`}
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
  card: {
    padding: 14,
    gap: 10,
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
  },
  kickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  kicker: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  meta: {
    fontSize: 10.5,
    fontWeight: "500",
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    maxWidth: "38%",
  },
  amount: {
    fontSize: 16,
    fontWeight: "800",
    textAlign: "right",
  },
  pressed: {
    opacity: 0.82,
  },
});
