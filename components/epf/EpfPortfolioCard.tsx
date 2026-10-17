import { StyleSheet, Text, View } from "react-native";
import { PiggyBank } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useEpfNetWorth } from "@/hooks/useEpfNetWorth";
import { useTheme } from "@/theme/ThemeProvider";

import { withAlpha } from "@/theme/surfaces";
import { Section } from "@/components/dashboard/primitives";
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

  if (!hasProfile || loading || !summary || summary.currentBalance === 0) return null;

  // SPENDLY-544: the EPF summary doc is built with Firestore `increment()`,
  // which only writes a total once it moves, so a user with no interest or
  // adjustments yet has no such field and the card showed "₹NaN" (and an
  // Adjustments row, since undefined !== 0). A missing total means nothing
  // was recorded, i.e. 0. Display only; the stored summary is unchanged.
  const total = (value: number | undefined) => (Number.isFinite(value) ? (value as number) : 0);

  const rows: { key: string; label: string; value: number; hint?: string }[] = [
    { key: "employee", label: "Your contributions", value: total(summary.employeeContributionTotal) },
    { key: "employer", label: "Employer's share", value: total(summary.employerContributionTotal) },
    { key: "interest", label: "Interest", value: total(summary.interestTotal) },
  ];

  if (total(summary.adjustmentsTotal) !== 0) {
    rows.push({ key: "adjustments", label: "Adjustments", value: total(summary.adjustmentsTotal) });
  }

  return (
    <Section>
      <View style={styles.header}>
        <View style={[styles.iconBadge, { backgroundColor: withAlpha(theme.colors.success, 0.1) }]}>
          <PiggyBank size={theme.iconSize.md} color={theme.colors.success} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            Total EPF
          </Text>
          <Amount
            value={summary.currentBalance}
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
    </Section>
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
