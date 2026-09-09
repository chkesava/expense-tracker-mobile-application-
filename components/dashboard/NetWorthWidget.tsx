import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Landmark } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import {
  MetaLabel,
  Section,
  SectionAction,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { useUnifiedNetWorth } from "@/hooks/useUnifiedNetWorth";
import type { MonthCashFlow } from "@/shared/utils/spendlyBudget";
import { useTheme } from "@/theme/ThemeProvider";

export interface NetWorthWidgetProps {
  currency: string;
  cashFlow: MonthCashFlow[];
}

export function NetWorthWidget({ currency, cashFlow }: NetWorthWidgetProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const netWorth = useUnifiedNetWorth();

  const maxAbs = Math.max(1, ...cashFlow.map((row) => Math.abs(row.net)));
  const lines = [
    { key: "liquid", label: "Liquid", value: netWorth.liquidBankAssets, color: theme.colors.foreground },
    { key: "invest", label: "Investments", value: netWorth.investmentsValue + netWorth.totalStocksValue, color: theme.colors.success },
    {
      key: "liab",
      label: "Liabilities",
      value: netWorth.totalLiabilities,
      color: theme.colors.destructive,
      prefix: netWorth.totalLiabilities > 0 ? "-" : undefined,
    },
  ].filter((line) => line.value > 0 || line.key === "liquid");

  return (
    <Section
      title="Net Worth"
      subtitle="How much am I worth?"
      icon={<Landmark size={16} color={theme.colors.info} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.info)}
      action={<SectionAction label="Accounts" onPress={() => router.push("/accounts" as never)} />}
    >
      <Amount
        value={netWorth.totalNetWorth}
        currency={currency}
        ghostable
        style={{
          fontSize: 28,
          lineHeight: 34,
          letterSpacing: -0.8,
          fontFamily: theme.fontFamily.bold,
          color:
            netWorth.totalNetWorth >= 0
              ? theme.colors.foreground
              : theme.colors.destructive,
        }}
      />

      <View style={styles.lines}>
        {lines.map((line) => (
          <View key={line.key} style={styles.line}>
            <Text
              style={[
                styles.lineLabel,
                { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
              ]}
              numberOfLines={1}
            >
              {line.label}
            </Text>
            <Amount
              value={line.value}
              currency={currency}
              prefix={line.prefix}
              ghostable
              style={{
                fontSize: 13.5,
                fontFamily: theme.fontFamily.medium,
                color: line.color,
              }}
            />
          </View>
        ))}
      </View>

      <View style={[styles.sparkBlock, { borderTopColor: surfaces.divider }]}>
        <MetaLabel>Cash movement · last 6 months</MetaLabel>
        <View style={styles.sparkRow}>
          {cashFlow.map((row) => {
            const height = Math.max(4, Math.round((Math.abs(row.net) / maxAbs) * 28));
            const positive = row.net >= 0;
            return (
              <View key={row.month} style={styles.sparkCol}>
                <View
                  style={{
                    width: 8,
                    height,
                    borderRadius: 3,
                    backgroundColor: positive
                      ? theme.colors.success
                      : theme.colors.destructive,
                  }}
                />
              </View>
            );
          })}
        </View>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  lines: {
    gap: 8,
    marginTop: 12,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  lineLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
  },
  sparkBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  sparkRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    height: 32,
  },
  sparkCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
});
