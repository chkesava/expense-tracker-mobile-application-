import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { PiggyBank, Plus } from "lucide-react-native";

import { ActionMenuSheet, type ActionMenuItem } from "@/components/common/ActionMenuSheet";
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
import { TaxLineRow } from "@/components/tax/TaxLineRow";
import { TaxNotice } from "@/components/tax/TaxNotice";
import { Button } from "@/components/ui/Button";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useTaxCenterFlag } from "@/hooks/useTaxCenterEnabled";
import { useTaxDocuments } from "@/hooks/useTaxData";
import { useTaxDeductions } from "@/hooks/useTaxDeductions";
import { useTaxRecordActions } from "@/hooks/useTaxRecordActions";
import { useNetwork } from "@/providers/NetworkProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { deductionCategory, deductionSectionLabel } from "@/shared/features/tax/data/deductionCategories";
import type { TaxEntry, TaxEntryOf, TaxLine } from "@/shared/features/tax/types";
import { deductionStatus, type TaxDeductionGroup } from "@/shared/features/tax/utils/deductions";
import { ENTRY_FORMS, type EntryFormSpec } from "@/shared/features/tax/utils/entryForms";
import { isFinancialYearKey, taxLawOf, taxYearLabel } from "@/shared/features/tax/utils/taxYear";
import { todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";

type Row = { type: "group"; key: string; group: TaxDeductionGroup } | { type: "line"; key: string; line: TaxLine };

const PROOF_TEXT: Record<string, string> = { attached: "Proof attached", missing: "Proof still to get", not_needed: "No proof needed" };
const DEDUCTION_SPEC = ENTRY_FORMS.deduction as EntryFormSpec;

/**
 * Deductions for one financial year (SPENDLY-292): the EPF employee share from
 * the user's EPF records, and the claims they add (investments, insurance,
 * loans, rent, donations…), with proof status and eligibility.
 *
 * Every amount is the user's or their records'. No caps, no regime rules and
 * no suggestions here: the estimate (SPENDLY-295) applies the versioned rules.
 */
export default function TaxDeductionsScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { fy: param } = useLocalSearchParams<{ fy: string }>();
  const fy = typeof param === "string" && isFinancialYearKey(param) ? param : "";
  const law = taxLawOf(fy);
  const { enabled, loading: flagLoading } = useTaxCenterFlag();
  const { settings } = useSettings();
  const todayKey = todayDateKey(settings?.timezone);
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);
  const { isOnline } = useNetwork();
  const on = enabled && !!fy;
  const { summary, entries, sourceOptions, loading, error, retry } = useTaxDeductions(fy, { enabled: on });
  const actions = useTaxRecordActions(fy, todayKey);

  const [menuFor, setMenuFor] = useState<TaxLine | null>(null);
  const [replacing, setReplacing] = useState<TaxLine | null>(null);
  const [form, setForm] = useState<{ editing: TaxEntry | null } | null>(null);
  const [deleting, setDeleting] = useState<TaxEntry | null>(null);
  const docs = useTaxDocuments(fy, { enabled: on && form !== null });

  const claims = useMemo(
    () => entries.filter((e): e is TaxEntryOf<"deduction"> => e.kind === "deduction" && !e.deletedAt),
    [entries]
  );
  const entryOf = useCallback((line: TaxLine) => claims.find((e) => e.id === line.provenance.sourceRef?.id) ?? null, [claims]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const group of summary.groups) {
      out.push({ type: "group", key: `g:${group.group}`, group });
      for (const line of group.lines) out.push({ type: "line", key: line.key, line });
    }
    return out;
  }, [summary.groups]);

  const metaOf = useCallback(
    (line: TaxLine) => {
      const cat = deductionCategory(line.category);
      const entry = line.provenance.origin === "user_entered" ? entryOf(line) : null;
      const proofs = line.provenance.documentIds?.length ?? 0;
      return [
        cat?.label ?? line.category,
        deductionSectionLabel(line.category, law),
        line.provenance.origin === "user_entered" ? "You added" : "From your EPF records",
        entry ? (proofs > 0 ? `${proofs} proof${proofs === 1 ? "" : "s"}` : PROOF_TEXT[entry.fields.proofStatus]) : null,
      ]
        .filter(Boolean)
        .join(" · ");
    },
    [entryOf, law]
  );

  const hintOf = useCallback((line: TaxLine): string | null => {
    if (line.reasons.includes("confirm_eligibility")) {
      return deductionCategory(line.category)?.hint ?? "Confirm you meet the conditions for this claim.";
    }
    if (line.reasons.includes("source_changed")) return "This changed after you decided. Check it again.";
    if (line.reasons.includes("user_replaced")) return "Replaced by your own entry.";
    return null;
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.type === "line") {
        return (
          <TaxLineRow
            line={item.line}
            currency={currency}
            onPress={setMenuFor}
            status={deductionStatus(item.line)}
            hint={hintOf(item.line)}
            meta={metaOf(item.line)}
          />
        );
      }
      const total = item.group.total.total;
      return (
        <View style={[styles.groupHeader, { paddingHorizontal: theme.space.lg, paddingTop: theme.space.lg, paddingBottom: theme.space.xs }]}>
          <Text accessibilityRole="header" style={{ flex: 1, color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }}>
            {item.group.title}
          </Text>
          {total === null ? (
            <Text style={{ color: theme.colors.mutedForeground }}>—</Text>
          ) : (
            <Amount value={total} currency={currency} ghostable style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }} />
          )}
        </View>
      );
    },
    [currency, hintOf, metaOf, theme]
  );

  if (!enabled || !fy) {
    if (flagLoading) return <PageShell scrollable={false}><LoadingState variant="spinner" /></PageShell>;
    return <Redirect href={"/tax" as Href} />;
  }

  const menu: ActionMenuItem[] = (() => {
    if (!menuFor) return [];
    const line = menuFor;
    const close = () => setMenuFor(null);
    if (line.provenance.origin !== "user_entered") {
      return [
        ...(line.included && line.state === "user_confirmed" ? [] : [{ label: "Claim it", disabled: !isOnline, onPress: () => (close(), void actions.epfDecision(line, { decision: "confirm" })) }]),
        ...(line.reasons.includes("user_excluded") ? [] : [{ label: "Don't claim it", disabled: !isOnline, onPress: () => (close(), void actions.epfDecision(line, { decision: "exclude" })) }]),
        {
          label: "Replace with my own entry…",
          disabled: !isOnline || claims.filter((e) => e.fields.category === "epf_employee").length === 0,
          disabledReason: "Add an EPF deduction first, e.g. the figure on your Form 16.",
          onPress: () => (close(), setReplacing(line)),
        },
        ...(line.override ? [{ label: "Undo my decision", onPress: () => (close(), void actions.undoEpf()) }] : []),
      ];
    }
    const entry = entryOf(line);
    if (!entry) return [];
    const sensitive = deductionCategory(entry.fields.category)?.eligibilitySensitive;
    return [
      { label: "Edit", onPress: () => (close(), setForm({ editing: entry })) },
      ...(sensitive && line.state === "needs_review"
        ? [{ label: "I'm eligible for this claim", disabled: !isOnline, disabledReason: isOnline ? undefined : "You're offline.", onPress: () => (close(), void actions.confirmEligibility(entry)) }]
        : []),
      ...(sensitive && line.state !== "needs_review" ? [{ label: "Undo eligibility confirmation", onPress: () => (close(), void actions.undoEligibility(entry)) }] : []),
      { label: "Delete", destructive: true, onPress: () => (close(), setDeleting(entry)) },
    ];
  })();

  const header = (
    <View style={{ gap: theme.space.sm, paddingHorizontal: theme.space.lg, paddingBottom: theme.space.sm }}>
      {!isOnline ? <TaxNotice tone="offline">You're offline. Changes save on this device and sync later.</TaxNotice> : null}
      <TaxNotice>
        Totals here are what you've recorded. Limits, and which deductions your tax regime allows, are applied in the estimate.
      </TaxNotice>
      {summary.overlaps.length > 0 ? (
        <TaxNotice tone="warning">
          EPF is counted from your EPF records and from an entry you added. If your entry covers the same money, open the EPF
          line and choose "Replace".
        </TaxNotice>
      ) : null}
      {summary.needsReview > 0 ? (
        <TaxNotice tone="warning">
          {summary.needsReview} claim{summary.needsReview === 1 ? "" : "s"} to check: open each to confirm.
        </TaxNotice>
      ) : null}
      {summary.epfNotYetDeducted > 0 ? (
        <TaxNotice>
          {summary.epfNotYetDeducted} EPF month{summary.epfNotYetDeducted === 1 ? " is" : "s are"} still expected, so not in the
          EPF figure yet.
        </TaxNotice>
      ) : null}
      <Button variant="tonal" size="sm" onPress={() => setForm({ editing: null })}>
        Add a deduction
      </Button>
    </View>
  );

  let body;
  if (error) {
    body = (
      <PageListStateScroll>
        <ErrorState title="Couldn't load your deductions" description={error.message} onRetry={error.retryable ? retry : undefined} />
      </PageListStateScroll>
    );
  } else if (loading) {
    body = <LoadingState variant="list" count={5} label="Loading your deductions…" />;
  } else if (rows.length === 0) {
    body = (
      <PageListStateScroll>
        <EmptyState
          illustration="budgets"
          title="No deductions for this year yet"
          description="Record what you invested or paid that you may claim: PPF, ELSS, insurance, NPS, loan interest, rent, donations. Attach the proofs as you go."
          primaryAction={{ label: "Add a deduction", onPress: () => setForm({ editing: null }) }}
        />
      </PageListStateScroll>
    );
  } else {
    body = <DeductionList rows={rows} renderItem={renderItem} header={header} />;
  }

  const epfEntries = claims.filter((e) => e.fields.category === "epf_employee");

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      <PageHeader
        title="Deductions"
        subtitle={taxYearLabel(fy)}
        icon={<PiggyBank size={20} color={theme.colors.primary} />}
        onBack={() => router.back()}
        rightElement={
          <Button variant="ghost" size="icon" onPress={() => setForm({ editing: null })} accessibilityLabel="Add a deduction">
            <Plus size={20} color={theme.colors.primary} />
          </Button>
        }
      />
      {body}

      <ActionMenuSheet isOpen={menuFor !== null} onClose={() => setMenuFor(null)} title={menuFor?.label ?? ""} actions={menu} />
      <ActionMenuSheet
        isOpen={replacing !== null}
        onClose={() => setReplacing(null)}
        title="Replace with which entry?"
        actions={epfEntries.map((entry) => ({
          label: entry.label || `Your EPF entry (${money(entry.fields.amount)})`,
          onPress: () => {
            const line = replacing;
            setReplacing(null);
            if (line) void actions.epfDecision(line, { decision: "replace", replacedBy: entry.id });
          },
        }))}
      />
      <TaxEntryFormSheet
        spec={form ? DEDUCTION_SPEC : null}
        fy={fy}
        todayKey={todayKey}
        editing={form?.editing ?? null}
        entries={entries}
        documents={docs.documents}
        documentsLoading={docs.loading}
        sourceOptions={sourceOptions}
        saving={actions.saving}
        onSave={({ id, draft, duplicateConfirmed, labels }) => actions.saveRecord({ id, draft, duplicateConfirmed, labels, title: "Deduction" })}
        onDelete={setDeleting}
        onClose={() => setForm(null)}
      />
      <Dialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this deduction?"
        description="It stops counting for this year. It's kept in your history."
        actions={[
          { label: "Cancel", variant: "ghost", onPress: () => setDeleting(null) },
          {
            label: "Delete",
            variant: "destructive",
            loading: actions.saving,
            onPress: () => {
              const entry = deleting;
              setDeleting(null);
              if (entry) void actions.removeRecord(entry.id, "Deduction");
            },
          },
        ]}
      />
    </PageShell>
  );
}

function DeductionList({
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
  groupHeader: { flexDirection: "row", alignItems: "center" },
});
