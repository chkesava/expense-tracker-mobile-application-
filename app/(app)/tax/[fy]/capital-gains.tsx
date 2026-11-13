import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ChartCandlestick, Plus } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Dialog } from "@/components/common/Dialog";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageListStateScroll } from "@/components/layout/PageListStateScroll";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { TaxCapitalGainRow } from "@/components/tax/TaxCapitalGainRow";
import { TaxCapitalGainSheet } from "@/components/tax/TaxCapitalGainSheet";
import { TaxEntryFormSheet } from "@/components/tax/TaxEntryFormSheet";
import { TaxNotice } from "@/components/tax/TaxNotice";
import { TaxRecordRow } from "@/components/tax/TaxRecordRow";
import { Button } from "@/components/ui/Button";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useTaxCapitalGains } from "@/hooks/useTaxCapitalGains";
import { useTaxCenterFlag } from "@/hooks/useTaxCenterEnabled";
import { useTaxDocuments } from "@/hooks/useTaxData";
import { useTaxRecordActions } from "@/hooks/useTaxRecordActions";
import { useNetwork } from "@/providers/NetworkProvider";
import { useSettings } from "@/providers/SettingsProvider";
import type { TaxEntry, TaxEntryOf } from "@/shared/features/tax/types";
import { ASSET_CLASS_LABELS, CG_TERM_LABELS } from "@/shared/features/tax/utils/capitalGainLabels";
import { capitalGainTotals, type CapitalGainRow, type CgClassSummary } from "@/shared/features/tax/utils/capitalGains";
import { findDuplicateTaxEntries } from "@/shared/features/tax/utils/dedupe";
import { CAPITAL_GAIN_TOTAL_FORM, ENTRY_FORMS, type EntryFormSpec } from "@/shared/features/tax/utils/entryForms";
import { isFinancialYearKey, taxYearLabel } from "@/shared/features/tax/utils/taxYear";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { todayDateKey } from "@/shared/utils/dates";
import { roundMoney } from "@/shared/utils/money";
import { useTheme } from "@/theme/ThemeProvider";

type Row =
  | { type: "class"; key: string; summary: CgClassSummary }
  | { type: "entry"; key: string; entry: TaxEntryOf<"capital_gain">; row?: CapitalGainRow }
  | { type: "sale"; key: string; rows: CapitalGainRow[] };

const SALE_SPEC = ENTRY_FORMS.capital_gain as EntryFormSpec;

function gainOf(f: TaxEntryOf<"capital_gain">["fields"]): number | null {
  return f.costOfAcquisition === null ? null : roundMoney(f.saleValue - f.costOfAcquisition - (f.transferExpenses ?? 0));
}

/**
 * Capital gains for one year (SPENDLY-293): sales Spendly finds in the
 * portfolio's trades (first in, first out), and the sales and broker-statement
 * totals the user adds. Spendly's sales count only once the user confirms
 * them; a statement total replaces Spendly's sales of that asset type.
 *
 * Source values (dates, cost, sale value, charges) are kept apart from what
 * Spendly works out (holding period, term, gain). Missing history is never
 * filled in: an unknown cost shows as unknown. No tax is worked out here.
 */
export default function TaxCapitalGainsScreen() {
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
  const { summary, entries, loading, error, retry } = useTaxCapitalGains(fy, { enabled: on });
  const actions = useTaxRecordActions(fy, todayKey);

  const [form, setForm] = useState<{ spec: EntryFormSpec; editing: TaxEntry | null } | null>(null);
  const [deleting, setDeleting] = useState<TaxEntry | null>(null);
  const [openSale, setOpenSale] = useState<string | null>(null);
  const docs = useTaxDocuments(fy, { enabled: on && form !== null });

  const formatDate = useCallback((date: string) => formatDisplayDate(date, settings?.dateFormat), [settings?.dateFormat]);
  const totals = useMemo(() => capitalGainTotals(summary), [summary]);
  const cgEntries = useMemo(() => entries.filter((e): e is TaxEntryOf<"capital_gain"> => e.kind === "capital_gain" && !e.deletedAt), [entries]);
  const duplicateIds = useMemo(
    () => new Set(findDuplicateTaxEntries(cgEntries).flatMap((group) => group.map((e) => e.id))),
    [cgEntries]
  );

  const rows = useMemo(() => {
    const byId = new Map(cgEntries.map((e) => [e.id, e]));
    const out: Row[] = [];
    for (const c of summary.classes) {
      out.push({ type: "class", key: `c:${c.assetClass}`, summary: c });
      for (const total of c.statementTotals) out.push({ type: "entry", key: total.id, entry: total });
      const sales = new Map<string, CapitalGainRow[]>();
      for (const r of c.rows) {
        if (r.origin === "user_entered") {
          const entry = byId.get(r.saleRef.id);
          if (entry) out.push({ type: "entry", key: entry.id, entry, row: r });
          continue;
        }
        const list = sales.get(r.saleRef.id);
        if (list) list.push(r);
        else sales.set(r.saleRef.id, [r]);
      }
      for (const [id, list] of sales) out.push({ type: "sale", key: `s:${id}`, rows: list });
    }
    return out;
  }, [cgEntries, summary.classes]);

  const openSaleRows = useMemo(
    () => (openSale ? summary.classes.flatMap((c) => c.rows.filter((r) => r.origin === "calculated" && r.saleRef.id === openSale)) : []),
    [openSale, summary.classes]
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.type === "sale") {
        return <TaxCapitalGainRow rows={item.rows} currency={currency} formatDate={formatDate} onPress={setOpenSale} />;
      }
      if (item.type === "entry") {
        const f = item.entry.fields;
        const isTotal = f.mode === "statement_total";
        return (
          <TaxRecordRow
            entry={item.entry}
            summary={{
              title: isTotal ? `${f.assetName} · ${CG_TERM_LABELS[f.term ?? "short_term"]}` : f.assetName,
              subtitle: isTotal
                ? `Statement total · up to ${formatDate(f.soldDate)}`
                : [
                    "You added this",
                    f.quantity != null ? `${f.quantity} units` : null,
                    `sold ${formatDate(f.soldDate)}`,
                    item.row ? (item.row.term === "unknown" ? "Term unknown" : item.row.term === "unsupported" ? "Not supported" : CG_TERM_LABELS[item.row.term]) : null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
              amount: gainOf(f),
              amountLabel: gainOf(f) === null ? "Cost unknown" : (gainOf(f) ?? 0) < 0 ? "Loss" : "Gain",
            }}
            status={isTotal ? { label: "Counts instead of Spendly's sales of this type", tone: "muted" } : undefined}
            duplicate={duplicateIds.has(item.entry.id)}
            currency={currency}
            onPress={(entry) => setForm({ spec: isTotal ? CAPITAL_GAIN_TOTAL_FORM : SALE_SPEC, editing: entry })}
          />
        );
      }
      const c = item.summary;
      return (
        <View style={{ paddingHorizontal: theme.space.lg, paddingTop: theme.space.lg, paddingBottom: theme.space.xs, gap: 2 }}>
          <Text accessibilityRole="header" style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }}>
            {ASSET_CLASS_LABELS[c.assetClass]}
          </Text>
          <View style={[styles.inline, { gap: theme.space.md }]}>
            <TermTotal label="Short-term" value={c.byTerm.short_term.rows ? c.byTerm.short_term.gain : 0} currency={currency} />
            <TermTotal label="Long-term" value={c.byTerm.long_term.rows ? c.byTerm.long_term.gain : 0} currency={currency} />
          </View>
        </View>
      );
    },
    [currency, duplicateIds, formatDate, theme]
  );

  if (!enabled || !fy) {
    if (flagLoading) return <PageShell scrollable={false}><LoadingState variant="spinner" /></PageShell>;
    return <Redirect href={"/tax" as Href} />;
  }

  const addSale = () => setForm({ spec: SALE_SPEC, editing: null });
  const addTotal = () => setForm({ spec: CAPITAL_GAIN_TOTAL_FORM, editing: null });
  const unknownTerm = totals.unknown.rows + totals.unsupported.rows;

  const header = (
    <View style={{ gap: theme.space.sm, paddingHorizontal: theme.space.lg, paddingBottom: theme.space.sm }}>
      {!isOnline ? <TaxNotice tone="offline">You're offline. Changes save on this device and sync later.</TaxNotice> : null}
      <TaxNotice>
        Sales in {taxYearLabel(fy)}. Spendly finds sales in your portfolio and works out each one's term and gain; they count once
        you confirm them. A broker statement total replaces Spendly's sales of that asset type. No tax is worked out here.
      </TaxNotice>
      <View style={[styles.inline, { gap: theme.space.md }]}>
        <Total label="Short-term gains" value={totals.short_term.gain} currency={currency} />
        <Total label="Long-term gains" value={totals.long_term.gain} currency={currency} />
      </View>
      {summary.toConfirm > 0 ? (
        <TaxNotice tone="warning">
          {summary.toConfirm} sale{summary.toConfirm === 1 ? "" : "s"} from your portfolio {summary.toConfirm === 1 ? "isn't" : "aren't"} counted yet.
          Open {summary.toConfirm === 1 ? "it" : "each"} to check and confirm.
        </TaxNotice>
      ) : null}
      {summary.missingCost > 0 || totals.short_term.gain === null || totals.long_term.gain === null ? (
        <TaxNotice tone="warning">Some counted sales have no cost, so their gain is unknown. Add the cost from your contract note or statement.</TaxNotice>
      ) : null}
      {unknownTerm > 0 ? (
        <TaxNotice tone="warning">
          {unknownTerm} counted sale{unknownTerm === 1 ? " has" : "s have"} no term: the buy date is missing, or it's a virtual asset with its own rules.
        </TaxNotice>
      ) : null}
      {duplicateIds.size > 0 ? <TaxNotice tone="warning">Some sales look entered twice. Open them to check.</TaxNotice> : null}
      <View style={[styles.inline, { gap: theme.space.sm }]}>
        <Button variant="tonal" size="sm" onPress={addSale} style={styles.addBtn}>
          Add a sale
        </Button>
        <Button variant="tonal" size="sm" onPress={addTotal} style={styles.addBtn}>
          Add a statement total
        </Button>
      </View>
    </View>
  );

  let body;
  if (error) {
    body = (
      <PageListStateScroll>
        <ErrorState title="Couldn't load your capital gains" description={error.message} onRetry={error.retryable ? retry : undefined} />
      </PageListStateScroll>
    );
  } else if (loading) {
    body = <LoadingState variant="list" count={4} label="Loading your sales…" />;
  } else if (rows.length === 0) {
    body = (
      <PageListStateScroll>
        <EmptyState
          illustration="investments"
          title="No sales for this year"
          description="Sales in your Spendly portfolio show here. Add sales from elsewhere, or your broker's capital gains statement totals."
          primaryAction={{ label: "Add a sale", onPress: addSale }}
          secondaryAction={{ label: "Add a statement total", onPress: addTotal }}
        />
      </PageListStateScroll>
    );
  } else {
    body = <GainList rows={rows} renderItem={renderItem} header={header} />;
  }

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      <PageHeader
        title="Capital gains"
        subtitle={taxYearLabel(fy)}
        icon={<ChartCandlestick size={20} color={theme.colors.primary} />}
        onBack={() => router.back()}
        rightElement={
          <Button variant="ghost" size="icon" onPress={addSale} accessibilityLabel="Add a sale">
            <Plus size={20} color={theme.colors.primary} />
          </Button>
        }
      />
      {body}

      <TaxCapitalGainSheet
        rows={openSaleRows}
        currency={currency}
        formatDate={formatDate}
        saving={actions.saving}
        onDecide={(sale, choice) => void actions.saleDecision(sale, choice)}
        onUndo={(saleId) => void actions.undoSale(saleId)}
        onClose={() => setOpenSale(null)}
      />
      <TaxEntryFormSheet
        spec={form?.spec ?? null}
        fy={fy}
        todayKey={todayKey}
        editing={form?.editing ?? null}
        entries={entries}
        documents={docs.documents}
        documentsLoading={docs.loading}
        saving={actions.saving}
        onSave={({ id, draft, duplicateConfirmed, labels }) =>
          actions.saveRecord({ id, draft, duplicateConfirmed, labels, title: form?.spec === CAPITAL_GAIN_TOTAL_FORM ? "Statement total" : "Sale" })
        }
        onDelete={setDeleting}
        onClose={() => setForm(null)}
      />
      <Dialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this?"
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
              if (entry) void actions.removeRecord(entry.id, "Capital gain record");
            },
          },
        ]}
      />
    </PageShell>
  );
}

function Total({ label, value, currency }: { label: string; value: number | null; currency: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>{label}</Text>
      {value === null ? (
        <Text style={{ color: theme.colors.warning, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }}>Unknown</Text>
      ) : (
        <Amount value={value} currency={currency} ghostable style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }} />
      )}
    </View>
  );
}

function TermTotal({ label, value, currency }: { label: string; value: number | null; currency: string }) {
  const { theme } = useTheme();
  const style = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  return (
    <View style={[styles.inline, { gap: 4 }]}>
      <Text style={style}>{label}</Text>
      {value === null ? <Text style={[style, { color: theme.colors.warning }]}>unknown</Text> : <Amount value={value} currency={currency} ghostable style={style} />}
    </View>
  );
}

function GainList({
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
  inline: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  // A real basis so the pair wraps on a phone ("Add a stateme…" at flex: 1).
  addBtn: { flexGrow: 1, flexBasis: 150 },
});
