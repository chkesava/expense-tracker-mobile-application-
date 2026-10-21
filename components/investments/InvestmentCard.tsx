import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Calendar, ChevronRight } from "lucide-react-native";

import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { MetaLabel, Pill, RowGlyph } from "@/components/dashboard/primitives";
import { useInvestmentKindStyle } from "@/components/investments/investmentKind";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { haptic } from "@/lib/haptics";
import { useSettings } from "@/providers/SettingsProvider";
import type { Investment } from "@/shared/types/investment";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { todayDateKey } from "@/shared/utils/dates";
import { getInvestmentValuation } from "@/shared/utils/investmentInterest";
import {
  formatSignedPercent,
  investmentReturnPercent,
  investmentStatusDisplay,
} from "@/shared/utils/investmentPresentation";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

export interface InvestmentCardProps {
  investment: Investment;
  currency: string;
  onPress: () => void;
}

export function InvestmentCard({
  investment,
  currency,
  onPress,
}: InvestmentCardProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const money = useGhostMoney(currency);
  const kind = useInvestmentKindStyle(investment.kind);

  const today = todayDateKey();
  const valuation = useMemo(() => {
    return getInvestmentValuation(investment, today);
  }, [investment, today]);

  const isClosed = investment.status === "closed";
  const gain = valuation.totalValue - investment.principal;
  const returnPct = investmentReturnPercent(gain, investment.principal);
  const roundedGain = Math.round(gain);

  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      // Closed investments stay read-only in the list, as before.
      disabled={isClosed}
      accessibilityRole="button"
      accessibilityState={{ disabled: isClosed }}
      accessibilityLabel={`${investment.name}, ${kind.label}, ${investmentStatusDisplay(investment.status).label}, current value ${money(valuation.totalValue)}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.outlineVariant,
          opacity: isClosed ? 0.72 : pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.header}>
        <RowGlyph tint={surfaces.wash(kind.color)} size={38}>
          <kind.Icon size={17} color={kind.color} />
        </RowGlyph>
        <View style={styles.titleCol}>
          <Text
            style={[styles.name, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
            numberOfLines={1}
          >
            {investment.name}
          </Text>
          <Text
            style={[styles.kind, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
            numberOfLines={1}
          >
            {kind.label}
          </Text>
        </View>
        <Pill label={investmentStatusDisplay(investment.status).label} tone={investmentStatusDisplay(investment.status).tone} />
        {!isClosed ? (
          <ChevronRight size={18} color={theme.colors.mutedForeground} />
        ) : null}
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <MetaLabel>Principal</MetaLabel>
          <FinancialAmount value={investment.principal} currency={currency} size="md" weight="semibold" />
        </View>
        <View style={[styles.metric, styles.metricEnd]}>
          <MetaLabel>Current value</MetaLabel>
          <FinancialAmount value={valuation.totalValue} currency={currency} size="md" weight="bold" />
        </View>
      </View>

      <View style={[styles.footer, { borderTopColor: surfaces.divider }]}>
        <View style={styles.footerLeft}>
          {investment.annualInterestRate !== undefined ? (
            <Pill label={`${investment.annualInterestRate}% p.a.`} tone="accent" />
          ) : investment.kind === "mutual_fund" && returnPct !== null ? (
            <Pill
              label={formatSignedPercent(returnPct)}
              tone={returnPct < 0 ? "negative" : "positive"}
            />
          ) : null}

          {roundedGain !== 0 ? (
            <View style={styles.gain}>
              <FinancialAmount
                value={roundedGain}
                currency={currency}
                size="xs"
                sign="auto"
                tone="auto"
                weight="semibold"
              />
              <Text style={[styles.footerText, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
                {roundedGain > 0 ? "gain" : "loss"}
              </Text>
            </View>
          ) : null}
        </View>

        {investment.maturityDate ? (
          <View style={styles.maturity}>
            <Calendar size={12} color={theme.colors.mutedForeground} />
            <Text style={[styles.footerText, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
              Matures {formatDisplayDate(investment.maturityDate, settings?.dateFormat)}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    fontSize: 16,
  },
  kind: {
    fontSize: 12.5,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  metric: {
    gap: 3,
    flexShrink: 1,
  },
  metricEnd: {
    alignItems: "flex-end",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  maturity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  footerText: {
    fontSize: 12,
  },
});
