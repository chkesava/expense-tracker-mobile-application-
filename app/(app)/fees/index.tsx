import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter, type Href } from "expo-router";
import { ListChecks, ReceiptText, WifiOff } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { FeeOverview } from "@/components/fees/FeeOverview";
import { FeeRecordRow } from "@/components/fees/FeeRecordRow";
import { PageHeader, type PageHeaderTab } from "@/components/layout/PageHeader";
import { PageListStateScroll } from "@/components/layout/PageListStateScroll";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { Button } from "@/components/ui/Button";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useFeeIntelligence } from "@/hooks/useFeeIntelligence";
import { useFeeReviewActions } from "@/hooks/useFeeReviewActions";
import { useAccountsContext } from "@/providers/FinanceDataProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import type { FeeRecord } from "@/shared/types/fee";
import { feeCandidateQueue } from "@/shared/utils/feeDetection";
import { feeDetailHref } from "@/shared/utils/feeDetail";
import { sortForReview } from "@/shared/utils/feeReviewForm";
import { useTheme } from "@/theme/ThemeProvider";

type FeesTab = "overview" | "review" | "all";

/**
 * Fees & charges: the cost overview (SPENDLY-316), the review queue and
 * bulk review (SPENDLY-315). A row opens the fee detail (SPENDLY-317), where
 * a single fee is reviewed and corrected.
 */
export default function FeesScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const currency = useDisplayCurrency();
  const { isOnline } = useNetwork();
  const { accounts } = useAccountsContext();
  const { result, reviewById, loading, error, retry } = useFeeIntelligence();

  const [tab, setTab] = useState<FeesTab>("overview");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const { saving, saveBulk } = useFeeReviewActions({ result, reviewById });

  const accountNames = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.displayName || a.name] as const)),
    [accounts]
  );
  const records = result?.records ?? [];
  const queue = useMemo(() => sortForReview(feeCandidateQueue(records)), [records]);
  const all = useMemo(() => sortForReview(records), [records]);
  const visible = tab === "review" ? queue : all;

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

  const openDetail = useCallback(
    (record: FeeRecord) => router.push(feeDetailHref(record.key) as Href),
    [router]
  );
  const onRowPress = useCallback(
    (record: FeeRecord) => (selecting ? toggle(record) : openDetail(record)),
    [openDetail, selecting, toggle]
  );
  const onRowLongPress = useCallback(
    (record: FeeRecord) => {
      setSelecting(true);
      toggle(record);
    },
    [toggle]
  );

  const onBulk = useCallback(
    async (decision: "confirm" | "not_fee") => {
      const ok = await saveBulk(records.filter((r) => selected.has(r.key)), decision);
      if (ok) exitSelection();
    },
    [exitSelection, records, saveBulk, selected]
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
    { id: "overview", label: "Overview" },
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
        tab !== "overview" && visible.length > 0 && !selecting ? (
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
  } else if (tab === "overview") {
    body = (
      <FeeOverview
        records={records}
        currency={currency}
        accountNames={accountNames}
        onOpenReview={() => setTab("review")}
        onOpenRecord={openDetail}
      />
    );
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
