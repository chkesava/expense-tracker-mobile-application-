import { StyleSheet, Text, View } from "react-native";
import { PiggyBank } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useEpfNetWorth } from "@/hooks/useEpfNetWorth";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Total EPF across every employer — KAN-71.
 *
 * Everything before this ticket was per-establishment, so someone with three
 * employers saw three numbers and no sum. This is the sum, and it makes the
 * establishment list below read as its breakdown.
 *
 * Uses `Amount` rather than the local `money` helper the other EPF components
 * use, so ghost mode works here as it does everywhere else on a summary screen.
 */
export function EpfPortfolioCard() {
  const { theme } = useTheme();
  const currency = useDisplayCurrency();
  const { summary, hasProfile, loading } = useEpfNetWorth();

  if (!hasProfile || loading || summary.establishmentCount === 0) return null;

  const rows: { key: string; label: string; value: number; hint?: string }[] = [
    { key: "employee", label: "Your contributions", value: summary.employeeShare },
    { key: "employer", label: "Employer's share", value: summary.employerEpfShare },
    { key: "interest", label: "Interest", value: summary.interest },
  ];

  if (summary.netTransfers !== 0) {
    rows.push({ key: "transfers", label: "Net transfers", value: summary.netTransfers });
  }
  if (summary.adjustments !== 0) {
    rows.push({ key: "adjustments", label: "Adjustments", value: summary.adjustments });
  }

  return (
    <Card>
      <View style={styles.header}>
        <View style={[styles.iconBadge, { backgroundColor: theme.colors.success + "1A" }]}>
          <PiggyBank size={theme.iconSize.md} color={theme.colors.success} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            Total EPF · {summary.establishmentCount} employer
            {summary.establishmentCount === 1 ? "" : "s"}
          </Text>
          <Amount
            value={summary.total}
            currency={currency}
            ghostable
            style={{
              fontSize: 26,
              fontWeight: "700",
              color: theme.colors.foreground,
            }}
          />
        </View>
      </View>

      <View style={[styles.rows, { borderTopColor: theme.colors.border }]}>
        {rows.map((row) => (
          <View key={row.key} style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.colors.mutedForeground }]}>
              {row.label}
            </Text>
            <Amount
              value={Math.abs(row.value)}
              currency={currency}
              prefix={row.value < 0 ? "-" : undefined}
              ghostable
              style={{ fontSize: 13, fontWeight: "600", color: theme.colors.foreground }}
            />
          </View>
        ))}
      </View>

      {/* EPS is pension, not provident fund. Showing it inside the balance
          would be exactly the conflation KAN-66 introduced epfCredit to stop. */}
      {summary.epsShare > 0 ? (
        <View style={[styles.epsRow, { borderTopColor: theme.colors.border }]}>
          <View style={styles.epsText}>
            <Text style={[styles.rowLabel, { color: theme.colors.mutedForeground }]}>
              Pension (EPS)
            </Text>
            <Text style={[styles.epsHint, { color: theme.colors.mutedForeground }]}>
              Held separately by EPFO — not part of the balance above.
            </Text>
          </View>
          <Amount
            value={summary.epsShare}
            currency={currency}
            ghostable
            style={{ fontSize: 13, fontWeight: "600", color: theme.colors.mutedForeground }}
          />
        </View>
      ) : null}

      <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
        {summary.simulated
          ? `Simulated from what you have recorded. ${summary.unreconciledCount} month${
              summary.unreconciledCount === 1 ? "" : "s"
            } not yet confirmed against your EPFO passbook.`
          : summary.lastReconciledAt
            ? `Confirmed against EPFO on ${summary.lastReconciledAt}.`
            : "Simulated from what you have recorded."}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, gap: 2 },
  label: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  rows: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabel: { fontSize: 13 },
  epsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  epsText: { flex: 1, gap: 2 },
  epsHint: { fontSize: 11, lineHeight: 16 },
  note: { fontSize: 12, lineHeight: 18, marginTop: 12 },
});
