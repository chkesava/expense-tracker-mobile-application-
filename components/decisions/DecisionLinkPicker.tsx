import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Modal } from "@/components/common/Modal";
import { SearchBar } from "@/components/common/SearchBar";
import { Chip } from "@/components/ui/Chip";
import { useDecisionLinkSources } from "@/hooks/useDecisionLinkSources";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import type { DecisionLink } from "@/shared/types/decision";
import { newItemId } from "@/shared/utils/decisionForm";
import {
  LINK_NATURE_LABELS,
  accountLinkLabel,
  incomeNature,
  linkFromAccount,
  linkFromBorrowing,
  linkFromExpense,
  linkFromGoal,
  linkFromIncome,
  linkFromPayment,
  linkFromReceivable,
  linkFromSubscription,
  linkFromTransfer,
  sameLinkTarget,
  searchLinkableMovements,
  searchLinkableTransactions,
} from "@/shared/utils/decisionLinks";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

export type DecisionLinkTab = "transactions" | "accounts" | "loans" | "goals" | "recurring";

const TABS: Array<{ id: DecisionLinkTab; label: string }> = [
  { id: "transactions", label: "Transactions" },
  { id: "accounts", label: "Accounts & cards" },
  { id: "loans", label: "Loans & lent" },
  { id: "goals", label: "Goals" },
  { id: "recurring", label: "Recurring" },
];

/**
 * Pick an existing Spendly record to reference (SPENDLY-363, widened in 366).
 * Only a reference is kept — the record stays in its own module, unchanged,
 * and its amount is never counted as part of the decision.
 */
export function DecisionLinkPicker({
  isOpen,
  links,
  onAdd,
  onClose,
  initialTab = "transactions",
}: {
  /** Which list opens first (SPENDLY-364 templates suggest one). */
  initialTab?: DecisionLinkTab;
  isOpen: boolean;
  links: readonly DecisionLink[];
  onAdd: (link: DecisionLink) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const currency = useDisplayCurrency();
  const s = useDecisionLinkSources();
  const [tab, setTab] = useState<DecisionLinkTab>(initialTab);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (isOpen) setTab(initialTab);
  }, [isOpen, initialTab]);

  const transactions = useMemo(() => (tab === "transactions" ? searchLinkableTransactions(s.expenses, s.incomes, query) : []), [tab, s.expenses, s.incomes, query]);
  const movements = useMemo(() => (tab === "transactions" ? searchLinkableMovements(s.payments, s.transfers, query) : []), [tab, s.payments, s.transfers, query]);
  const linked = (c: Pick<DecisionLink, "kind" | "refId" | "refKind">) => links.some((l) => sameLinkTarget(l, c));
  const pick = (link: DecisionLink) => {
    onAdd(link);
    onClose();
  };

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

  const empty = (text: string) => (
    <Text style={{ padding: theme.space.lg, color: theme.colors.mutedForeground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.regular }}>{text}</Text>
  );
  const now = () => Date.now();

  let list: React.ReactNode;
  if (tab === "transactions") {
    const rows = [
      ...transactions.map(({ kind, row: t }) =>
        kind === "expense"
          ? row(`e:${t.id}`, t.note?.trim() || (t as { category: string }).category, `${LINK_NATURE_LABELS.spend} · ${t.date}`, t.amount, linked({ kind: "transaction", refId: t.id, refKind: "expense" }), () => pick(linkFromExpense(t as never, newItemId(), now())))
          : row(`i:${t.id}`, t.note?.trim() || (t as { source: string }).source, `${LINK_NATURE_LABELS[incomeNature(t as never)]} · ${t.date}`, t.amount, linked({ kind: "transaction", refId: t.id, refKind: "income" }), () => pick(linkFromIncome(t as never, newItemId(), now())))
      ),
      ...movements.map(({ kind, row: m }) =>
        kind === "payment"
          ? row(`p:${m.id}`, m.note?.trim() || ((m as { sourceType?: string }).sourceType === "cashback" ? "Cashback" : "Card bill payment"), `${LINK_NATURE_LABELS[(m as { sourceType?: string }).sourceType === "cashback" ? "cashback" : "bill_payment"]} · ${m.date}`, m.amount, linked({ kind: "transaction", refId: m.id, refKind: "payment" }), () => pick(linkFromPayment(m as never, newItemId(), now())))
          : row(`t:${m.id}`, m.note?.trim() || "Transfer", `${LINK_NATURE_LABELS.transfer} · ${m.date}`, m.amount, linked({ kind: "transaction", refId: m.id, refKind: "transfer" }), () => pick(linkFromTransfer(m as never, newItemId(), now())))
      ),
    ];
    list = rows.length ? rows : empty("No matching transactions.");
  } else if (tab === "accounts") {
    list = s.accounts.length
      ? s.accounts.map((a) => row(a.id, accountLinkLabel(a), a.institutionName ?? LINK_NATURE_LABELS.account, null, linked({ kind: "account", refId: a.id }), () => pick(linkFromAccount(a, newItemId(), now()))))
      : empty("No accounts yet.");
  } else if (tab === "loans") {
    const rows = [
      ...s.borrowings.filter((b): b is typeof b & { id: string } => Boolean(b.id)).map((b) => row(`b:${b.id}`, `Loan from ${b.lenderName}`, `${LINK_NATURE_LABELS.loan} · since ${b.borrowedDate}`, b.principalAmount, linked({ kind: "borrowing", refId: b.id }), () => pick(linkFromBorrowing(b, newItemId(), now())))),
      ...s.receivables.filter((r): r is typeof r & { id: string } => Boolean(r.id)).map((r) => row(`r:${r.id}`, `Lent to ${r.personName}`, `${LINK_NATURE_LABELS.lent} · ${r.lentDate}`, r.originalAmount, linked({ kind: "receivable", refId: r.id }), () => pick(linkFromReceivable(r, newItemId(), now())))),
    ];
    list = rows.length ? rows : empty("No loans or money lent recorded.");
  } else if (tab === "goals") {
    list = s.goals.length
      ? s.goals.map((g) => row(g.id, g.name, `${LINK_NATURE_LABELS.goal}${g.deadline ? ` · by ${g.deadline}` : ""}`, g.targetAmount, linked({ kind: "goal", refId: g.id }), () => pick(linkFromGoal(g, newItemId(), now()))))
      : empty("No goals yet.");
  } else {
    const subs = s.subscriptions.filter((x): x is typeof x & { id: string } => Boolean(x.id));
    list = subs.length
      ? subs.map((x) => row(x.id, x.name, `${x.type === "emi" ? "EMI" : x.type === "transfer" ? "Auto-transfer" : "Subscription"}${x.isActive ? "" : " · paused"}`, x.amount, linked({ kind: "subscription", refId: x.id }), () => pick(linkFromSubscription(x, newItemId(), now()))))
      : empty("No recurring payments yet.");
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Link a Spendly record" density="compact">
      <View style={{ gap: theme.space.md }}>
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          Linking keeps a reference only. The record stays where it is, is never changed, and its amount is never counted in the decision.
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }} accessibilityRole="tablist">
          {TABS.map((t) => (
            <Chip key={t.id} label={t.label} size="sm" selected={tab === t.id} onPress={() => setTab(t.id)} accessibilityRole="tab" />
          ))}
        </ScrollView>
        {tab === "transactions" ? <SearchBar value={query} onChangeText={setQuery} placeholder="Search by description or amount" /> : null}
        {tab === "transactions" && !s.ready.transaction ? (
          <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>Still loading older transactions…</Text>
        ) : null}
        <View style={{ marginHorizontal: -theme.space.lg }}>{list}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
});
