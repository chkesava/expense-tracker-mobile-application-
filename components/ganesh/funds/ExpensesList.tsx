import { useCallback, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { Package, Receipt } from "lucide-react-native";

import { accountabilityText } from "@/components/ganesh/AccountabilityLine";
import { GaneshScreen, useGaneshListPadding } from "@/components/ganesh/GaneshScreen";
import { GaneshSignedPreview } from "@/components/ganesh/GaneshSignedPreview";
import { GaneshClosedBanner } from "@/components/ganesh/GaneshClosedBanner";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import {
  FilterChips,
  FundHero,
  GaneshHeader,
  LedgerRow,
  ListStateView,
  MetaLabel,
  Money,
  StatTile,
  useGaneshTokens,
  type LedgerRowBadge,
} from "@/components/ganesh/ui";
import { AddFab } from "@/components/ui/AddFab";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshExpenses } from "@/hooks/useGaneshExpenses";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePandalSponsors } from "@/hooks/usePandalSponsors";
import { useSponsorships } from "@/hooks/useSponsorships";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { ganeshStoredPath } from "@/services/ganesh/storage/storageService";
import type { GaneshExpense } from "@/shared/types/ganesh";
import { isAssetPurchaseExpense } from "@/shared/utils/ganeshAssets";
import { formatGaneshWhen, memberDisplayName } from "@/shared/utils/ganeshIdentity";
import { assetPurchaseAmountOf, regularExpenseAmount, totalExpenses } from "@/shared/utils/ganeshMath";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

type Filter = "all" | "god" | "personal" | "assets";

const FILTER_OPTIONS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "god", label: "God Fund" },
  { id: "personal", label: "Personal money" },
  { id: "assets", label: "Assets" },
];

export type ExpensesListProps = {
  embedded?: boolean;
  /** Festival chrome (cash position, ledger tabs) that scrolls with the list. */
  prefix?: ReactNode;
};

export function ExpensesList({ embedded = false, prefix }: ExpensesListProps) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push } = useRouter();
  const listPadding = useGaneshListPadding();

  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const {
    summary,
    loading: summaryLoading,
    error: summaryError,
    retry: retrySummary,
  } = useGaneshSummary(pandalId, festivalId);
  const { expenses, loading, error } = useGaneshExpenses(pandalId, festivalId);
  const { members } = usePandalMembers(pandalId);
  const { sponsors } = usePandalSponsors(pandalId);
  const { sponsorships } = useSponsorships(pandalId, festivalId);
  const { can } = useGaneshPermissions();

  const [filter, setFilter] = useState<Filter>("all");

  const canAdd = festival?.status === "open" && can("expenses.create");
  const openAdd = useCallback(() => push("/(ganesh)/add-expense" as never), [push]);
  const onOpen = useCallback(
    (id: string) => push(`/(ganesh)/expense/${id}` as never),
    [push]
  );

  const rows = useMemo(
    () =>
      expenses.filter((expense) => {
        if (expense.voided) return false;
        if (filter === "god") return expense.godFundAmount > 0;
        if (filter === "personal") return expense.personalAmount > 0;
        if (filter === "assets") return isAssetPurchaseExpense(expense);
        return true;
      }),
    [expenses, filter]
  );

  const renderItem = useCallback(
    ({ item }: { item: GaneshExpense }) => {
      const receiptPath = ganeshStoredPath(item.receipt, item.receiptPath);
      const linked = sponsorships.find((row) => row.id === item.linkedSponsorshipId);
      const sponsorName = sponsors.find((row) => row.id === linked?.sponsorId)?.name;
      const isAsset = isAssetPurchaseExpense(item);
      const isSplit = item.godFundAmount > 0 && item.personalAmount > 0;

      const badges: LedgerRowBadge[] = [];
      if (item.personalAmount > 0 && item.godFundAmount === 0) badges.push({ kind: "personal" });
      else if (isSplit) badges.push({ kind: "godFund", label: "Split funded" });
      else badges.push({ kind: "godFund" });
      if (isAsset) badges.push({ kind: "asset" });
      if (item.sponsoredAmount > 0) {
        badges.push({
          kind: "sponsored",
          label: sponsorName ? `Sponsored · ${sponsorName}` : "Sponsored",
        });
      }

      return (
        <LedgerRow
          id={item.id}
          icon={
            isAsset ? (
              <Package size={18} color={theme.colors.mutedForeground} strokeWidth={2.2} />
            ) : (
              <Receipt size={18} color={theme.colors.mutedForeground} strokeWidth={2.2} />
            )
          }
          title={item.name}
          meta={item.categoryName || undefined}
          badges={badges}
          amount={item.totalAmount}
          amountMeta={
            isSplit ? (
              <MetaLabel>
                {`God ${formatInr(item.godFundAmount)} · Own ${formatInr(item.personalAmount)}`}
              </MetaLabel>
            ) : undefined
          }
          attribution={accountabilityText({
            paidBy: memberDisplayName(members, item.paidByMemberId),
            enteredBy: memberDisplayName(members, item.createdBy),
          })}
          when={formatGaneshWhen(item.createdAt, item.date)}
          media={
            pandalId && festivalId && receiptPath ? (
              <GaneshSignedPreview path={receiptPath} pandalId={pandalId} festivalId={festivalId} />
            ) : null
          }
          pending={item.pendingWrite}
          onPress={onOpen}
        />
      );
    },
    [festivalId, members, onOpen, pandalId, sponsors, sponsorships, theme.colors.mutedForeground]
  );

  const chrome = (
    <>
      {embedded ? null : (
        <GaneshHeader
          title="Expenses"
          subtitle={festival?.name}
          icon={<Receipt size={22} color={g.saffron} strokeWidth={2.2} />}
          rightElement={<GaneshSyncChip />}
        />
      )}

      <GaneshClosedBanner />

      {/* GS-032: the list rows were gated on their own loading state, but the
          hero and tiles read the summary and consulted neither of its flags —
          so "Spent this festival" read a settled ₹0 while loading, and a
          permission-denied summary read as a Pandal that had spent nothing.
          On the tab a treasurer opens to check spending, that is a number they
          could act on. */}
      {embedded ? null : summaryLoading ? (
        <ListStateView loading title="Loading the festival totals" skeletonCount={3} />
      ) : summaryError ? (
        <ListStateView
          error={summaryError}
          onRetry={retrySummary}
          title="We couldn't load the festival totals."
          description="The spending figures are hidden until this loads — showing zero here would read as nothing spent."
        />
      ) : (
        <>
          <FundHero
            eyebrow="Spent this festival"
            amount={totalExpenses(summary)}
            kind="god"
            breakdown={[
              { label: "Regular", value: regularExpenseAmount(summary) },
              { label: "Assets", value: assetPurchaseAmountOf(summary) },
            ]}
          />

          <View style={styles.statRow}>
            <StatTile label="Personal money used">
              <Money value={summary.personalMoneyUsed} size="primary" numberOfLines={1} adjustsFontSizeToFit />
            </StatTile>
            <StatTile
              label="Pending reimbursement"
              meta={
                summary.pendingReimbursements > 0 ? (
                  <Text
                    style={[styles.tileMeta, { color: theme.colors.warning, fontFamily: theme.fontFamily.medium }]}
                  >
                    Owed back to members
                  </Text>
                ) : (
                  <Text
                    style={[
                      styles.tileMeta,
                      { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
                    ]}
                  >
                    All settled
                  </Text>
                )
              }
            >
              <Money
                value={summary.pendingReimbursements}
                size="primary"
                tone={summary.pendingReimbursements > 0 ? "warning" : "default"}
                numberOfLines={1}
                adjustsFontSizeToFit
              />
            </StatTile>
          </View>
        </>
      )}

      <FilterChips value={filter} options={FILTER_OPTIONS} onChange={setFilter} />
    </>
  );

  const list = (
    <FlashList
      data={rows}
      style={styles.list}
      keyboardShouldPersistTaps="handled"
      keyExtractor={(item) => item.id}
      getItemType={(item) => (isAssetPurchaseExpense(item) ? "asset" : "expense")}
      contentContainerStyle={{ paddingBottom: listPadding }}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={renderItem}
      ListHeaderComponent={
        embedded ? (
          <View style={styles.embeddedHeader}>
            {prefix}
            {chrome}
          </View>
        ) : undefined
      }
      ListEmptyComponent={
        <ListStateView
          loading={loading}
          error={error}
          illustration="expenses"
          title={filter === "all" ? "No expenses yet" : "Nothing in this filter"}
          description={
            filter === "all"
              ? "Record what the Pandal spends — from the God Fund, from someone's own pocket, or split between both."
              : "Try another filter to see the rest of this festival's spending."
          }
          action={canAdd && filter === "all" ? { label: "Add expense", onPress: openAdd } : undefined}
        />
      }
    />
  );

  const fab = canAdd ? (
    <View style={[styles.fab, { bottom: listPadding - 24 }]} pointerEvents="box-none">
      <AddFab onPress={openAdd} accessibilityLabel="Add expense" size="lg" />
    </View>
  ) : null;

  if (embedded) {
    return (
      <View style={styles.fill}>
        {list}
        {fab}
      </View>
    );
  }

  return (
    <GaneshScreen safeTop scroll={false} overlay={fab}>
      {chrome}
      {list}
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  embeddedHeader: {
    gap: 10,
    paddingBottom: 10,
  },
  separator: {
    height: 10,
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
  },
  tileMeta: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  fab: {
    position: "absolute",
    right: 16,
  },
});
