import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Calendar, CheckCircle2 } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { accountAccent, accountAccentBorder } from "@/components/accounts/accountScreenTheme";
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
  const accent = accountAccent(isDark);

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: accountAccentBorder(isDark),
          backgroundColor: isDark ? "#0B100E" : "#F4FBF6",
        },
      ]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={
          isDark
            ? ["rgba(74,222,128,0.12)", "rgba(12,22,18,0.0)", "#070B09"]
            : ["rgba(22,163,74,0.08)", "#F8FAFC", "#F8FAFC"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[styles.kicker, { color: theme.colors.mutedForeground }]}>
              CURRENT USED (THIS CYCLE)
            </Text>
            <Amount
              value={usedThisCycle}
              currency={currency}
              ghostable
              fractionDigits={2}
              style={[
                styles.heroAmount,
                { color: theme.colors.destructive, fontFamily: theme.fontFamily.bold },
              ]}
            />
          </View>
          <View
            style={[
              styles.resetPill,
              {
                backgroundColor: isDark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.86)",
              },
            ]}
          >
            <Calendar size={12} color={theme.colors.mutedForeground} />
            <Text style={[styles.resetText, { color: theme.colors.mutedForeground }]}>
              Resets in {daysRemaining}d
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.metaPanel,
            {
              backgroundColor: isDark ? "rgba(8,12,10,0.72)" : "rgba(255,255,255,0.72)",
              borderColor: isDark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.08)",
            },
          ]}
        >
          <View style={styles.metaCol}>
            <Text style={[styles.metaLabel, { color: theme.colors.mutedForeground }]}>
              AVAILABLE CREDIT
            </Text>
            <Amount
              value={availableCredit}
              currency={currency}
              ghostable
              fractionDigits={2}
              style={[styles.metaValue, { color: accent }]}
            />
          </View>
          <View
            style={[
              styles.metaDivider,
              { backgroundColor: isDark ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.1)" },
            ]}
          />
          <View style={styles.metaCol}>
            <Text style={[styles.metaLabel, { color: theme.colors.mutedForeground }]}>
              CREDIT LIMIT
            </Text>
            <Amount
              value={creditLimit}
              currency={currency}
              ghostable
              fractionDigits={2}
              style={[styles.metaValue, { color: theme.colors.foreground }]}
            />
          </View>
        </View>

        <Pressable
          onPress={() => {
            void haptic.impact();
            onPay();
          }}
          style={[styles.cta, { backgroundColor: theme.colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel={payLabel}
        >
          <CheckCircle2 size={16} color={theme.colors.primaryForeground} />
          <Text
            style={{
              color: theme.colors.primaryForeground,
              fontWeight: "700",
              fontSize: 14,
            }}
          >
            {payLabel}
          </Text>
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
  body: {
    padding: 18,
    gap: 14,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  kicker: {
    fontSize: 11,
    letterSpacing: 1.1,
    fontWeight: "700",
  },
  heroAmount: {
    fontSize: 28,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  resetPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  resetText: {
    fontSize: 11,
    fontWeight: "700",
  },
  metaPanel: {
    flexDirection: "row",
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  metaCol: {
    flex: 1,
    gap: 4,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  metaValue: {
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  metaDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 12,
    alignSelf: "stretch",
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 14,
    borderCurve: "continuous",
    gap: 8,
  },
});
