import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { ListChecks, ReceiptText, WifiOff } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { FeeRecordRow } from "@/components/fees/FeeRecordRow";
import { FeeReviewSheet, type FeeReviewSubmit } from "@/components/fees/FeeReviewSheet";
import { PageHeader, type PageHeaderTab } from "@/components/layout/PageHeader";
import { PageListStateScroll } from "@/components/layout/PageListStateScroll";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { Button } from "@/components/ui/Button";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useFeeIntelligence } from "@/hooks/useFeeIntelligence";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useAccountsContext } from "@/providers/FinanceDataProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import {
  FeeReviewInvalidError,
  saveFeeReview,
  saveFeeReviewsBulk,
} from "@/services/fees/feeReviewStore";
import type { FeeRecord } from "@/shared/types/fee";
import { feeCandidateQueue } from "@/shared/utils/feeDetection";
import { bulkReviewPlan, feeIssueMessage, sortForReview } from "@/shared/utils/feeReviewForm";
import { useTheme } from "@/theme/ThemeProvider";

type FeesTab = "review" | "all";

/**
 * Fees & charges (SPENDLY-315): review what Spendly detected, confirm it,
 * reject it or correct it. SPENDLY-316/317 add the overview and detail views
 * to this route.
 */
export default function FeesScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const uid = user?.uid;
  const currency = useDisplayCurrency();
  const { isOnline } = useNetwork();
  const { accounts } = useAccountsContext();
  const { result, reviewById, loading, error, retry } = useFeeIntelligence();

  const [tab, setTab] = useState<FeesTab>("review");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);

  const accountNames = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.displayName || a.name] as const)),
    [accounts]
  );
  const records = result?.records ?? [];
  const queue = useMemo(() => sortForReview(feeCandidateQueue(records)), [records]);
  const all = useMemo(() => sortForReview(records), [records]);
  const visible = tab === "review" ? queue : all;
  const openRecord = openKey ? records.find((r) => r.key === openKey) ?? null : null;

  const exitSelection = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);

  const toggle = useCallback((record: FeeRecord) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(record.key)) next.delete(record.key);
      else next.add(record.key);
      return next;
    });
  }, []);

  const onRowPress = useCallback(
    (record: FeeRecord) => (selecting ? toggle(record) : setOpenKey(record.key)),
    [selecting, toggle]
  );
  const onRowLongPress = useCallback(
    (record: FeeRecord) => {
      setSelecting(true);
      toggle(record);
    },
    [toggle]
  );

  const reportFailure = useCallback((scope: string, err: unknown) => {
    if (err instanceof FeeReviewInvalidError) {
      toast.error(feeIssueMessage(err.issues[0]));
      return;
    }
    logError(scope, err);
    toast.error(friendlyErrorMessage(err, "Couldn't save your review."));
  }, []);

  const onSubmit = useCallback(
    async ({ record, decision, classification, note }: FeeReviewSubmit) => {
      if (!uid || saving) return;
      setSaving(true);
      try {
        const outcome = await saveFeeReview(uid, {
          record,
          decision,
          classification,
          note,
          inference: result?.inferences.get(record.key) ?? null,
          previous: reviewById.get(record.key) ?? null,
        });
        toast.success(
          writeSavedMessage(outcome, decision === "not_fee" ? "Marked as not a fee" : decision === "confirm" ? "Fee confirmed" : "Correction saved")
        );
        setOpenKey(null);
      } catch (err) {
        reportFailure("fees.saveReview", err);
      } finally {
        setSaving(false);
      }
    },
    [reportFailure, result, reviewById, saving, uid]
  );

  const onBulk = useCallback(
    async (decision: "confirm" | "not_fee") => {
      if (!uid || saving) return;
      const chosen = records.filter((r) => selected.has(r.key));
      const plan = bulkReviewPlan(chosen, decision);
      if (plan.ready.length === 0) {
        toast.info("None of these can be confirmed as they are — open each one to decide.");
        return;
      }
      setSaving(true);
      try {
        const outcome = await saveFeeReviewsBulk(
          uid,
          plan.ready.map((item) => ({
            record: item.record,
            decision: item.decision,
            classification: item.classification,
            inference: result?.inferences.get(item.record.key) ?? null,
            previous: reviewById.get(item.record.key) ?? null,
          }))
        );
        const done = `${plan.ready.length} ${decision === "confirm" ? "confirmed" : "marked as not fees"}`;
        toast.success(writeSavedMessage(outcome, done));
        if (plan.skipped.length > 0) {
          toast.info(`${plan.skipped.length} need a closer look — open each to decide.`);
        }
        exitSelection();
      } catch (err) {
        reportFailure("fees.saveBulk", err);
      } finally {
        setSaving(false);
      }
    },
    [exitSelection, records, reportFailure, result, reviewById, saving, selected, uid]
  );

  const renderItem = useCallback(
    ({ item }: { item: FeeRecord }) => (
      <FeeRecordRow
        record={item}
        currency={currency}
        accountName={item.source.accountId ? accountNames.get(item.source.accountId) : undefined}
        selecting={selecting}
        selected={selected.has(item.key)}
        onPress={onRowPress}
        onLongPress={onRowLongPress}
      />
    ),
    [accountNames, currency, onRowLongPress, onRowPress, selected, selecting]
  );

  const tabs: PageHeaderTab[] = [
    { id: "review", label: "Review", badge: queue.length > 0 ? queue.length : undefined },
    { id: "all", label: "All fees" },
  ];

  const header = (
    <PageHeader
      title="Fees & charges"
      subtitle={loading ? "Checking your transactions…" : queue.length > 0 ? `${queue.length} to review` : "All caught up"}
      icon={<ReceiptText size={20} color={theme.colors.primary} />}
      onBack={() => router.back()}
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => {
        setTab(id as FeesTab);
        exitSelection();
      }}
      tabVariant="underline"
      rightElement={
        visible.length > 0 && !selecting ? (
          <Button variant="ghost" size="icon" onPress={() => setSelecting(true)} accessibilityLabel="Select several to review at once">
            <ListChecks size={20} color={theme.colors.primary} />
          </Button>
        ) : undefined
      }
    />
  );

  let body;
  if (error) {
    body = (
      <PageListStateScroll>
        <ErrorState title="Couldn't load fees" description={error.message} onRetry={error.retryable ? retry : undefined} />
      </PageListStateScroll>
    );
  } else if (loading) {
    body = <LoadingState variant="list" count={6} label="Checking your transactions for fees…" />;
  } else if (visible.length === 0) {
    body = (
      <PageListStateScroll>
        {records.length === 0 ? (
          <EmptyState
            illustration="expenses"
            title="No fees found yet"
            description="Spendly looks for bank charges, card fees, GST on fees and reversals in your transactions. Anything it isn't sure about will appear here for you to check."
          />
        ) : (
          <EmptyState
            illustration="expenses"
            title="All caught up"
            description="Every fee Spendly found has been reviewed or is clear enough to count."
            primaryAction={{ label: "See all fees", onPress: () => setTab("all") }}
          />
        )}
      </PageListStateScroll>
    );
  } else {
    body = (
      <FeeList
        data={visible}
        extraData={selected}
        renderItem={renderItem}
        header={
          <View style={{ gap: theme.space.sm, paddingHorizontal: theme.space.lg, paddingBottom: theme.space.sm }}>
            {!isOnline ? (
              <View style={[styles.banner, { gap: theme.space.sm }]} accessibilityLiveRegion="polite">
                <WifiOff size={16} color={theme.colors.mutedForeground} />
                <Text style={{ flex: 1, color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
                  You're offline. Reviews save on this device and sync later.
                </Text>
              </View>
            ) : null}
            {selecting ? (
              <View style={[styles.bulkBar, { gap: theme.space.sm }]}>
                <Text style={{ flex: 1, color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>
                  {selected.size} selected
                </Text>
                <Button size="sm" variant="primary" disabled={selected.size === 0 || saving} loading={saving} onPress={() => void onBulk("confirm")}>
                  Confirm
                </Button>
                <Button size="sm" variant="outline" disabled={selected.size === 0 || saving} onPress={() => void onBulk("not_fee")}>
                  Not fees
                </Button>
                <Button size="sm" variant="ghost" onPress={exitSelection}>
                  Cancel
                </Button>
              </View>
            ) : null}
          </View>
        }
      />
    );
  }

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      {header}
      {body}
      <FeeReviewSheet
        record={openRecord}
        review={openKey ? reviewById.get(openKey) : undefined}
        records={records}
        currency={currency}
        accountName={openRecord?.source.accountId ? accountNames.get(openRecord.source.accountId) : undefined}
        online={isOnline}
        saving={saving}
        onSubmit={(submit) => void onSubmit(submit)}
        onClose={() => setOpenKey(null)}
      />
    </PageShell>
  );
}

function FeeList({
  data,
  extraData,
  renderItem,
  header,
}: {
  data: FeeRecord[];
  extraData: unknown;
  renderItem: ({ item }: { item: FeeRecord }) => React.ReactElement;
  header: React.ReactElement;
}) {
  const bottomPadding = usePageListBottomPadding();
  return (
    <View style={styles.listWrap}>
      <FlashList
        data={data}
        extraData={extraData}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listWrap: { flex: 1 },
  banner: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  bulkBar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
});
