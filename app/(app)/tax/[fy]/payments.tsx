import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Plus, ReceiptIndianRupee } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Dialog } from "@/components/common/Dialog";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageListStateScroll } from "@/components/layout/PageListStateScroll";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { TaxEntryFormSheet } from "@/components/tax/TaxEntryFormSheet";
import { TaxNotice } from "@/components/tax/TaxNotice";
import { TaxRecordRow } from "@/components/tax/TaxRecordRow";
import { Button } from "@/components/ui/Button";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useTaxCenterFlag } from "@/hooks/useTaxCenterEnabled";
import { useTaxDocuments, useTaxEntries } from "@/hooks/useTaxData";
import { useTaxRecordActions } from "@/hooks/useTaxRecordActions";
import { useNetwork } from "@/providers/NetworkProvider";
import { useSettings } from "@/providers/SettingsProvider";
import type { TaxEntry, TaxEntryOf } from "@/shared/features/tax/types";
import { findDuplicateTaxEntries } from "@/shared/features/tax/utils/dedupe";
import { ENTRY_FORMS, type EntryFormSpec } from "@/shared/features/tax/utils/entryForms";
import {
  PAYMENT_TYPE_LABELS,
  paymentReference,
  paymentStatus,
  summarizeTaxPayments,
  type TaxPaymentRow,
} from "@/shared/features/tax/utils/payments";
import { isFinancialYearKey, taxYearLabel } from "@/shared/features/tax/utils/taxYear";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";

type Row =
  | { type: "header"; key: string; title: string; subtitle?: string }
  | { type: "payment"; key: string; row: TaxPaymentRow }
  | { type: "statement"; key: string; line: TaxEntryOf<"ais_value"> };

const PAYMENT_SPEC = ENTRY_FORMS.tax_payment as EntryFormSpec;

/**
 * Tax already paid for one year (SPENDLY-294): advance tax, self-assessment
 * tax and other payments, from the challans. Spendly processes no payment.
 *
 * Totals are sums of the recorded payments; each one is traceable. A payment
 * without its challan details is flagged, and payments are compared with the
 * "tax paid" lines of the user's 26AS or AIS, both ways.
 */
export default function TaxPaymentsScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { fy: param } = useLocalSearchParams<{ fy: string }>();
  const fy = typeof param === "string" && isFinancialYearKey(param) ? param : "";
  const { enabled, loading: flagLoading } = useTaxCenterFlag();
  const { settings } = useSettings();
  const todayKey = todayDateKey(settings?.timezone);
  const currency = useDisplayCurrency();
  const { isOnline } = useNetwork();
  const on = enabled && !!fy;
  const { entries, loading, error, retry } = useTaxEntries(fy, { enabled: on });
  const actions = useTaxRecordActions(fy, todayKey);

  const [form, setForm] = useState<{ editing: TaxEntry | null } | null>(null);
  const [deleting, setDeleting] = useState<TaxEntry | null>(null);
  const docs = useTaxDocuments(fy, { enabled: on && form !== null });

  const summary = useMemo(() => summarizeTaxPayments({ fy, entries }), [fy, entries]);
  const duplicateIds = useMemo(
    () =>
      new Set(
        findDuplicateTaxEntries(entries.filter((e) => e.kind === "tax_payment")).flatMap((group) => group.map((e) => e.id))
      ),
    [entries]
  );

  const rows = useMemo(() => {
    const out: Row[] = [];
    if (summary.payments.length > 0) {
      out.push({ type: "header", key: "h:paid", title: "Payments you recorded" });
      for (const row of summary.payments) out.push({ type: "payment", key: row.entry.id, row });
    }
    if (summary.unmatchedStatement.length > 0) {
      out.push({
        type: "header",
        key: "h:statement",
        title: `In your ${summary.statement} but not recorded`,
        subtitle: "Add the payment from its challan, or check the line in your statement.",
      });
      for (const line of summary.unmatchedStatement) out.push({ type: "statement", key: line.id, line });
    }
    return out;
  }, [summary]);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.type === "payment") {
        const f = item.row.entry.fields;
        return (
          <TaxRecordRow
            entry={item.row.entry}
            summary={{
              title: PAYMENT_TYPE_LABELS[f.paymentType],
              subtitle: [formatDisplayDate(f.date, settings?.dateFormat), paymentReference(f)].filter(Boolean).join(" · "),
              amount: f.amount,
              amountLabel: "Paid",
            }}
            status={paymentStatus(item.row, summary.statement)}
            duplicate={duplicateIds.has(item.row.entry.id)}
            currency={currency}
            onPress={(entry) => setForm({ editing: entry })}
          />
        );
      }
      if (item.type === "statement") {
        return (
          <View style={[styles.statementRow, { paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, gap: theme.space.md }]}>
            <Text style={{ flex: 1, color: theme.colors.foreground, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.sm }}>
              {item.line.fields.sourceName || `Tax paid (${item.line.fields.statement})`}
            </Text>
            <Amount value={item.line.fields.reportedAmount} currency={currency} ghostable style={{ color: theme.colors.warning, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }} />
          </View>
        );
      }
      return (
        <View style={{ paddingHorizontal: theme.space.lg, paddingTop: theme.space.lg, paddingBottom: theme.space.xs }}>
          <Text accessibilityRole="header" style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }}>
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>{item.subtitle}</Text>
          ) : null}
        </View>
      );
    },
    [currency, duplicateIds, settings?.dateFormat, summary.statement, theme]
  );

  if (!enabled || !fy) {
    if (flagLoading) return <PageShell scrollable={false}><LoadingState variant="spinner" /></PageShell>;
    return <Redirect href={"/tax" as Href} />;
  }

  const header = (
    <View style={{ gap: theme.space.sm, paddingHorizontal: theme.space.lg, paddingBottom: theme.space.sm }}>
      {!isOnline ? <TaxNotice tone="offline">You're offline. Changes save on this device and sync later.</TaxNotice> : null}
      <TaxNotice>Tax you paid for {taxYearLabel(fy)}, as on your challans. Spendly doesn't make or track payments itself.</TaxNotice>
      <View style={[styles.totals, { gap: theme.space.md }]}>
        <Total label="Advance tax" value={summary.totals.advance_tax} currency={currency} />
        <Total label="Self-assessment" value={summary.totals.self_assessment} currency={currency} />
        <Total label="Total paid" value={summary.totals.all} currency={currency} />
      </View>
      {summary.statementTotal !== null ? (
        <View style={[styles.statementRow, { gap: theme.space.sm }]}>
          <Text style={{ flex: 1, color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
            Tax paid in your {summary.statement}
          </Text>
          <Amount value={summary.statementTotal} currency={currency} ghostable style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }} />
        </View>
      ) : null}
      {summary.missingReferences > 0 ? (
        <TaxNotice tone="warning">
          {summary.missingReferences} payment{summary.missingReferences === 1 ? " has" : "s have"} no challan details. Add the BSR
          code and challan serial number, or the CIN.
        </TaxNotice>
      ) : null}
      {duplicateIds.size > 0 ? <TaxNotice tone="warning">Some payments look entered twice. Open them to check.</TaxNotice> : null}
      <Button variant="tonal" size="sm" onPress={() => setForm({ editing: null })}>
        Add a tax payment
      </Button>
    </View>
  );

  let body;
  if (error) {
    body = (
      <PageListStateScroll>
        <ErrorState title="Couldn't load your tax payments" description={error.message} onRetry={error.retryable ? retry : undefined} />
      </PageListStateScroll>
    );
  } else if (loading) {
    body = <LoadingState variant="list" count={4} label="Loading your tax payments…" />;
  } else if (rows.length === 0) {
    body = (
      <PageListStateScroll>
        <EmptyState
          illustration="budgets"
          title="No tax payments for this year"
          description="Record advance tax and self-assessment tax from your challans, so tax already paid is counted against what you owe."
          primaryAction={{ label: "Add a tax payment", onPress: () => setForm({ editing: null }) }}
        />
      </PageListStateScroll>
    );
  } else {
    body = <PaymentList rows={rows} renderItem={renderItem} header={header} />;
  }

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      <PageHeader
        title="Tax payments"
        subtitle={taxYearLabel(fy)}
        icon={<ReceiptIndianRupee size={20} color={theme.colors.primary} />}
        onBack={() => router.back()}
        rightElement={
          <Button variant="ghost" size="icon" onPress={() => setForm({ editing: null })} accessibilityLabel="Add a tax payment">
            <Plus size={20} color={theme.colors.primary} />
          </Button>
        }
      />
      {body}

      <TaxEntryFormSheet
        spec={form ? PAYMENT_SPEC : null}
        fy={fy}
        todayKey={todayKey}
        editing={form?.editing ?? null}
        entries={entries}
        documents={docs.documents}
        documentsLoading={docs.loading}
        saving={actions.saving}
        onSave={({ id, draft, duplicateConfirmed, labels }) => actions.saveRecord({ id, draft, duplicateConfirmed, labels, title: "Tax payment" })}
        onDelete={setDeleting}
        onClose={() => setForm(null)}
      />
      <Dialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this payment?"
        description="It stops counting as tax paid for this year. It's kept in your history."
        actions={[
          { label: "Cancel", variant: "ghost", onPress: () => setDeleting(null) },
          {
            label: "Delete",
            variant: "destructive",
            loading: actions.saving,
            onPress: () => {
              const entry = deleting;
              setDeleting(null);
              if (entry) void actions.removeRecord(entry.id, "Tax payment");
            },
          },
        ]}
      />
    </PageShell>
  );
}

function Total({ label, value, currency }: { label: string; value: number; currency: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>{label}</Text>
      <Amount value={value} currency={currency} ghostable style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }} />
    </View>
  );
}

function PaymentList({
  rows,
  renderItem,
  header,
}: {
  rows: Row[];
  renderItem: ({ item }: { item: Row }) => React.ReactElement;
  header: React.ReactElement;
}) {
  const bottomPadding = usePageListBottomPadding();
  return (
    <View style={styles.listWrap}>
      <FlashList
        data={rows}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listWrap: { flex: 1 },
  totals: { flexDirection: "row" },
  statementRow: { flexDirection: "row", alignItems: "center" },
});
