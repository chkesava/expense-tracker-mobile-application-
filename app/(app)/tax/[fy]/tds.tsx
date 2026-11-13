import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Plus, Scale } from "lucide-react-native";

import { ActionMenuSheet } from "@/components/common/ActionMenuSheet";
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
import { TaxReconcileRow, TaxReconcileSheet } from "@/components/tax/TaxReconcile";
import { TaxRecordRow } from "@/components/tax/TaxRecordRow";
import { Button } from "@/components/ui/Button";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useTaxCenterFlag } from "@/hooks/useTaxCenterEnabled";
import { useTaxDocuments, useTaxEntries, useTaxReviews } from "@/hooks/useTaxData";
import { useTaxRecordActions } from "@/hooks/useTaxRecordActions";
import { useNetwork } from "@/providers/NetworkProvider";
import { useSettings } from "@/providers/SettingsProvider";
import type { TaxEntry, TaxEntryKind } from "@/shared/features/tax/types";
import { findDuplicateTaxEntries } from "@/shared/features/tax/utils/dedupe";
import { ENTRY_FORMS, type EntryFormSpec } from "@/shared/features/tax/utils/entryForms";
import { reconcileTds, tdsRecordSummary, type TdsMatchRow } from "@/shared/features/tax/utils/tdsReconcile";
import { isFinancialYearKey, taxYearLabel } from "@/shared/features/tax/utils/taxYear";
import { todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";

type Row =
  | { type: "header"; key: string; title: string; subtitle?: string }
  | { type: "match"; key: string; row: TdsMatchRow }
  | { type: "record"; key: string; entry: TaxEntry };

const KINDS: TaxEntryKind[] = ["form16", "tds", "ais_value"];

/**
 * TDS for one financial year (SPENDLY-291): the user's Form 16 and TDS
 * certificates, the TDS lines of their AIS or 26AS, and the comparison.
 *
 * Every figure is what the user read off a document; no government portal is
 * reached. The comparison is deterministic (`reconcileTds`) and each row
 * explains itself. Reads the year's records only while this screen is open.
 */
export default function TaxTdsScreen() {
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
  const entriesState = useTaxEntries(fy, { enabled: on });
  const reviewsState = useTaxReviews(fy, { enabled: on });
  const actions = useTaxRecordActions(fy, todayKey);

  const [choosing, setChoosing] = useState(false);
  const [form, setForm] = useState<{ spec: EntryFormSpec; editing: TaxEntry | null } | null>(null);
  const [comparing, setComparing] = useState<TdsMatchRow | null>(null);
  const [deleting, setDeleting] = useState<TaxEntry | null>(null);
  // SPENDLY-406: the year's documents are read only while a form is open.
  const docs = useTaxDocuments(fy, { enabled: on && form !== null });

  const records = useMemo(
    () => entriesState.entries.filter((e) => !e.deletedAt && KINDS.includes(e.kind)),
    [entriesState.entries]
  );
  const reconciliation = useMemo(
    () => reconcileTds({ fy, entries: records, reviews: reviewsState.reviews }),
    [fy, records, reviewsState.reviews]
  );
  const duplicateIds = useMemo(
    () => new Set(findDuplicateTaxEntries(records).flatMap((group) => group.map((e) => e.id))),
    [records]
  );

  const rows = useMemo(() => {
    const out: Row[] = [];
    if (reconciliation.rows.length > 0) {
      out.push({
        type: "header",
        key: "h:compare",
        title: "Comparison",
        subtitle: reconciliation.statement ? `Your certificates against your ${reconciliation.statement}` : "Add AIS or 26AS lines to compare",
      });
      for (const row of reconciliation.rows) out.push({ type: "match", key: `m:${row.key}`, row });
    }
    const certificates = records.filter((e) => e.kind === "form16" || e.kind === "tds");
    if (certificates.length > 0) {
      out.push({ type: "header", key: "h:mine", title: "Your Form 16 and certificates" });
      for (const entry of certificates) out.push({ type: "record", key: entry.id, entry });
    }
    const statementLines = records.filter((e) => e.kind === "ais_value");
    if (statementLines.length > 0) {
      out.push({ type: "header", key: "h:statement", title: "From your AIS / TIS / 26AS" });
      for (const entry of statementLines) out.push({ type: "record", key: entry.id, entry });
    }
    return out;
  }, [reconciliation, records]);

  const openEntry = useCallback((entry: TaxEntry) => {
    const spec = ENTRY_FORMS[entry.kind];
    if (spec) setForm({ spec, editing: entry });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.type === "match") {
        return <TaxReconcileRow row={item.row} statement={reconciliation.statement} currency={currency} onPress={setComparing} />;
      }
      if (item.type === "record") {
        const summary = tdsRecordSummary(item.entry);
        if (!summary) return null;
        return <TaxRecordRow entry={item.entry} summary={summary} duplicate={duplicateIds.has(item.entry.id)} currency={currency} onPress={openEntry} />;
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
    [currency, duplicateIds, openEntry, reconciliation.statement, theme]
  );

  if (!enabled || !fy) {
    if (flagLoading) return <PageShell scrollable={false}><LoadingState variant="spinner" /></PageShell>;
    return <Redirect href={"/tax" as Href} />;
  }

  const problems = reconciliation.counts.mismatch + reconciliation.counts.accepted_changed + reconciliation.counts.missing_in_records + reconciliation.counts.missing_in_statement;
  const header = (
    <View style={{ gap: theme.space.sm, paddingHorizontal: theme.space.lg, paddingBottom: theme.space.sm }}>
      {!isOnline ? <TaxNotice tone="offline">You're offline. Changes save on this device and sync later.</TaxNotice> : null}
      {duplicateIds.size > 0 ? (
        <TaxNotice tone="warning">Some records look entered twice. Open them to check; delete the copy if it is one.</TaxNotice>
      ) : null}
      {reconciliation.statement ? (
        <View style={[styles.totals, { gap: theme.space.md }]}>
          <Total label="TDS on your certificates" value={reconciliation.totals.mine} currency={currency} />
          <Total label={`TDS in your ${reconciliation.statement}`} value={reconciliation.totals.reported} currency={currency} />
        </View>
      ) : null}
      {problems > 0 ? (
        <TaxNotice tone="warning">
          {problems} item{problems === 1 ? "" : "s"} to check. Open one to see exactly what differs.
        </TaxNotice>
      ) : reconciliation.rows.length > 0 && reconciliation.statement ? (
        <TaxNotice>Everything you've added matches your {reconciliation.statement}.</TaxNotice>
      ) : null}
      <Button variant="tonal" size="sm" labelLines={2} onPress={() => setChoosing(true)}>
        Add Form 16, certificate or statement line
      </Button>
    </View>
  );

  const error = entriesState.error ?? reviewsState.error;
  let body;
  if (error) {
    body = (
      <PageListStateScroll>
        <ErrorState title="Couldn't load your TDS records" description={error.message} onRetry={error.retryable ? () => (entriesState.retry(), reviewsState.retry()) : undefined} />
      </PageListStateScroll>
    );
  } else if (entriesState.loading || reviewsState.loading) {
    body = <LoadingState variant="list" count={5} label="Loading your TDS records…" />;
  } else if (records.length === 0) {
    body = (
      <PageListStateScroll>
        <EmptyState
          illustration="analytics"
          title="No TDS records for this year yet"
          description="Add your Form 16 and TDS certificates, then the TDS lines from your AIS or 26AS. Spendly compares them and shows anything that doesn't match."
          primaryAction={{ label: "Add Form 16", onPress: () => setForm({ spec: ENTRY_FORMS.form16 as EntryFormSpec, editing: null }) }}
          secondaryAction={{ label: "Add something else", onPress: () => setChoosing(true) }}
        />
      </PageListStateScroll>
    );
  } else {
    body = <TdsList rows={rows} renderItem={renderItem} header={header} />;
  }

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      <PageHeader
        title="TDS & Form 16"
        subtitle={taxYearLabel(fy)}
        icon={<Scale size={20} color={theme.colors.primary} />}
        onBack={() => router.back()}
        rightElement={
          <Button variant="ghost" size="icon" onPress={() => setChoosing(true)} accessibilityLabel="Add a TDS record">
            <Plus size={20} color={theme.colors.primary} />
          </Button>
        }
      />
      {body}

      <ActionMenuSheet
        isOpen={choosing}
        onClose={() => setChoosing(false)}
        title="What are you adding?"
        actions={KINDS.map((kind) => ({
          label: ENTRY_FORMS[kind]?.title ?? kind,
          onPress: () => (setChoosing(false), setForm({ spec: ENTRY_FORMS[kind] as EntryFormSpec, editing: null })),
        }))}
      />
      <TaxEntryFormSheet
        spec={form?.spec ?? null}
        fy={fy}
        todayKey={todayKey}
        editing={form?.editing ?? null}
        entries={records}
        documents={docs.documents}
        documentsLoading={docs.loading}
        saving={actions.saving}
        onSave={({ id, draft, duplicateConfirmed, labels }) =>
          actions.saveRecord({ id, draft, duplicateConfirmed, labels, title: form?.spec.title ?? "Record" })
        }
        onDelete={setDeleting}
        onClose={() => setForm(null)}
      />
      <TaxReconcileSheet
        row={comparing}
        statement={reconciliation.statement}
        currency={currency}
        saving={actions.saving}
        online={isOnline}
        onAccept={(row) => void actions.acceptDifference(row)}
        onUndo={(row) => void actions.undoAcceptance(row)}
        onClose={() => setComparing(null)}
      />
      <Dialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this record?"
        description="It stops counting for this year and leaves the comparison. It's kept in your history."
        actions={[
          { label: "Cancel", variant: "ghost", onPress: () => setDeleting(null) },
          {
            label: "Delete",
            variant: "destructive",
            loading: actions.saving,
            onPress: () => {
              const entry = deleting;
              setDeleting(null);
              if (entry) void actions.removeRecord(entry.id, ENTRY_FORMS[entry.kind]?.title ?? "Record");
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

function TdsList({
  rows,
  renderItem,
  header,
}: {
  rows: Row[];
  renderItem: ({ item }: { item: Row }) => React.ReactElement | null;
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
});
