import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { AlertTriangle } from "lucide-react-native";

import { ErrorState } from "@/components/common/ErrorState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { EpfContributionEditSheet } from "@/components/epf/EpfContributionEditSheet";
import { EpfContributionRow } from "@/components/epf/EpfContributionRow";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useSpendlyBottomClearance } from "@/components/layout/useSpendlyBottomClearance";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useEpfContributions } from "@/hooks/useEpfContributions";
import { appDialog } from "@/lib/appDialog";
import { epfCurrentMonth, epfTodayKey } from "@/shared/features/epf/utils/epfClock";
import type { EpfBackfillRow, EpfEstablishment } from "@/shared/features/epf/types";
import { deriveMonthState } from "@/shared/features/epf/utils/monthState";
import { backfillThroughMonth } from "@/shared/features/epf/utils/schedule";
import {
  buildBackfillRows,
  computeEpfContribution,
  contributionMonthsFor,
  contributionStatusMeta,
  summarizeContributions,
  groupContributionsByFinancialYear,
  validateBackfillBatch,
} from "@/shared/features/epf/utils/contributions";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { financialYearLabel } from "@/shared/utils/financialYear";
import { useTheme } from "@/theme/ThemeProvider";
import { monthLabel } from "@/shared/utils/monthLabel";
import {
  clearSavedEdits,
  backfillRowPresentation,
  backfillSaveRows,
  mergeBackfillEdits,
  persistedAmountsDiffer,
  statusForAppliedEdit,
  unsavedBackfillSummary,
  upsertBackfillEdit,
} from "@/shared/features/epf/utils/backfillDraft";

type ListItem =
  | { type: "header"; id: string; financialYear: string; recorded: number; expected: number; credit: number }
  | { type: "row"; id: string; month: string };

export interface EpfBackfillDraftState {
  wage: string;
  setWage: (value: string) => void;
  epsEligible: boolean;
  setEpsEligible: (value: boolean) => void;
  prorate: boolean;
  setProrate: (value: boolean) => void;
  edits: Map<string, EpfBackfillRow>;
  setEdits: Dispatch<SetStateAction<Map<string, EpfBackfillRow>>>;
  /** Wage at the last successful bulk save — see `unsavedBackfillSummary`. */
  savedWage: string;
  setSavedWage: (value: string) => void;
}

export function EpfBackfillScreen({
  establishment,
  draft,
}: {
  establishment: EpfEstablishment;
  /**
   * Bulk-fill state, owned by the route — SPENDLY-1.
   *
   * The establishment screen swaps tabs with a ternary, so this component
   * unmounts on every tab change. Holding the typed wage here meant it was
   * silently destroyed; the route outlives the tab switch.
   */
  draft: EpfBackfillDraftState;
}) {
  const { theme } = useTheme();
  const currency = useDisplayCurrency();
  const bottomClearance = useSpendlyBottomClearance({ withFab: true });
  const {
    contributions,
    contributionsLoading,
    contributionsError,
    retryContributions,
    hasDrafts,
    saveContribution,
    saveContributions,
    deleteContribution,
    discardDrafts,
  } = useEpfContributions(establishment.id);

  const {
    wage,
    setWage,
    epsEligible,
    setEpsEligible,
    prorate,
    setProrate,
    edits,
    setEdits,
    savedWage,
    setSavedWage,
  } = draft;
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const monthKey = epfCurrentMonth();
  const todayKey = epfTodayKey();
  /**
   * SPENDLY-72: Backfill is for history, so a live employment's in-progress
   * month is out of range — it belongs to Current, as an `expected` row the
   * scheduler owns. Reaching it is what let **Save all** stamp the current
   * month `confirmed` ("Manual") before any credit could have landed.
   */
  const backfillMonth = backfillThroughMonth(establishment, monthKey);

  const money = useCallback(
    (value: number) => formatAmount(value, currency),
    [currency]
  );

  /** Generated months merged with saved docs, then with unsaved local edits. */
  const rows = useMemo(() => {
    const generated = buildBackfillRows({
      establishment,
      currentMonth: backfillMonth,
      existing: contributions,
      wage: Number(wage) || 0,
      epsEligible,
      prorateEdgeMonths: prorate,
    });
    return mergeBackfillEdits(generated, edits);
  }, [establishment, backfillMonth, contributions, wage, epsEligible, prorate, edits]);

  const expectedMonths = useMemo(
    () => contributionMonthsFor(establishment, backfillMonth),
    [establishment, backfillMonth]
  );

  /** What Save draft / Save all may write — never silent rewrite of saved months. */
  const saveRows = useMemo(
    () => backfillSaveRows({ rows, edits, wage: Number(wage) || 0 }),
    [rows, edits, wage]
  );

  /**
   * The headline is the saved months only — SPENDLY-69.
   *
   * It used to include wage-filled suggestions, so Backfill quoted a figure
   * History and Balance had never heard of. Suggestions get their own line
   * below instead of being folded into the total.
   */
  const savedTotals = useMemo(
    () => summarizeContributions(rows.filter((row) => row.persisted)),
    [rows]
  );

  const suggestedTotals = useMemo(
    () =>
      summarizeContributions(
        rows.filter((row) => !row.persisted && row.epfCredit > 0)
      ),
    [rows]
  );

  /** What the footer chip shows and what the route's leave-guard reads. */
  const unsaved = useMemo(
    () => unsavedBackfillSummary({ edits, wage, savedWage }),
    [edits, wage, savedWage]
  );

  const validation = useMemo(
    () =>
      validateBackfillBatch(saveRows, {
        establishment,
        currentDateKey: todayKey,
      }),
    [saveRows, establishment, todayKey]
  );

  const items = useMemo((): ListItem[] => {
    // The same grouping EpfContributionHistory uses, rather than a second
    // hand-rolled copy (KAN-73). Rows arrive month-ascending from
    // buildBackfillRows, which is the order the grouping produces too.
    const out: ListItem[] = [];
    for (const group of groupContributionsByFinancialYear(rows, expectedMonths)) {
      // Counted from saved rows against expectedMonths, the same rule History
      // uses, so the two screens cannot quote different years (SPENDLY-69).
      const saved = group.rows.filter((row) => row.persisted);
      out.push({
        type: "header",
        id: `fy-${group.financialYear}`,
        financialYear: group.financialYear,
        recorded: saved.length,
        expected: group.expectedCount,
        credit: summarizeContributions(saved).epfCredit,
      });
      // Every generated month still lists, so the bulk-fill workflow is intact.
      for (const row of group.rows) {
        out.push({ type: "row", id: row.month, month: row.month });
      }
    }
    return out;
  }, [rows, expectedMonths]);

  const rowsByMonth = useMemo(
    () => new Map(rows.map((row) => [row.month, row])),
    [rows]
  );

  /**
   * Apply a single month's edit — SPENDLY-1 / SPENDLY-68.
   *
   * This used to write only to local state, so the edit was destroyed by the
   * next tab switch with no warning, while the *same* sheet's "Remove this
   * month" committed immediately. One button in the sheet was durable and the
   * other was not, which is why the flow read as saved.
   *
   * A month the user opened, typed into and applied is a filled row, so
   * persisting it here is consistent with KAN-66's lazy-generation rule: the
   * untouched months are still never written.
   *
   * Replacing amounts that already exist in Firestore requires an explicit
   * confirm so a recalculated/prorated suggestion cannot silently overwrite
   * an actual remittance (SPENDLY-68).
   */
  const applyEdit = useCallback(
    async (row: EpfBackfillRow) => {
      const commit = async () => {
        // Optimistic first — the snapshot round-trip is not instant.
        setEdits((prev) => upsertBackfillEdit(prev, row));

        const ok = await saveContribution(row, statusForAppliedEdit(row));
        if (!ok) return; // keep it in `edits` so Save draft can still recover it

        // Durable now: let the Firestore snapshot own this month again.
        setEdits((prev) => clearSavedEdits(prev, [row.month]));
      };

      const existing = contributions.find((item) => item.month === row.month);
      if (existing && persistedAmountsDiffer(existing, row)) {
        appDialog.alert(
          "Replace saved contribution?",
          `${monthLabel(row.month)} already has saved amounts. Replace them with these values?`,
          [
            { text: "Keep saved", style: "cancel" },
            {
              text: "Replace",
              style: "destructive",
              onPress: () => {
                void commit();
              },
            },
          ]
        );
        return;
      }

      await commit();
    },
    [contributions, saveContribution, setEdits]
  );

  const handleSave = async (status: "draft" | "confirmed") => {
    const payload = status === "confirmed" ? validation.valid : saveRows;
    if (status === "confirmed" && validation.errorCount > 0) {
      appDialog.alert(
        "Some months need attention",
        `${validation.errorCount} month${validation.errorCount === 1 ? "" : "s"} could not be saved. Save the rest and fix those later?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Save the rest",
            onPress: () => {
              void runSave(payload, status);
            },
          },
        ]
      );
      return;
    }
    await runSave(payload, status);
  };

  const runSave = async (payload: EpfBackfillRow[], status: "draft" | "confirmed") => {
    setSaving(true);
    const result = await saveContributions(payload, { status });
    setSaving(false);
    if (result.failed === 0) {
      setEdits(new Map());
      // The bulk fill is durable now, so the leave-guard must stop warning
      // about it until the wage changes again.
      setSavedWage(wage);
    }
  };

  const confirmDiscardDrafts = () => {
    appDialog.alert(
      "Discard drafts",
      "Remove every draft month for this employer? Confirmed months are kept.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            void discardDrafts();
          },
        },
      ]
    );
  };

  if (contributionsLoading) {
    return (
      <View style={styles.container}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  if (contributionsError) {
    return (
      <ErrorState
        title="Couldn't load contributions"
        description={contributionsError.message}
        onRetry={retryContributions}
      />
    );
  }

  const editingRow = editingMonth ? (rowsByMonth.get(editingMonth) ?? null) : null;
  const preview = computeEpfContribution({
    wage: Number(wage) || 0,
    month: monthKey,
    epsEligible,
  });

  const listHeader = (
    <View style={styles.header}>
      {backfillMonth < monthKey ? (
        <Text style={[styles.rangeHint, { color: theme.colors.mutedForeground }]}>
          Closed months only, up to {monthLabel(backfillMonth)}. {monthLabel(monthKey)} is
          still in progress — it is tracked on Current.
        </Text>
      ) : null}
      <Card>
        <Input
          label="Monthly EPF wage (basic + DA)"
          value={wage}
          onChangeText={setWage}
          keyboardType="numeric"
          placeholder="e.g. 25000"
          helperText="Fills empty months below. Saved months keep their amounts until you edit them."
        />

        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={[styles.switchLabel, { color: theme.colors.foreground }]}>
              Pension (EPS) member
            </Text>
            <Text style={[styles.switchCaption, { color: theme.colors.mutedForeground }]}>
              Turn off if your first EPF account was opened on or after 1 Sep 2014 while
              earning above the wage ceiling — then the full employer share goes to EPF.
            </Text>
          </View>
          <Switch value={epsEligible} onValueChange={setEpsEligible} />
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={[styles.switchLabel, { color: theme.colors.foreground }]}>
              Pro-rate part months
            </Text>
            <Text style={[styles.switchCaption, { color: theme.colors.mutedForeground }]}>
              Suggests a reduced wage for unfilled joining and leaving months only. Many
              employers still remit a full month — edit those months to match EPFO.
            </Text>
          </View>
          <Switch value={prorate} onValueChange={setProrate} />
        </View>

        {Number(wage) > 0 ? (
          <Text style={[styles.preview, { color: theme.colors.mutedForeground }]}>
            Each full month: you {money(preview.employeeShare)} · employer{" "}
            {money(preview.employerShare)} · pension {money(preview.epsShare)} ·{" "}
            <Text style={{ color: theme.colors.foreground }}>
              {money(preview.epfCredit)} into EPF
            </Text>
          </Text>
        ) : null}
      </Card>

      {validation.errorCount > 0 ? (
        <View style={[styles.issueBanner, { borderColor: theme.colors.destructive }]}>
          <AlertTriangle size={theme.iconSize.sm} color={theme.colors.destructive} />
          <Text style={[styles.issueText, { color: theme.colors.destructive }]}>
            {validation.errorCount} month{validation.errorCount === 1 ? "" : "s"} need
            attention before saving.
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.flex}>
      <FlashList
        data={items}
        keyExtractor={(item) => item.id}
        getItemType={(item) => item.type}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        // A Map mutation does not change identity, so hand the virtualizer a
        // derived scalar to force a re-render.
        extraData={`${wage}-${epsEligible}-${prorate}-${edits.size}-${contributions.length}`}
        renderItem={({ item }) => {
          if (item.type === "header") {
            return (
              <View style={styles.fyHeader}>
                <Text style={[styles.fyTitle, { color: theme.colors.foreground }]}>
                  {financialYearLabel(item.financialYear)}
                </Text>
                <Text style={[styles.fyMeta, { color: theme.colors.mutedForeground }]}>
                  {item.recorded} of {item.expected} · {money(item.credit)}
                </Text>
              </View>
            );
          }

          const row = rowsByMonth.get(item.month);
          if (!row) return null;
          const meta = contributionStatusMeta(
            deriveMonthState(row, todayKey, monthKey),
            row.source
          );
          const presentation = backfillRowPresentation(row);
          return (
            <EpfContributionRow
              month={row.month}
              monthLabel={monthLabel(row.month)}
              employeeShare={row.employeeShare}
              employerShare={row.employerShare}
              epsShare={row.epsShare}
              epfCredit={row.epfCredit}
              statusLabel={meta.label}
              statusTone={meta.tone}
              overridden={row.overridden === true}
              partialMonth={row.partialMonth === true}
              recorded={presentation.recorded}
              suggested={presentation.suggested}
              hasIssue={Boolean(validation.issuesByMonth[row.month])}
              formatAmount={money}
              onPress={setEditingMonth}
            />
          );
        }}
      />

      <View
        style={[
          styles.footer,
          {
            borderTopColor: theme.colors.border,
            // Theme padding (16) plus nav/FAB/inset so Save stays tappable.
            paddingBottom: 16 + bottomClearance,
          },
        ]}
      >
        <View style={styles.footerTotals}>
          <Text style={[styles.footerLabel, { color: theme.colors.mutedForeground }]}>
            {savedTotals.count} of {expectedMonths.length} months · pension{" "}
            {money(savedTotals.eps)}
          </Text>
          <Text style={[styles.footerCredit, { color: theme.colors.foreground }]}>
            {money(savedTotals.epfCredit)} into EPF
          </Text>
          {suggestedTotals.epfCredit > 0 ? (
            <Text style={[styles.unsaved, { color: theme.colors.mutedForeground }]}>
              + {money(suggestedTotals.epfCredit)} suggested · not saved yet
            </Text>
          ) : unsaved.dirty ? (
            <Text style={[styles.unsaved, { color: theme.colors.mutedForeground }]}>
              {unsaved.label} · not saved yet
            </Text>
          ) : null}
        </View>
        <View style={styles.footerButtons}>
          <Button variant="secondary" size="sm" onPress={() => handleSave("draft")} loading={saving}>
            Save draft
          </Button>
          <Button size="sm" onPress={() => handleSave("confirmed")} loading={saving}>
            Save all
          </Button>
        </View>
        {hasDrafts ? (
          <Text
            onPress={confirmDiscardDrafts}
            style={[styles.discard, { color: theme.colors.destructive }]}
          >
            Discard drafts
          </Text>
        ) : null}
      </View>

      <EpfContributionEditSheet
        isOpen={editingMonth !== null}
        onClose={() => setEditingMonth(null)}
        row={editingRow}
        monthLabel={editingMonth ? monthLabel(editingMonth) : ""}
        onApply={applyEdit}
        onRemove={(month) => {
          void deleteContribution(month);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rangeHint: { fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
  flex: { flex: 1 },
  container: { gap: 12, padding: 16 },
  unsaved: { fontSize: 12, marginTop: 2 },
  listContent: { padding: 16, paddingBottom: 24 },
  header: { gap: 12, marginBottom: 12 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
  },
  switchText: { flex: 1, gap: 2 },
  switchLabel: { fontSize: 14, fontWeight: "500" },
  switchCaption: { fontSize: 12, lineHeight: 16 },
  preview: { marginTop: 12, fontSize: 12, lineHeight: 18 },
  issueBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
  },
  issueText: { fontSize: 13, flex: 1 },
  fyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  fyTitle: { fontSize: 14, fontWeight: "700" },
  fyMeta: { fontSize: 12 },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  footerTotals: { gap: 2 },
  footerLabel: { fontSize: 12 },
  footerCredit: { fontSize: 16, fontWeight: "700" },
  footerButtons: { flexDirection: "row", gap: 10 },
  discard: { fontSize: 12, fontWeight: "600", textAlign: "center" },
});
