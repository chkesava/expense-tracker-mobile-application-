import { useCallback, useMemo, useState } from "react";
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
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useEpfContributions } from "@/hooks/useEpfContributions";
import { appDialog } from "@/lib/appDialog";
import { epfCurrentMonth, epfTodayKey } from "@/shared/features/epf/utils/epfClock";
import type { EpfBackfillRow, EpfEstablishment } from "@/shared/features/epf/types";
import {
  buildBackfillRows,
  computeEpfContribution,
  contributionMonthsFor,
  contributionStatusMeta,
  summarizeContributions,
  validateBackfillBatch,
} from "@/shared/features/epf/utils/contributions";
import { formatAmount } from "@/shared/utils/formatCurrency";
import {
  compareFinancialYears,
  financialYearLabel,
  financialYearOfMonth,
} from "@/shared/utils/financialYear";
import { useTheme } from "@/theme/ThemeProvider";

type ListItem =
  | { type: "header"; id: string; financialYear: string; recorded: number; expected: number; credit: number }
  | { type: "row"; id: string; month: string };

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthLabel(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  return `${MONTH_LABELS[index] ?? month} ${month.slice(0, 4)}`;
}

export function EpfBackfillScreen({ establishment }: { establishment: EpfEstablishment }) {
  const { theme } = useTheme();
  const currency = useDisplayCurrency();
  const {
    contributions,
    contributionsLoading,
    contributionsError,
    retryContributions,
    hasDrafts,
    saveContributions,
    deleteContribution,
    discardDrafts,
  } = useEpfContributions(establishment.id);

  const [wage, setWage] = useState("");
  const [epsEligible, setEpsEligible] = useState(establishment.epsMember !== false);
  const [prorate, setProrate] = useState(true);
  const [edits, setEdits] = useState<Map<string, EpfBackfillRow>>(new Map());
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const monthKey = epfCurrentMonth();
  const todayKey = epfTodayKey();

  const money = useCallback(
    (value: number) => formatAmount(value, currency),
    [currency]
  );

  /** Generated months merged with saved docs, then with unsaved local edits. */
  const rows = useMemo(() => {
    const generated = buildBackfillRows({
      establishment,
      currentMonth: monthKey,
      existing: contributions,
      wage: Number(wage) || 0,
      epsEligible,
      prorateEdgeMonths: prorate,
    });
    return generated.map((row) => edits.get(row.month) ?? row);
  }, [establishment, monthKey, contributions, wage, epsEligible, prorate, edits]);

  const expectedMonths = useMemo(
    () => contributionMonthsFor(establishment, monthKey),
    [establishment, monthKey]
  );

  const recordedRows = useMemo(
    () => rows.filter((row) => row.persisted || edits.has(row.month) || Number(wage) > 0),
    [rows, edits, wage]
  );

  const totals = useMemo(() => summarizeContributions(recordedRows), [recordedRows]);

  const validation = useMemo(
    () =>
      validateBackfillBatch(recordedRows, {
        establishment,
        currentDateKey: todayKey,
      }),
    [recordedRows, establishment, todayKey]
  );

  const items = useMemo((): ListItem[] => {
    const byYear = new Map<string, EpfBackfillRow[]>();
    for (const row of rows) {
      const fy = financialYearOfMonth(row.month);
      const bucket = byYear.get(fy);
      if (bucket) bucket.push(row);
      else byYear.set(fy, [row]);
    }

    const out: ListItem[] = [];
    for (const fy of [...byYear.keys()].sort((a, b) => compareFinancialYears(b, a))) {
      const yearRows = byYear.get(fy) ?? [];
      const filled = yearRows.filter((row) => row.epfCredit > 0);
      out.push({
        type: "header",
        id: `fy-${fy}`,
        financialYear: fy,
        recorded: filled.length,
        expected: yearRows.length,
        credit: summarizeContributions(filled).epfCredit,
      });
      for (const row of yearRows) {
        out.push({ type: "row", id: row.month, month: row.month });
      }
    }
    return out;
  }, [rows]);

  const rowsByMonth = useMemo(
    () => new Map(rows.map((row) => [row.month, row])),
    [rows]
  );

  const applyEdit = useCallback((row: EpfBackfillRow) => {
    setEdits((prev) => {
      const next = new Map(prev);
      next.set(row.month, row);
      return next;
    });
  }, []);

  const handleSave = async (status: "draft" | "confirmed") => {
    const payload = status === "confirmed" ? validation.valid : recordedRows;
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
    if (result.failed === 0) setEdits(new Map());
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
      <Card>
        <Input
          label="Monthly EPF wage (basic + DA)"
          value={wage}
          onChangeText={setWage}
          keyboardType="numeric"
          placeholder="e.g. 25000"
          helperText="Fills every month below. Edit any month individually afterwards."
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
              Suggests a reduced wage for the joining and leaving months.
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
          const meta = contributionStatusMeta(row.status, row.source);
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
              recorded={row.epfCredit > 0 || row.persisted}
              hasIssue={Boolean(validation.issuesByMonth[row.month])}
              formatAmount={money}
              onPress={setEditingMonth}
            />
          );
        }}
      />

      <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <View style={styles.footerTotals}>
          <Text style={[styles.footerLabel, { color: theme.colors.mutedForeground }]}>
            {totals.count} of {expectedMonths.length} months · pension {money(totals.eps)}
          </Text>
          <Text style={[styles.footerCredit, { color: theme.colors.foreground }]}>
            {money(totals.epfCredit)} into EPF
          </Text>
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
  flex: { flex: 1 },
  container: { gap: 12, padding: 16 },
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
    padding: 16,
    gap: 10,
  },
  footerTotals: { gap: 2 },
  footerLabel: { fontSize: 12 },
  footerCredit: { fontSize: 16, fontWeight: "700" },
  footerButtons: { flexDirection: "row", gap: 10 },
  discard: { fontSize: 12, fontWeight: "600", textAlign: "center" },
});
