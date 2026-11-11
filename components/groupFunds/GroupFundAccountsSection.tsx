import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";

import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { Section, StatusStrip } from "@/components/dashboard/primitives";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import type { GroupFund } from "@/shared/types/groupFund";
import { reconcileHeldByAccount } from "@/shared/utils/groupFundMath";
import { useTheme } from "@/theme/ThemeProvider";

export type GroupFundAccountsSectionProps = {
  fund: GroupFund;
  /** Every fund, so an account shared by several funds is checked once, in full. */
  allFunds: readonly GroupFund[];
  /** Account id → name and stored balance (null when the account has none yet). */
  accounts: ReadonlyMap<string, { name: string; balance: number | null }>;
  currency: string;
};

/**
 * SPENDLY-688 (feature 7): where this fund's money sits, checked against each
 * account's real balance. If the group money recorded in an account (across
 * all funds) is more than the account holds, say so: usually a payout from
 * the wrong account, or a contribution that never arrived. Stored figures only.
 */
export function GroupFundAccountsSection({ fund, allFunds, accounts, currency }: GroupFundAccountsSectionProps) {
  const { theme } = useTheme();
  const money = useGhostMoney(currency);
  const balances = useMemo(() => new Map([...accounts].map(([id, a]) => [id, a.balance])), [accounts]);
  const acrossFunds = useMemo(() => new Map(reconcileHeldByAccount(allFunds, balances).map((r) => [r.accountId, r])), [allFunds, balances]);
  const rows = Object.entries(fund.heldByAccount).filter(([, amount]) => Math.abs(amount) > 0.005);
  const unattributed = Math.round((fund.totals.held - rows.reduce((sum, [, amount]) => sum + amount, 0)) * 100) / 100;
  const muted = { color: theme.colors.mutedForeground };

  if (rows.length === 0 && Math.abs(unattributed) <= 0.005) return null;

  return (
    <Section title="Where the money is" subtitle="This fund's money in each account, checked against its balance">
      <View>
        {rows.map(([accountId, amount], i) => {
          const account = accounts.get(accountId);
          const check = acrossFunds.get(accountId);
          const short = check && check.shortfall > 0.005;
          return (
            <View
              key={accountId}
              style={[styles.row, i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}
            >
              <View style={styles.flex}>
                <Text style={[styles.name, { color: theme.colors.foreground }]}>{account?.name ?? "Deleted account"}</Text>
                <Text style={[styles.detail, muted]}>
                  {!account
                    ? "This account no longer exists"
                    : account.balance === null
                      ? "Balance not set up yet, so it can't be checked"
                      : `Balance ${money(account.balance)}`}
                  {check && Math.abs(check.held - amount) > 0.005 ? ` · ${money(check.held)} held across all funds` : ""}
                </Text>
                {short ? (
                  <View style={styles.warning}>
                    <StatusStrip
                      tone="negative"
                      icon={<AlertTriangle size={14} color={theme.colors.destructive} strokeWidth={2.4} />}
                      message={`${money(check!.shortfall)} more is recorded as held here than the account has. Check for a payout from the wrong account or a contribution that never arrived.`}
                    />
                  </View>
                ) : null}
              </View>
              <FinancialAmount value={amount} currency={currency} size="sm" weight="bold" />
            </View>
          );
        })}
        {Math.abs(unattributed) > 0.005 ? (
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={[styles.name, { color: theme.colors.foreground }]}>Not in a tracked account</Text>
              <Text style={[styles.detail, muted]}>Opening money recorded without an account</Text>
            </View>
            <FinancialAmount value={unattributed} currency={currency} size="sm" weight="bold" tone="muted" />
          </View>
        ) : null}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10 },
  name: { fontSize: 14, fontWeight: "600" },
  detail: { fontSize: 12, marginTop: 2 },
  warning: { marginTop: 8 },
  flex: { flex: 1 },
});
