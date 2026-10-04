import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ArrowUpRight, ChevronRight, ReceiptText } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { Section } from "@/components/dashboard/primitives";
import { feeRecordIcon } from "@/components/fees/feeIcons";
import { FeeReviewSheet } from "@/components/fees/FeeReviewSheet";
import { FeeSignalRow, FeeSignalSheet } from "@/components/fees/FeeSignals";
import { FeeStatusBadge } from "@/components/fees/FeeStatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { Button } from "@/components/ui/Button";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useFeeIntelligence } from "@/hooks/useFeeIntelligence";
import { useFeeReviewActions } from "@/hooks/useFeeReviewActions";
import { useFeeSignals } from "@/hooks/useFeeSignals";
import { signalsForRecord } from "@/shared/utils/feeAnomalies";
import { useAccountsContext } from "@/providers/FinanceDataProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import type { FeeRecord } from "@/shared/types/fee";
import { buildFeeDetail, feeDetailHref, feeProvenanceText, maskedAccountLabel } from "@/shared/utils/feeDetail";
import { describeHistoryEntry, feeRecordTitle, feeRoleLabel } from "@/shared/utils/feeReviewForm";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { transactionHref } from "@/shared/utils/transactionRef";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Fee detail (SPENDLY-317): why a fee appears, what it is made of, which
 * transaction it came from and which GST / reversal / refund records link to
 * it. Every claim here traces to a record; the effect on totals uses the same
 * sum as the overview.
 */
export default function FeeDetailScreen() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const params = useLocalSearchParams<{ key?: string }>();
  const key = typeof params.key === "string" ? decodeURIComponent(params.key) : "";
  const currency = useDisplayCurrency();
  const { isOnline } = useNetwork();
  const { accounts } = useAccountsContext();
  const intel = useFeeIntelligence();
  const { saving, saveOne } = useFeeReviewActions(intel);
  const [reviewing, setReviewing] = useState(false);
  const [openSignalId, setOpenSignalId] = useState<string | null>(null);
  const bottomPadding = usePageListBottomPadding();

  const records = intel.result?.records ?? [];
  const detail = useMemo(() => (key ? buildFeeDetail(key, records) : null), [key, records]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a] as const)), [accounts]);
  const review = key ? intel.reviewById.get(key) : undefined;
  const signals = useFeeSignals(intel.result?.records ?? null);
  const recordSignals = useMemo(() => (key ? signalsForRecord(signals.active, key) : []), [key, signals.active]);
  const openSignal = openSignalId ? recordSignals.find((s) => s.id === openSignalId) ?? null : null;
  const accountNames = useMemo(() => new Map(accounts.map((a) => [a.id, a.displayName || a.name] as const)), [accounts]);
  const money = (v: number) => formatAmount(v, currency);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/fees" as Href));

  const header = (
    <PageHeader title="Fee details" icon={<ReceiptText size={20} color={theme.colors.primary} />} onBack={goBack} />
  );

  if (intel.error) {
    return (
      <PageShell scrollable={false}>
        {header}
        <ErrorState title="Couldn't load this fee" description={intel.error.message} onRetry={intel.error.retryable ? intel.retry : undefined} />
      </PageShell>
    );
  }
  if (intel.loading) {
    return (
      <PageShell scrollable={false}>
        {header}
        <LoadingState variant="card" count={3} label="Loading fee…" />
      </PageShell>
    );
  }
  if (!detail) {
    return (
      <PageShell scrollable={false}>
        {header}
        <EmptyState
          illustration="expenses"
          title="This fee isn't here any more"
          description="The transaction may have been deleted or edited so it no longer looks like a fee."
          primaryAction={{ label: "Back to fees", onPress: () => router.replace("/fees" as Href) }}
        />
      </PageShell>
    );
  }

  const { record, parent, children, effect, parts } = detail;
  const account = record.source.accountId ? accountById.get(record.source.accountId) : undefined;
  const accountLabel = maskedAccountLabel(account);
  const Icon = feeRecordIcon(record);
  const credit = record.source.direction === "credit";
  const openTransaction = () =>
    router.push(transactionHref(record.source.ref, record.source.accountId) as Href);

  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const body = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      {header}
      <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: bottomPadding, gap: theme.space.lg }} showsVerticalScrollIndicator={false}>
        {/* Identity */}
        <Section>
          <View style={{ gap: theme.space.sm }}>
            <View style={[styles.row, { gap: theme.space.md }]}>
              <View style={[styles.icon, { backgroundColor: surfaces.tile, borderRadius: theme.radius.md }]}>
                <Icon size={20} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text accessibilityRole="header" style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.bold, fontSize: theme.typography.md }}>
                  {feeRecordTitle(record)}
                </Text>
                <FeeStatusBadge status={record.status} />
              </View>
            </View>
            <Amount
              value={credit ? record.source.amount : -record.source.amount}
              currency={currency}
              ghostable
              style={{ fontSize: 28, fontFamily: theme.fontFamily.bold, color: credit ? theme.colors.success : theme.colors.foreground }}
            />
            <Text style={muted}>{detail.countedReason}</Text>
          </View>
        </Section>

        {recordSignals.length > 0 ? (
          <Section title="Worth a look">
            <View style={{ gap: theme.space.xs }}>
              {recordSignals.map((sig) => (
                <FeeSignalRow key={sig.id} signal={sig} onPress={() => setOpenSignalId(sig.id)} />
              ))}
            </View>
          </Section>
        ) : null}

        {/* Context */}
        <Section title="Where it came from">
          <View style={{ gap: theme.space.sm }}>
            <InfoRow label="Date" value={record.source.date} />
            {accountLabel ? <InfoRow label="Account or card" value={accountLabel} /> : null}
            {record.source.institution ? <InfoRow label="Bank or provider" value={record.source.institution} /> : null}
            {record.source.merchant ? <InfoRow label="Description" value={record.source.merchant} /> : null}
            {record.source.category ? (
              <InfoRow label="Category" value={record.source.subcategory ? `${record.source.category} › ${record.source.subcategory}` : record.source.category} />
            ) : null}
            <Button variant="outline" onPress={openTransaction} accessibilityLabel="Open the source transaction">
              Open transaction
            </Button>
          </View>
        </Section>

        {/* Composition */}
        <Section title="What the amount is made of">
          <View style={{ gap: theme.space.sm }}>
            {parts.map((p) => (
              <View key={p.key} style={styles.between}>
                <Text style={body}>{p.label}</Text>
                <Amount value={p.value} currency={currency} ghostable style={body} />
              </View>
            ))}
          </View>
        </Section>

        {/* Relationships */}
        {parent ? (
          <Section title={record.role === "tax_on_fee" ? "GST on this fee" : "Gives back this fee"}>
            <LinkedRow record={parent} currency={currency} onPress={() => router.push(feeDetailHref(parent.key) as Href)} />
          </Section>
        ) : null}
        {children.length > 0 ? (
          <Section title="Linked GST, reversals and refunds" subtitle="Only counted records change your totals">
            <View style={{ gap: theme.space.xs }}>
              {children.map((child) => (
                <LinkedRow key={child.key} record={child} currency={currency} onPress={() => router.push(feeDetailHref(child.key) as Href)} />
              ))}
              <View style={[styles.between, { marginTop: theme.space.sm }]}>
                <Text style={[body, { fontFamily: theme.fontFamily.semibold }]}>Net fee after these</Text>
                <Text style={[body, { fontFamily: theme.fontFamily.semibold }]}>
                  {money(effect.netFee)}{effect.netTax !== 0 ? ` + GST ${money(effect.netTax)}` : ""}
                </Text>
              </View>
            </View>
          </Section>
        ) : null}

        {/* Evidence */}
        <Section title="Why Spendly shows this">
          <View style={{ gap: theme.space.xs }}>
            {record.evidence.map((e, i) => (
              <Text key={`${e.ruleId}-${i}`} style={[body, e.weight < 0 ? { color: theme.colors.mutedForeground } : null]}>
                {e.weight < 0 ? "− " : "• "}
                {e.detail}
              </Text>
            ))}
            <Text style={muted}>{feeProvenanceText(record)}</Text>
          </View>
        </Section>

        {review?.note ? (
          <Section title="Your note">
            <Text style={body}>{review.note}</Text>
          </Section>
        ) : null}

        {review?.history && review.history.length > 0 ? (
          <Section title="Correction history">
            <View style={{ gap: theme.space.xs }}>
              {[...review.history].reverse().map((entry) => (
                <Text key={entry.revision} style={muted}>
                  {describeHistoryEntry(entry)} · {new Date(entry.atMs).toLocaleDateString()}
                </Text>
              ))}
            </View>
          </Section>
        ) : null}

        <Button variant="primary" size="lg" onPress={() => setReviewing(true)}>
          {record.status === "uncertain" ? "Review this fee" : "Correct this fee"}
        </Button>
        <Text style={[muted, { textAlign: "center" }]}>
          Reviewing changes only how Spendly counts fees — the transaction itself is never edited.
        </Text>
      </ScrollView>

      <FeeSignalSheet
        signal={openSignal}
        records={records}
        currency={currency}
        accountNames={accountNames}
        actions={signals}
        onClose={() => setOpenSignalId(null)}
        onOpenRecord={(r) => {
          if (r.key !== record.key) router.push(feeDetailHref(r.key) as Href);
        }}
      />
      <FeeReviewSheet
        record={reviewing ? record : null}
        review={review}
        records={records}
        currency={currency}
        accountName={accountLabel}
        online={isOnline}
        saving={saving}
        onSubmit={(submit) => {
          void saveOne(submit).then((ok) => {
            if (ok) setReviewing(false);
          });
        }}
        onClose={() => setReviewing(false)}
      />
    </PageShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.between, { gap: theme.space.md, alignItems: "flex-start" }]}>
      <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm }}>{label}</Text>
      <Text style={{ flex: 1, textAlign: "right", color: theme.colors.foreground, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.sm }}>
        {value}
      </Text>
    </View>
  );
}

function LinkedRow({ record, currency, onPress }: { record: FeeRecord; currency: string; onPress: () => void }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const credit = record.source.direction === "credit";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${feeRoleLabel(record.role)} on ${record.source.date}, ${formatAmount(record.source.amount, currency)}`}
      style={({ pressed }) => [styles.linked, { gap: theme.space.md, backgroundColor: pressed ? surfaces.tile : "transparent", borderRadius: theme.radius.md }]}
    >
      <ArrowUpRight size={16} color={theme.colors.primary} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.sm }}>{feeRoleLabel(record.role)}</Text>
        <View style={[styles.row, { gap: theme.space.sm }]}>
          <FeeStatusBadge status={record.status} />
          <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>{record.source.date}</Text>
        </View>
      </View>
      <Amount value={credit ? record.source.amount : -record.source.amount} currency={currency} ghostable style={{ color: credit ? theme.colors.success : theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }} />
      <ChevronRight size={16} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  icon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  linked: { flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: 8, paddingVertical: 6 },
});
