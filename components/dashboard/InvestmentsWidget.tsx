import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { PieChart } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import {
  Section,
  SectionAction,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { useUnifiedNetWorth } from "@/hooks/useUnifiedNetWorth";
import { useTheme } from "@/theme/ThemeProvider";

export interface InvestmentsWidgetProps {
  liquidBalance?: number;
  currency: string;
}

export function InvestmentsWidget({ currency }: InvestmentsWidgetProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const netWorth = useUnifiedNetWorth();

  const lines: {
    key: string;
    label: string;
    value: number;
    color: string;
    prefix?: string;
  }[] = [
    {
      key: "liquid",
      label: "Liquid holdings",
      value: netWorth.liquidBankAssets,
      color: theme.colors.foreground,
    },
    {
      key: "investments",
      label: "Investments (FD/RD)",
      value: netWorth.investmentsValue,
      color: theme.colors.success,
    },
    {
      key: "stocks",
      label: "Stocks & demat",
      value: netWorth.totalStocksValue,
      color: theme.colors.info,
    },
  ];

  if (netWorth.totalLiabilities > 0) {
    lines.push({
      key: "liabilities",
      label: "Liabilities (credit cards)",
      value: netWorth.totalLiabilities,
      color: theme.colors.destructive,
      prefix: "-",
    });
  }

  return (
    <Section
      title="Asset Allocation"
      subtitle="Net worth & liabilities breakdown"
      icon={<PieChart size={16} color={theme.colors.info} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.info)}
      action={
        <SectionAction
          label="Investments"
          onPress={() => router.push("/ledger?tab=investments")}
        />
      }
      contentStyle={styles.list}
    >
      {lines.map((line) => (
        <View key={line.key} style={styles.row}>
          <Text
            style={[
              styles.label,
              {
                color: theme.colors.mutedForeground,
                fontFamily: theme.fontFamily.regular,
              },
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
              fontSize: 14,
              fontFamily: theme.fontFamily.medium,
              color: line.color,
            }}
          />
        </View>
      ))}

      {/* Net worth is the conclusion of the list, so it gets the emphasis. */}
      <View style={[styles.totalRow, { borderTopColor: surfaces.divider }]}>
        <Text
          style={[
            styles.totalLabel,
            {
              color: theme.colors.foreground,
              fontFamily: theme.fontFamily.semibold,
            },
          ]}
        >
          Total net worth
        </Text>
        <Amount
          value={netWorth.totalNetWorth}
          currency={currency}
          ghostable
          style={{
            fontSize: 20,
            letterSpacing: -0.5,
            fontFamily: theme.fontFamily.bold,
            color:
              netWorth.totalNetWorth >= 0
                ? theme.colors.foreground
                : theme.colors.destructive,
          }}
        />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 11,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  label: {
    flex: 1,
    minWidth: 0,
    fontSize: 13.5,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 5,
    paddingTop: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  totalLabel: {
    fontSize: 14,
  },
});
