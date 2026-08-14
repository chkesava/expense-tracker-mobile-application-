import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Plus } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { SearchBar } from "@/components/common/SearchBar";
import { SkeletonCard } from "@/components/common/Skeleton";
import { CreateReceivableModal } from "@/components/receivables/CreateReceivableModal";
import { ReceivableCard } from "@/components/receivables/ReceivableCard";
import { ReceivableDetailModal } from "@/components/receivables/ReceivableDetailModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useReceivables } from "@/hooks/useReceivables";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Receivable, ReceivableStatus } from "@/shared/types/receivable";
import { summarizeReceivables } from "@/shared/utils/receivableMath";
import { todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

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
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();

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
    cancelReceivable,
  } = useReceivables();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const pillStyle = (isActive: boolean) => ({
    backgroundColor: isActive
      ? theme.colors.primary
      : isDark
        ? "rgba(255,255,255,0.06)"
        : "rgba(0,0,0,0.04)",
    borderColor: isActive ? theme.colors.primary : theme.colors.border,
  });

  const pillTextStyle = (isActive: boolean) => ({
    color: isActive ? theme.colors.primaryForeground : theme.colors.foreground,
    fontWeight: isActive ? ("700" as const) : ("500" as const),
  });

  return (
    <View style={styles.container}>
      {receivables.length > 0 ? (
        <Card style={styles.summaryCard}>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCell}>
              <Text
                style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}
              >
                TOTAL LENT
              </Text>
              <Amount
                value={portfolio.totalLent}
                currency={system.defaultCurrency}
                style={{
                  fontSize: 18,
                  fontWeight: "900",
                  color: theme.colors.foreground,
                }}
              />
            </View>

            <View style={styles.summaryCell}>
              <Text
                style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}
              >
                OUTSTANDING
              </Text>
              <Amount
                value={portfolio.totalOutstanding}
                currency={system.defaultCurrency}
                style={{ fontSize: 18, fontWeight: "900", color: "#EF4444" }}
              />
            </View>

            <View style={styles.summaryCell}>
              <Text
                style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}
              >
                RECEIVED
              </Text>
              <Amount
                value={portfolio.totalReceived}
                currency={system.defaultCurrency}
                style={{ fontSize: 18, fontWeight: "900", color: "#10B981" }}
              />
            </View>
          </View>

          {portfolio.overdueCount > 0 ? (
            <Text style={[styles.overdueNote, { color: "#EF4444" }]}>
              {portfolio.overdueCount} receivable
              {portfolio.overdueCount === 1 ? "" : "s"} past the due date
            </Text>
          ) : null}
        </Card>
      ) : null}

      {receivables.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillRow}
        >
          {STATUS_FILTERS.map((filter) => {
            const isActive = statusFilter === filter.id;
            return (
              <Pressable
                key={filter.id}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  setStatusFilter(filter.id);
                }}
                style={[styles.pill, pillStyle(isActive)]}
              >
                <Text style={[styles.pillText, pillTextStyle(isActive)]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
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
            icon: <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />,
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
                currency={system.defaultCurrency}
                onPress={() => setSelectedId(receivable.id ?? null)}
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
        currency={system.defaultCurrency}
        onClose={() => setSelectedId(null)}
        onAddRepayment={addRepayment}
        onDeleteRepayment={deleteRepayment}
        onUpdateReceivable={updateReceivable}
        onMarkSettled={markSettled}
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
  summaryCard: {
    borderRadius: 18,
    borderCurve: "continuous",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 14,
  },
  summaryCell: {
    width: "50%",
    gap: 2,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  overdueNote: {
    fontSize: 11,
    fontWeight: "700",
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
