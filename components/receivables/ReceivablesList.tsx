import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { AlertTriangle, HandCoins, Plus } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { SearchBar } from "@/components/common/SearchBar";
import { SkeletonCard } from "@/components/common/Skeleton";
import { CreateReceivableModal } from "@/components/receivables/CreateReceivableModal";
import { ReceivableCard } from "@/components/receivables/ReceivableCard";
import { ReceivableDetailModal } from "@/components/receivables/ReceivableDetailModal";
import { useOpenFromRouteParam } from "@/hooks/useOpenFromRouteParam";
import { Button } from "@/components/ui/Button";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import {
  HeroSection,
  MetaLabel,
  StatTile,
  StatusStrip,
} from "@/components/dashboard/primitives";
import { useReceivables } from "@/hooks/useReceivables";
import type { Receivable, ReceivableStatus } from "@/shared/types/receivable";
import { summarizeReceivables } from "@/shared/utils/receivableMath";
import { todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";

import { Chip } from "@/components/ui/Chip";
type StatusFilter = "all" | "outstanding" | ReceivableStatus;

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "outstanding", label: "Outstanding" },
  { id: "ACTIVE", label: "Active" },
  { id: "PARTIALLY_SETTLED", label: "Partial" },
  { id: "OVERDUE", label: "Overdue" },
  { id: "FULLY_SETTLED", label: "Settled" },
  { id: "CANCELLED", label: "Cancelled" },
];

export function ReceivablesList() {
  const { theme } = useTheme();
  const displayCurrency = useDisplayCurrency();

  const {
    receivables,
    repayments,
    loading,
    summaries,
    getSummary,
    getRepayments,
    createReceivable,
    updateReceivable,
    deleteReceivable,
    addRepayment,
    deleteRepayment,
    markSettled,
    waiveInterest,
    cancelReceivable,
  } = useReceivables();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [startRepaying, setStartRepaying] = useState(false);

  // SPENDLY-181: `/ledger?tab=receivables&id=…` opens this receivable's detail.
  useOpenFromRouteParam(!loading, (id) => {
    if (!receivables.some((r) => r.id === id)) return false;
    setStartRepaying(false);
    setSelectedId(id);
    return true;
  });

  const today = todayDateKey();

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return receivables.filter((receivable) => {
      if (!receivable.id) return false;
      const summary = summaries.get(receivable.id);
      if (!summary) return false;

      if (statusFilter === "outstanding") {
        if (summary.outstandingAmount <= 0 || summary.status === "CANCELLED") {
          return false;
        }
      } else if (statusFilter !== "all" && summary.status !== statusFilter) {
        return false;
      }

      if (!q) return true;
      return (
        receivable.personName.toLowerCase().includes(q) ||
        (receivable.purpose ?? "").toLowerCase().includes(q) ||
        (receivable.note ?? "").toLowerCase().includes(q)
      );
    });
  }, [receivables, summaries, statusFilter, searchQuery]);

  const portfolio = useMemo(
    () => summarizeReceivables(filtered, repayments, today),
    [filtered, repayments, today]
  );

  const selectedReceivable: Receivable | null = useMemo(
    () => receivables.find((r) => r.id === selectedId) ?? null,
    [receivables, selectedId]
  );

  return (
    <View style={styles.container}>
      {receivables.length > 0 ? (
        // SPENDLY-536: the deep hero, as on Borrowings. Every figure is
        // ghost-safe now; the interest line had printed a bare number.
        <HeroSection
          variant="deep"
          title="Money lent"
          subtitle="Still to come back to you"
          icon={<HandCoins size={16} color={theme.colors.primary} strokeWidth={2.3} />}
        >
          <MetaLabel>Total receivable</MetaLabel>
          <FinancialAmount value={portfolio.totalOutstanding} currency={displayCurrency} size="hero" weight="bold" />
          {portfolio.totalInterest > 0 ? (
            <View style={styles.interestLine}>
              <MetaLabel>Includes accrued interest</MetaLabel>
              <FinancialAmount value={portfolio.totalInterest} currency={displayCurrency} size="xs" tone="muted" />
            </View>
          ) : null}

          <View style={styles.summaryTiles}>
            <StatTile label="Overdue" style={styles.summaryTile}>
              <FinancialAmount
                value={portfolio.overdueAmount}
                currency={displayCurrency}
                size="sm"
                weight="bold"
                tone={portfolio.overdueAmount > 0 ? "negative" : "default"}
              />
            </StatTile>
            <StatTile label="Due this month" style={styles.summaryTile}>
              <FinancialAmount value={portfolio.dueThisMonthAmount} currency={displayCurrency} size="sm" weight="bold" />
            </StatTile>
            <StatTile label="Repaid" style={styles.summaryTile}>
              <FinancialAmount value={portfolio.totalReceived} currency={displayCurrency} size="sm" weight="bold" tone="positive" />
            </StatTile>
          </View>

          {portfolio.overdueCount > 0 ? (
            <View style={styles.overdueStrip}>
              <StatusStrip
                tone="negative"
                icon={<AlertTriangle size={14} color={theme.colors.destructive} strokeWidth={2.4} />}
                message={`${portfolio.overdueCount} receivable${portfolio.overdueCount === 1 ? "" : "s"} past the due date`}
              />
            </View>
          ) : null}
        </HeroSection>
      ) : null}

      {receivables.length > 0 ? (
        <HorizontalSwipeBoundary>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillRow}
          >
            {STATUS_FILTERS.map((filter) => {
              const isActive = statusFilter === filter.id;
              return (
                <Chip
                  key={filter.id}
                  label={filter.label}
                  selected={isActive}
                  onPress={() => setStatusFilter(filter.id)}
                />
              );
            })}
          </ScrollView>
        </HorizontalSwipeBoundary>
      ) : null}

      {receivables.length > 2 ? (
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by person..."
        />
      ) : null}

      {receivables.length > 0 ? (
        <Button onPress={() => setIsCreateOpen(true)} variant="outline">
          <Plus size={16} color={theme.colors.foreground} />
          <Text style={{ fontWeight: "700", color: theme.colors.foreground }}>
            Record Money Lent
          </Text>
        </Button>
      ) : null}

      {loading ? (
        <View style={{ gap: 12 }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          illustration="general"
          title={
            receivables.length === 0
              ? "No Money Lent Tracked"
              : "No Matching Receivables"
          }
          description={
            receivables.length === 0
              ? "Track money you lend to friends, family, colleagues or customers, with repayments as they come in."
              : "Try a different status or search term."
          }
          primaryAction={{
            label: "Record Money Lent",
            icon: <Plus size={16} color={theme.colors.primaryForeground} strokeWidth={2.4} />,
            onPress: () => setIsCreateOpen(true),
          }}
          secondaryAction={
            receivables.length > 0
              ? {
                  label: "Clear Filters",
                  onPress: () => {
                    setStatusFilter("all");
                    setSearchQuery("");
                  },
                }
              : undefined
          }
          tip="Lent money decreases your account balance but is recorded as a receivable asset, never as an expense."
        />
      ) : (
        <View style={{ gap: 12 }}>
          {filtered.map((receivable) => {
            const summary = receivable.id ? summaries.get(receivable.id) : null;
            if (!receivable.id || !summary) return null;
            return (
              <ReceivableCard
                key={receivable.id}
                receivable={receivable}
                summary={summary}
                currency={displayCurrency}
                onPress={() => {
                  setStartRepaying(false);
                  setSelectedId(receivable.id ?? null);
                }}
                onRecordRepayment={() => {
                  setStartRepaying(true);
                  setSelectedId(receivable.id ?? null);
                }}
              />
            );
          })}
        </View>
      )}

      <CreateReceivableModal
        visible={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={createReceivable}
      />

      <ReceivableDetailModal
        visible={!!selectedReceivable}
        receivable={selectedReceivable}
        summary={selectedId ? getSummary(selectedId) : null}
        repayments={selectedId ? getRepayments(selectedId) : []}
        currency={displayCurrency}
        startRepaying={startRepaying}
        onClose={() => {
          setSelectedId(null);
          setStartRepaying(false);
        }}
        onAddRepayment={addRepayment}
        onDeleteRepayment={deleteRepayment}
        onUpdateReceivable={updateReceivable}
        onMarkSettled={markSettled}
        onWaiveInterest={waiveInterest}
        onCancelReceivable={cancelReceivable}
        onDeleteReceivable={async (id) => {
          const ok = await deleteReceivable(id);
          if (ok) setSelectedId(null);
          return ok;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  interestLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  summaryTiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  summaryTile: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 90,
  },
  overdueStrip: {
    marginTop: 12,
  },
  pillRow: {
    flexDirection: "row",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
  },
});
