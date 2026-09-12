import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { EpfTransferDetailModal } from "@/components/epf/EpfTransferDetailModal";
import { EpfTransferFormModal } from "@/components/epf/EpfTransferFormModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useEpfContributions } from "@/hooks/useEpfContributions";
import { useEpfInterest } from "@/hooks/useEpfInterest";
import { useEpfTransfers } from "@/hooks/useEpfTransfers";
import type { EpfEstablishment } from "@/shared/features/epf/types";
import {
  establishmentBalance,
  summariseTransfers,
  transferStatusMeta,
  transfersForEstablishment,
} from "@/shared/features/epf/utils/transfers";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";
import { statusToneKey } from "@/shared/features/epf/utils/present";
import { combineEpfLoad } from "@/shared/features/epf/utils/loadState";

/**
 * Transfers touching one establishment — KAN-69.
 *
 * Shows the balance this employer holds after transfers, which is the number
 * the whole ticket exists to make correct.
 */
export function EpfTransfersList({
  establishment,
  establishments,
}: {
  establishment: EpfEstablishment;
  establishments: EpfEstablishment[];
}) {
  const { theme } = useTheme();
  const currency = useDisplayCurrency();

  const {
    transfers,
    transfersLoading,
    transfersError,
    retryTransfers,
    createTransfer,
    completeTransfer,
    failTransfer,
    reverseTransfer,
    reconcileTransfer,
  } = useEpfTransfers();
  const { contributions, contributionsLoading, contributionsError, retryContributions } =
    useEpfContributions(establishment.id);
  const {
    interestEntries,
    reconciliations,
    interestLoading,
    interestError,
    retryInterest,
  } = useEpfInterest();

  // Transferable balance is computed from all three sources. Interest was
  // previously read without ever checking whether it had loaded or failed, so
  // the screen could understate what the user was allowed to move (KAN-73).
  const load = combineEpfLoad([
    { loading: transfersLoading, error: transfersError, retry: retryTransfers },
    { loading: contributionsLoading, error: contributionsError, retry: retryContributions },
    { loading: interestLoading, error: interestError, retry: retryInterest },
  ]);

  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const money = useCallback((value: number) => formatAmount(value, currency), [currency]);

  const rows = useMemo(
    () => transfersForEstablishment(transfers, establishment.id),
    [transfers, establishment.id]
  );
  const summary = useMemo(
    () => summariseTransfers(transfers, establishment.id),
    [transfers, establishment.id]
  );
  const balance = useMemo(
    () =>
      establishmentBalance({
        contributions,
        transfers,
        establishmentId: establishment.id,
        interestEntries,
        adjustments: reconciliations,
      }),
    [contributions, transfers, establishment.id, interestEntries, reconciliations]
  );

  const detail = useMemo(
    () => rows.find((row) => row.id === detailId) ?? null,
    [rows, detailId]
  );

  const nameFor = useCallback(
    (id: string) => establishments.find((item) => item.id === id)?.employerName ?? "Unknown",
    [establishments]
  );

  if (load.loading) {
    return (
      <View style={styles.container}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  if (load.error) {
    return (
      <ErrorState
        title="Couldn't load transfers"
        description={load.error.message}
        onRetry={load.retryAll}
      />
    );
  }

  const header = (
    <View style={styles.header}>
      <Card>
        <Text style={[styles.balanceLabel, { color: theme.colors.mutedForeground }]}>
          Balance at {establishment.employerName}
        </Text>
        <Text style={[styles.balanceValue, { color: theme.colors.foreground }]}>
          {money(balance)}
        </Text>
        <Text style={[styles.balanceHint, { color: theme.colors.mutedForeground }]}>
          {money(summary.transferredIn)} in · {money(summary.transferredOut)} out
          {summary.pending > 0 ? ` · ${summary.pending} pending` : ""}
        </Text>
      </Card>

      <Button variant="secondary" size="sm" onPress={() => setFormOpen(true)}>
        <View style={styles.addLabel}>
          <Plus size={theme.iconSize.sm} color={theme.colors.foreground} />
          <Text style={[styles.addText, { color: theme.colors.foreground }]}>
            Record a transfer
          </Text>
        </View>
      </Button>
    </View>
  );

  const modals = (
    <>
      <EpfTransferFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        establishments={establishments}
        contributions={contributions}
        transfers={transfers}
        interestEntries={interestEntries}
        adjustments={reconciliations}
        currency={currency}
        defaultSourceId={establishment.id}
        onSubmit={createTransfer}
      />
      <EpfTransferDetailModal
        isOpen={detailId !== null}
        onClose={() => setDetailId(null)}
        transfer={detail}
        sourceName={detail ? nameFor(detail.sourceEstablishmentId) : ""}
        destinationName={detail ? nameFor(detail.destinationEstablishmentId) : ""}
        currency={currency}
        onComplete={completeTransfer}
        onFail={failTransfer}
        onReverse={reverseTransfer}
        onReconcile={reconcileTransfer}
      />
    </>
  );

  if (rows.length === 0) {
    return (
      <View style={styles.container}>
        {header}
        <EmptyState
          compact
          title="No transfers yet"
          description="When your EPF balance moves to another employer, record it here so both balances stay right."
          primaryAction={{ label: "Record a transfer", onPress: () => setFormOpen(true) }}
        />
        {modals}
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <FlashList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={header}
        extraData={`${transfers.length}-${balance}`}
        renderItem={({ item }) => {
          const outgoing = item.sourceEstablishmentId === establishment.id;
          const meta = transferStatusMeta(item);
          const tone = theme.colors[statusToneKey(meta.tone)];

          return (
            <Pressable
              onPress={() => setDetailId(item.id)}
              style={[
                styles.row,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.card },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${outgoing ? "Transfer to" : "Transfer from"} ${
                outgoing ? nameFor(item.destinationEstablishmentId) : nameFor(item.sourceEstablishmentId)
              }`}
            >
              <View style={[styles.iconBadge, { backgroundColor: tone + "1A" }]}>
                {outgoing ? (
                  <ArrowUpRight size={theme.iconSize.sm} color={tone} />
                ) : (
                  <ArrowDownLeft size={theme.iconSize.sm} color={tone} />
                )}
              </View>

              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: theme.colors.foreground }]} numberOfLines={1}>
                  {outgoing
                    ? `To ${nameFor(item.destinationEstablishmentId)}`
                    : `From ${nameFor(item.sourceEstablishmentId)}`}
                </Text>
                <Text style={[styles.rowMeta, { color: theme.colors.mutedForeground }]}>
                  {item.date} · {meta.label}
                </Text>
              </View>

              <Text style={[styles.rowAmount, { color: theme.colors.foreground }]}>
                {outgoing ? "−" : "+"}
                {money(item.amount)}
              </Text>
            </Pressable>
          );
        }}
      />
      {modals}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { gap: 12, padding: 16 },
  listContent: { padding: 16, paddingBottom: 24 },
  header: { gap: 12, marginBottom: 12 },
  balanceLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  balanceValue: { fontSize: 24, fontWeight: "700", marginTop: 4 },
  balanceHint: { fontSize: 12, marginTop: 6 },
  addLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  addText: { fontSize: 13, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    marginBottom: 8,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: "600" },
  rowMeta: { fontSize: 12 },
  rowAmount: { fontSize: 14, fontWeight: "700" },
});
