import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { IndianRupee, Plus } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Dialog } from "@/components/common/Dialog";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageListStateScroll } from "@/components/layout/PageListStateScroll";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { TaxIncomeEntrySheet } from "@/components/tax/TaxIncomeEntrySheet";
import { TaxIncomeLineSheet } from "@/components/tax/TaxIncomeLineSheet";
import { TaxLineRow } from "@/components/tax/TaxLineRow";
import { TaxNotice } from "@/components/tax/TaxNotice";
import { Button } from "@/components/ui/Button";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useTaxCenterFlag } from "@/hooks/useTaxCenterEnabled";
import { useTaxIncome } from "@/hooks/useTaxIncome";
import { useTaxIncomeActions } from "@/hooks/useTaxIncomeActions";
import { useTaxDocuments } from "@/hooks/useTaxData";
import { useNetwork } from "@/providers/NetworkProvider";
import type { TaxEntryOf, TaxLine } from "@/shared/features/tax/types";
import {
  categoryLabel,
  incompleteText,
  taxIncomeSections,
  type TaxIncomeSection,
} from "@/shared/features/tax/utils/incomePresentation";
import { isFinancialYearKey, taxYearLabel } from "@/shared/features/tax/utils/taxYear";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

type Row =
  | { type: "section"; key: string; section: TaxIncomeSection }
  | { type: "salary"; key: string }
  | { type: "notCounted"; key: string; count: number }
  | { type: "line"; key: string; line: TaxLine };

/**
 * Income for one financial year (SPENDLY-290), grouped by head of income.
 *
 * Facts and calculations stay apart: each row says where its figure came
 * from (Spendly income, Spendly's calculation, or the user), and whether it
 * counts. Salary credits are shown as take-home pay to compare with Form 16,
 * never as taxable salary. A head's total appears only once the whole year
 * is loaded and every counted amount is known.
 */
export default function TaxIncomeScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { fy: param } = useLocalSearchParams<{ fy: string }>();
  const fy = typeof param === "string" && isFinancialYearKey(param) ? param : "";
  const { enabled, loading: flagLoading } = useTaxCenterFlag();
  const currency = useDisplayCurrency();
  const { isOnline } = useNetwork();
  const { summary, entries, todayKey, loading, error, retry } = useTaxIncome(fy, { enabled: enabled && !!fy });
  const actions = useTaxIncomeActions(fy, todayKey);

  const [selected, setSelected] = useState<TaxLine | null>(null);
  const [form, setForm] = useState<{ open: boolean; editing: TaxEntryOf<"income"> | null }>({ open: false, editing: null });
  const [deleting, setDeleting] = useState<string | null>(null);
  // SPENDLY-406: the year's documents are read only while the form is open.
  const taxDocuments = useTaxDocuments(fy, { enabled: enabled && !!fy && form.open });

  const incomeEntries = useMemo(
    () => entries.filter((e): e is TaxEntryOf<"income"> => e.kind === "income" && !e.deletedAt),
    [entries]
  );
  const { sections, notCounted } = useMemo(() => taxIncomeSections(summary), [summary]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const section of sections) {
      out.push({ type: "section", key: `head:${section.head}`, section });
      if (section.head === "salary" && summary.salaryCredits.items.length > 0) out.push({ type: "salary", key: "salary" });
      for (const line of section.lines) out.push({ type: "line", key: line.key, line });
    }
    if (notCounted.length > 0) {
      out.push({ type: "notCounted", key: "notCounted", count: notCounted.length });
      for (const line of notCounted) out.push({ type: "line", key: line.key, line });
    }
    return out;
  }, [notCounted, sections, summary.salaryCredits.items.length]);

  const openEntry = useCallback(
    (entryId: string) => setForm({ open: true, editing: incomeEntries.find((e) => e.id === entryId) ?? null }),
    [incomeEntries]
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.type === "line") return <TaxLineRow line={item.line} currency={currency} onPress={setSelected} />;
      if (item.type === "section") return <SectionHeader section={item.section} currency={currency} />;
      if (item.type === "salary") return <SalaryCredits total={summary.salaryCredits.total} count={summary.salaryCredits.items.length} currency={currency} />;
      return <PlainHeader title="Not counted" subtitle={`${item.count} item${item.count === 1 ? "" : "s"} that don't count as income here`} />;
    },
    [currency, summary.salaryCredits.items.length, summary.salaryCredits.total]
  );

  if (!enabled || !fy) {
    if (flagLoading) return <PageShell scrollable={false}><LoadingState variant="spinner" /></PageShell>;
    return <Redirect href={"/tax" as Href} />;
  }

  const notice = incompleteText(summary, isOnline);
  const header = (
    <View style={{ gap: theme.space.sm, paddingHorizontal: theme.space.lg, paddingBottom: theme.space.md }}>
      {!isOnline ? <TaxNotice tone="offline">You're offline. Changes save on this device and sync later.</TaxNotice> : null}
      {notice ? <TaxNotice tone="warning">{notice}</TaxNotice> : null}
      {summary.overlaps.length > 0 ? (
        <TaxNotice tone="warning">
          {summary.overlaps.map(categoryLabel).join(", ")} is counted both from your Spendly income and from income you
          added. If your entry covers the same money, open the Spendly item and choose "Replace".
        </TaxNotice>
      ) : null}
      {summary.needsReview > 0 ? (
        <TaxNotice tone="warning">
          {summary.needsReview} item{summary.needsReview === 1 ? "" : "s"} changed after you decided. Check{" "}
          {summary.needsReview === 1 ? "it" : "them"} again.
        </TaxNotice>
      ) : null}
      <Button
        variant="tonal"
        size="sm"
        onPress={() => setForm({ open: true, editing: null })}
        accessibilityLabel="Add income that isn't in Spendly"
      >
        Add income
      </Button>
    </View>
  );

  let body;
  if (error) {
    body = (
      <PageListStateScroll>
        <ErrorState title="Couldn't load your income" description={error.message} onRetry={error.retryable ? retry : undefined} />
      </PageListStateScroll>
    );
  } else if (loading) {
    body = <LoadingState variant="list" count={6} label="Gathering this year's income…" />;
  } else if (rows.length === 0 && summary.complete) {
    body = (
      <PageListStateScroll>
        <EmptyState
          illustration="income"
          title="No income for this year yet"
          description="Spendly lists interest, dividends, rent and other income it finds for the year. Add anything it can't see, such as rent received in cash."
          primaryAction={{ label: "Add income", onPress: () => setForm({ open: true, editing: null }) }}
        />
      </PageListStateScroll>
    );
  } else {
    body = <IncomeList rows={rows} renderItem={renderItem} header={header} />;
  }

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      <PageHeader
        title="Income"
        subtitle={taxYearLabel(fy)}
        icon={<IndianRupee size={20} color={theme.colors.primary} />}
        onBack={() => router.back()}
        rightElement={
          <Button variant="ghost" size="icon" onPress={() => setForm({ open: true, editing: null })} accessibilityLabel="Add income">
            <Plus size={20} color={theme.colors.primary} />
          </Button>
        }
      />
      {body}

      <TaxIncomeLineSheet
        line={selected}
        entries={incomeEntries}
        currency={currency}
        saving={actions.saving}
        onDecide={(line, choice) => void actions.decide(line, choice)}
        onUndo={(line) => void actions.undo(line)}
        onEditEntry={openEntry}
        onDeleteEntry={setDeleting}
        onClose={() => setSelected(null)}
      />
      <TaxIncomeEntrySheet
        isOpen={form.open}
        fy={fy}
        todayKey={todayKey}
        editing={form.editing}
        entries={entries}
        documents={taxDocuments.documents}
        documentsLoading={taxDocuments.loading}
        saving={actions.saving}
        onSave={actions.saveEntry}
        onClose={() => setForm({ open: false, editing: null })}
      />
      <Dialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this income?"
        description="It stops counting for this year. Your Spendly income and balances aren't affected."
        actions={[
          { label: "Cancel", variant: "ghost", onPress: () => setDeleting(null) },
          {
            label: "Delete",
            variant: "destructive",
            loading: actions.saving,
            onPress: () => {
              const id = deleting;
              setDeleting(null);
              if (id) void actions.removeEntry(id);
            },
          },
        ]}
      />
    </PageShell>
  );
}

function IncomeList({
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

function SectionHeader({ section, currency }: { section: TaxIncomeSection; currency: string }) {
  const { theme } = useTheme();
  const total = section.total.total;
  const reason =
    total !== null ? null : section.total.missingLines > 0 ? "An amount is unknown" : "Still loading the year";
  return (
    <View style={[styles.header, { paddingHorizontal: theme.space.lg, paddingTop: theme.space.lg, paddingBottom: theme.space.sm, gap: theme.space.md }]}>
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }}>
          {section.title}
        </Text>
        {reason ? (
          <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>{reason}</Text>
        ) : null}
      </View>
      {total === null ? (
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }}>—</Text>
      ) : (
        <Amount value={total} currency={currency} ghostable style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }} />
      )}
    </View>
  );
}

function SalaryCredits({ total, count, currency }: { total: number; count: number; currency: string }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  return (
    <View style={{ marginHorizontal: theme.space.lg, marginBottom: theme.space.sm, padding: theme.space.md, borderRadius: theme.radius.md, backgroundColor: surfaces.tile, gap: 4 }}>
      <View style={styles.header}>
        <Text style={{ flex: 1, color: theme.colors.foreground, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.sm }}>
          Salary received in your bank
        </Text>
        <Amount value={total} currency={currency} ghostable style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }} />
      </View>
      <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs, lineHeight: 17 }}>
        {count} credit{count === 1 ? "" : "s"}. This is take-home pay, after tax and deductions, so it isn't counted. Your gross
        salary comes from Form 16, or add it yourself.
      </Text>
    </View>
  );
}

function PlainHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ paddingHorizontal: theme.space.lg, paddingTop: theme.space.lg, paddingBottom: theme.space.sm }}>
      <Text accessibilityRole="header" style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }}>
        {title}
      </Text>
      <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  listWrap: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center" },
});
