import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Modal } from "@/components/common/Modal";
import { SearchBar } from "@/components/common/SearchBar";
import { Chip } from "@/components/ui/Chip";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useAccountsContext, useExpensesContext, useIncomesContext } from "@/providers/FinanceDataProvider";
import type { DecisionLink } from "@/shared/types/decision";
import { newItemId } from "@/shared/utils/decisionForm";
import {
  accountLinkLabel,
  linkFromAccount,
  linkFromExpense,
  linkFromIncome,
  sameLinkTarget,
  searchLinkableTransactions,
} from "@/shared/utils/decisionLinks";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Pick an existing account or transaction to reference (SPENDLY-363).
 * Only a reference is kept — the record stays where it is, unchanged.
 */
export function DecisionLinkPicker({
  isOpen,
  links,
  onAdd,
  onClose,
  initialTab = "transactions",
}: {
  /** Which list opens first (SPENDLY-364 templates suggest one). */
  initialTab?: "transactions" | "accounts";
  isOpen: boolean;
  links: readonly DecisionLink[];
  onAdd: (link: DecisionLink) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const currency = useDisplayCurrency();
  const { accounts } = useAccountsContext();
  const { expenses, expensesComplete } = useExpensesContext();
  const { incomes } = useIncomesContext();
  const [tab, setTab] = useState<"transactions" | "accounts">(initialTab);
  useEffect(() => {
    if (isOpen) setTab(initialTab);
  }, [isOpen, initialTab]);
  const [query, setQuery] = useState("");

  const results = useMemo(() => (tab === "transactions" ? searchLinkableTransactions(expenses, incomes, query) : []), [tab, expenses, incomes, query]);
  const linked = (candidate: Pick<DecisionLink, "kind" | "refId" | "refKind">) => links.some((l) => sameLinkTarget(l, candidate));

  const row = (key: string, title: string, sub: string, amount: number | null, isLinked: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      disabled={isLinked}
      accessibilityRole="button"
      accessibilityState={{ disabled: isLinked }}
      accessibilityLabel={`${title}. ${sub}${isLinked ? ". Already linked" : ""}`}
      style={({ pressed }) => [styles.row, { gap: theme.space.md, borderBottomColor: surfaces.divider, backgroundColor: pressed ? surfaces.tile : "transparent" }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.sm }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>{sub}</Text>
      </View>
      {amount !== null ? <Amount value={amount} currency={currency} ghostable style={{ color: theme.colors.foreground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.semibold }} /> : null}
      {isLinked ? <Check size={16} color={theme.colors.success} /> : null}
    </Pressable>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Link a Spendly record" density="compact">
      <View style={{ gap: theme.space.md }}>
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          Linking keeps a reference only. The record stays where it is and is never changed or counted twice.
        </Text>
        <View style={[styles.tabs, { gap: theme.space.sm }]} accessibilityRole="tablist">
          <Chip label="Transactions" selected={tab === "transactions"} onPress={() => setTab("transactions")} accessibilityRole="tab" />
          <Chip label="Accounts & cards" selected={tab === "accounts"} onPress={() => setTab("accounts")} accessibilityRole="tab" />
        </View>

        {tab === "transactions" ? (
          <>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Search by description, category or amount" />
            {!expensesComplete ? (
              <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
                Still loading older transactions…
              </Text>
            ) : null}
            <View style={{ marginHorizontal: -theme.space.lg }}>
              {results.length === 0 ? (
                <Text style={{ padding: theme.space.lg, color: theme.colors.mutedForeground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.regular }}>
                  No matching transactions.
                </Text>
              ) : (
                results.map(({ kind, row: t }) =>
                  row(
                    `${kind}:${t.id}`,
                    t.note?.trim() || (kind === "expense" ? (t as { category: string }).category : (t as { source: string }).source),
                    `${kind === "expense" ? "Expense" : "Income"} · ${t.date}`,
                    t.amount,
                    linked({ kind: "transaction", refId: t.id, refKind: kind }),
                    () => {
                      onAdd(kind === "expense" ? linkFromExpense(t as never, newItemId(), Date.now()) : linkFromIncome(t as never, newItemId(), Date.now()));
                      onClose();
                    }
                  )
                )
              )}
            </View>
          </>
        ) : (
          <View style={{ marginHorizontal: -theme.space.lg }}>
            {accounts.length === 0 ? (
              <Text style={{ padding: theme.space.lg, color: theme.colors.mutedForeground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.regular }}>
                No accounts yet.
              </Text>
            ) : (
              accounts.map((a) =>
                row(a.id, accountLinkLabel(a), a.institutionName ?? "Account", null, linked({ kind: "account", refId: a.id }), () => {
                  onAdd(linkFromAccount(a, newItemId(), Date.now()));
                  onClose();
                })
              )
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row" },
  row: { flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
});
