import { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { useExpenses } from "@/hooks/useExpenses";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { Card } from "@/components/ui/Card";
import { Amount } from "@/components/common/Amount";
import { buildCreditCardLedger } from "@/shared/utils/creditCardLedger";
import { buildSettledStatementDiscrepancyReport } from "@/shared/utils/creditCardDiscrepancy";
import { formatAmount } from "@/shared/utils/formatCurrency";

type Props = {
  accountId: string;
};

export function SettledStatementDiscrepancyReport({ accountId }: Props) {
  const { theme } = useTheme();
  const { accounts } = useAccounts();
  const { expenses } = useExpenses();
  const { bills } = useCreditCardBills();

  const account = useMemo(() => accounts.find(a => a.id === accountId), [accounts, accountId]);

  const report = useMemo(() => {
    if (!account) return null;
    const ledger = buildCreditCardLedger({
      account,
      expenses,
      payments: [], // Payments aren't strictly necessary for just checking billed vs windowSpend discrepancies
      bills,
    });
    return buildSettledStatementDiscrepancyReport({
      account,
      expenses,
      bills,
      ledger
    });
  }, [account, expenses, bills]);

  if (!account) {
    return <Text style={{ color: theme.colors.mutedForeground }}>Account not found</Text>;
  }

  if (!report || report.discrepancies.length === 0) {
    return (
      <View style={{ padding: 16, alignItems: "center" }}>
        <Text style={{ color: theme.colors.mutedForeground, textAlign: "center" }}>
          No settled statement discrepancies found. Everything balances!
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ gap: 16, padding: 16 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: theme.typography.lg, fontWeight: "600" }}>
        Settled Statement Discrepancies
      </Text>
      <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.sm }}>
        These statements are marked PAID, but the historical spend currently logged in their window differs from the billed amount.
      </Text>

      {report.discrepancies.map((d) => (
        <Card key={d.billId}>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>
                Statement {d.statementDate}
              </Text>
              <Text style={{ color: theme.colors.mutedForeground }}>
                {d.periodStart} → {d.periodEnd}
              </Text>
            </View>

            <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 4 }} />

            <Row label="Billed Amount" value={d.billedAmount} theme={theme} />
            <Row label="Current History Spend" value={d.historyAmount} theme={theme} />
            
            <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 4 }} />
            
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: theme.colors.destructive, fontWeight: "600" }}>Discrepancy</Text>
              <Amount value={Math.abs(d.discrepancyAmount)} />
            </View>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

function Row({ label, value, theme }: { label: string; value: number; theme: any }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ color: theme.colors.mutedForeground }}>{label}</Text>
      <Text style={{ color: theme.colors.foreground }}>{formatAmount(value, "INR")}</Text>
    </View>
  );
}
