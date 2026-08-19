import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";
import {
  ArrowLeftRight,
  Calendar,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react-native";

import { AccountSafeIllustration } from "@/components/accounts/AccountSafeIllustration";
import {
  ACCOUNT_GREEN_GLOW,
  accountAccent,
  accountAccentBorder,
} from "@/components/accounts/accountScreenTheme";
import { Amount } from "@/components/common/Amount";
import { useSettings } from "@/providers/SettingsProvider";
import { currencySymbol, formatAmountNumber } from "@/shared/utils/formatCurrency";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

function HeroCurrencyAmount({
  value,
  currency,
}: {
  value: number;
  currency: string;
}) {
  const { theme } = useTheme();
  const { settings } = useSettings();
  const isGhosted = !!settings?.ghostMode;

  if (isGhosted) {
    return (
      <Text
        accessibilityLabel="Hidden amount"
        style={[
          styles.heroWhole,
          { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold },
        ]}
      >
        ••••••
      </Text>
    );
  }

  const formatted = formatAmountNumber(Math.abs(value), currency, {
    fractionDigits: 2,
    numberFormatStyle: settings?.numberFormat || "auto",
  });
  const dot = formatted.lastIndexOf(".");
  const whole = dot >= 0 ? formatted.slice(0, dot) : formatted;
  const frac = dot >= 0 ? formatted.slice(dot) : "";
  const symbol = currencySymbol(currency);
  const negative = value < 0;

  return (
    <View
      accessible
      accessibilityLabel={`Amount ${value}`}
      style={styles.heroAmountRow}
    >
      <Text
        style={[
          styles.heroSymbol,
          { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold },
        ]}
      >
        {negative ? `-${symbol}` : symbol}
      </Text>
      <Text
        style={[
          styles.heroWhole,
          { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold },
        ]}
      >
        {whole}
      </Text>
      {frac ? (
        <Text
          style={[
            styles.heroFrac,
            { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold },
          ]}
        >
          {frac}
        </Text>
      ) : null}
    </View>
  );
}

export function AccountBalanceCard({
  availableBalance,
  currency,
  openingBalance,
  baselineLabel,
  onTransfer,
  onAdjust,
}: {
  availableBalance: number;
  currency: string;
  openingBalance: number;
  baselineLabel: string;
  onTransfer: () => void;
  onAdjust: () => void;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const accent = accountAccent(isDark);
  const border = accountAccentBorder(isDark);

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: border,
          backgroundColor: isDark ? "#0B100E" : "#F4FBF6",
        },
      ]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={
          isDark
            ? ["rgba(74,222,128,0.14)", "rgba(12,22,18,0.0)", "#070B09"]
            : ["rgba(22,163,74,0.10)", "rgba(244,251,246,0.4)", "#F8FAFC"]
        }
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg pointerEvents="none" style={styles.pattern} width="100%" height="100%">
        <Circle
          cx="86%"
          cy="26%"
          r="78"
          stroke={isDark ? "rgba(74,222,128,0.10)" : "rgba(22,163,74,0.12)"}
          strokeWidth="1"
          fill="none"
        />
        <Circle
          cx="86%"
          cy="26%"
          r="54"
          stroke={isDark ? "rgba(74,222,128,0.07)" : "rgba(22,163,74,0.10)"}
          strokeWidth="1"
          fill="none"
        />
        <Circle
          cx="86%"
          cy="26%"
          r="28"
          stroke={isDark ? "rgba(74,222,128,0.05)" : "rgba(22,163,74,0.08)"}
          strokeWidth="1"
          fill="none"
        />
      </Svg>
      <View
        pointerEvents="none"
        style={[styles.glow, { backgroundColor: ACCOUNT_GREEN_GLOW }]}
      />
      <View pointerEvents="none" style={styles.safeSlot}>
        <AccountSafeIllustration size={132} />
      </View>

      <View style={styles.body}>
        <View style={styles.heroCopy}>
          <Text
            style={[
              styles.kicker,
              { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium },
            ]}
          >
            AVAILABLE BALANCE
          </Text>
          <HeroCurrencyAmount value={availableBalance} currency={currency} />
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: isDark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.86)",
                borderColor: isDark ? "rgba(74,222,128,0.28)" : "rgba(22,163,74,0.28)",
              },
            ]}
          >
            <ShieldCheck size={12} color={accent} strokeWidth={2.4} />
            <Text style={[styles.statusText, { color: accent }]}>Account Active</Text>
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
              OPENING BALANCE
            </Text>
            <Amount
              value={openingBalance}
              currency={currency}
              ghostable
              fractionDigits={2}
              style={[
                styles.metaValue,
                { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
              ]}
            />
          </View>
          <View
            style={[
              styles.metaDivider,
              { backgroundColor: isDark ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.1)" },
            ]}
          />
          <View style={styles.metaCol}>
            <View style={styles.metaLabelRow}>
              <Text style={[styles.metaLabel, { color: theme.colors.mutedForeground }]}>
                BASELINE DATE
              </Text>
              <Calendar size={12} color={theme.colors.mutedForeground} strokeWidth={2} />
            </View>
            <Text
              style={[
                styles.metaValue,
                { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
              ]}
            >
              {baselineLabel}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              void haptic.impact();
              onTransfer();
            }}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: isDark ? "rgba(8,12,10,0.65)" : "rgba(255,255,255,0.8)",
                borderColor: isDark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.1)",
              },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Transfer"
          >
            <ArrowLeftRight size={16} color={accent} strokeWidth={2.2} />
            <Text
              style={[
                styles.actionLabel,
                { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
              ]}
            >
              Transfer
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void haptic.impact();
              onAdjust();
            }}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: isDark ? "rgba(8,12,10,0.65)" : "rgba(255,255,255,0.8)",
                borderColor: isDark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.1)",
              },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Adjust"
          >
            <SlidersHorizontal size={16} color={accent} strokeWidth={2.2} />
            <Text
              style={[
                styles.actionLabel,
                { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
              ]}
            >
              Adjust
            </Text>
          </Pressable>
        </View>
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
    minHeight: 268,
  },
  glow: {
    position: "absolute",
    right: -36,
    top: -48,
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 0.55,
  },
  pattern: {
    ...StyleSheet.absoluteFill,
  },
  safeSlot: {
    position: "absolute",
    right: -8,
    top: 18,
    zIndex: 1,
  },
  body: {
    padding: 18,
    gap: 14,
    zIndex: 2,
  },
  heroCopy: {
    gap: 8,
    paddingRight: 118,
    minHeight: 118,
  },
  kicker: {
    fontSize: 11,
    letterSpacing: 1.1,
    fontWeight: "600",
  },
  heroAmountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  heroSymbol: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  heroWhole: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -1.2,
    fontVariant: ["tabular-nums"],
  },
  heroFrac: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.4,
    fontVariant: ["tabular-nums"],
    paddingBottom: 4,
  },
  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  metaPanel: {
    flexDirection: "row",
    alignItems: "stretch",
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
  metaLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
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
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.78,
  },
});
