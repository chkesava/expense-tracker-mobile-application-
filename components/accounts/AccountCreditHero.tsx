import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Calendar, CheckCircle2 } from "lucide-react-native";

import {
  ACCOUNT_GREEN,
  ACCOUNT_RED,
  CARD_ORANGE,
} from "@/components/accounts/accountScreenTheme";
import { Amount } from "@/components/common/Amount";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function AccountCreditHero({
  usedThisCycle,
  availableCredit,
  creditLimit,
  daysRemaining,
  currency,
  payLabel,
  onPay,
}: {
  usedThisCycle: number;
  availableCredit: number;
  creditLimit: number;
  daysRemaining: number;
  currency: string;
  payLabel: string;
  onPay: () => void;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const utilizationRate =
    creditLimit > 0 ? Math.min(100, (usedThisCycle / creditLimit) * 100) : 0;
  const usedColor = isDark ? ACCOUNT_RED : theme.colors.destructive;
  const availableColor = isDark ? ACCOUNT_GREEN : theme.colors.success;

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: isDark ? "rgba(251, 191, 36, 0.85)" : "rgba(217, 119, 6, 0.45)",
          backgroundColor: isDark ? "#16132C" : "#F5F3FF",
        },
      ]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={
          isDark
            ? ["rgba(99, 72, 210, 0.32)", "rgba(22, 19, 44, 0.2)", "#12101F"]
            : ["rgba(124, 58, 237, 0.12)", "#F8FAFC", "#F5F3FF"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          styles.glow,
          { backgroundColor: isDark ? "rgba(251, 191, 36, 0.14)" : "rgba(251, 191, 36, 0.1)" },
        ]}
      />

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text
            style={[styles.kicker, { color: theme.colors.mutedForeground }]}
            numberOfLines={1}
          >
            CURRENT USED (THIS CYCLE)
          </Text>
          <View
            style={[
              styles.resetPill,
              {
                backgroundColor: isDark ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.86)",
              },
            ]}
          >
            <Calendar size={12} color={theme.colors.mutedForeground} />
            <Text style={[styles.resetText, { color: theme.colors.mutedForeground }]}>
              Resets in {daysRemaining}d
            </Text>
          </View>
        </View>

        <Amount
          value={usedThisCycle}
          currency={currency}
          ghostable
          style={[styles.heroAmount, { color: usedColor }]}
        />

        <View
          style={[
            styles.track,
            { backgroundColor: isDark ? "rgba(15, 12, 28, 0.85)" : "rgba(15, 23, 42, 0.08)" },
          ]}
          accessibilityLabel={`${Math.round(utilizationRate)} percent of credit limit used`}
        >
          <View
            style={[
              styles.fill,
              {
                width: `${utilizationRate}%`,
                backgroundColor: usedColor,
              },
            ]}
          />
        </View>

        <View style={styles.metrics}>
          <View style={styles.metricCol}>
            <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground }]}>
              Available Credit
            </Text>
            <Amount
              value={availableCredit}
              currency={currency}
              ghostable
              style={[styles.metricValue, { color: availableColor }]}
            />
          </View>
          <View
            style={[
              styles.divider,
              { backgroundColor: isDark ? "rgba(148, 163, 184, 0.22)" : "rgba(15, 23, 42, 0.1)" },
            ]}
          />
          <View style={styles.metricCol}>
            <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground }]}>
              Credit Limit
            </Text>
            <Amount
              value={creditLimit}
              currency={currency}
              ghostable
              style={[styles.metricValue, { color: theme.colors.foreground }]}
            />
          </View>
        </View>

        <Pressable
          onPress={() => {
            void haptic.impact();
            onPay();
          }}
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={payLabel}
        >
          <CheckCircle2 size={18} color="#111111" strokeWidth={2.4} />
          <Text style={styles.ctaLabel}>{payLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    right: -36,
    top: -48,
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  body: {
    padding: 18,
    gap: 14,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  kicker: {
    flex: 1,
    fontSize: 11,
    letterSpacing: 1.1,
    fontWeight: "700",
  },
  heroAmount: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -0.8,
    fontVariant: ["tabular-nums"],
  },
  resetPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    flexShrink: 0,
  },
  resetText: {
    fontSize: 11,
    fontWeight: "700",
  },
  track: {
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
  metrics: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  metricCol: {
    flex: 1,
    gap: 4,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    alignSelf: "stretch",
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    borderRadius: 16,
    borderCurve: "continuous",
    gap: 8,
    backgroundColor: CARD_ORANGE,
  },
  ctaLabel: {
    color: "#111111",
    fontWeight: "800",
    fontSize: 15,
  },
  pressed: {
    opacity: 0.86,
  },
});
