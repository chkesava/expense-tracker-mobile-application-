import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { FileDown } from "lucide-react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import {
  FilterChips,
  GaneshHeader,
  MetaLabel,
  Money,
  Section,
  StatStrip,
  StatTile,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCollectionSessions, useReconciliations } from "@/hooks/useCollectionSessions";
import { useCollections } from "@/hooks/useCollections";
import { useContributions } from "@/hooks/useContributions";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshCategories } from "@/hooks/useGaneshCategories";
import { useGaneshExpenses } from "@/hooks/useGaneshExpenses";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePandals } from "@/hooks/usePandals";
import { useReimbursements } from "@/hooks/useReimbursements";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { exportReportCsv, printReport } from "@/services/ganesh/ganeshReportDelivery";
import { memberDisplayName } from "@/shared/utils/ganeshIdentity";
import { buildGaneshReport } from "@/shared/utils/ganeshReportBuilder";
import {
  REPORT_RANGE_PRESETS,
  resolveReportRange,
  validateRange,
  type ReportRangePreset,
} from "@/shared/utils/ganeshReportRange";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Export the festival's finances as CSV or PDF (GS-079).
 *
 * The preview above the buttons is the point: an export you cannot check before
 * sending is one you find out was wrong after the committee has it. What the
 * screen shows is exactly what the file will contain, built by the same
 * function.
 *
 * Permissions are the ones that govern *viewing* the same data. Export is not a
 * second, weaker route to the ledger, so a section the reader cannot see is
 * withheld from the file and named as withheld rather than exported as zero.
 */
export default function ExportReportScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { realUser } = useAuth();
  const { can } = useGaneshPermissions();

  const { pandals } = usePandals();
  const { festivals } = useFestivals(pandalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { collections } = useCollections(pandalId, festivalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const { expenses } = useGaneshExpenses(pandalId, festivalId);
  const { reimbursements } = useReimbursements(pandalId, festivalId);
  const { sessions } = useCollectionSessions(pandalId, festivalId);
  const { reconciliations } = useReconciliations(pandalId, festivalId);
  const { members } = usePandalMembers(pandalId);
  const { categories } = useGaneshCategories(pandalId, festivalId);

  const [preset, setPreset] = useState<ReportRangePreset>("current_festival");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);

  const pandal = pandals.find((item) => item.id === pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  // Festivals arrive newest-first, so the previous one is the next in the list.
  const previousFestival = useMemo(() => {
    const index = festivals.findIndex((item) => item.id === festivalId);
    return index >= 0 ? festivals[index + 1] : festivals[1];
  }, [festivals, festivalId]);

  const range = useMemo(
    () =>
      resolveReportRange({
        preset,
        today: new Date(),
        customStart,
        customEnd,
        currentFestival: festival,
        previousFestival,
      }),
    [preset, customStart, customEnd, festival, previousFestival]
  );

  const report = useMemo(
    () =>
      buildGaneshReport({
        pandalName: pandal?.name ?? "Pandal",
        festivalName: festival?.name ?? "Festival",
        festivalYear: festival?.year ?? null,
        range,
        generatedAt: new Date(),
        generatedBy: realUser?.displayName || realUser?.phoneNumber || "A committee member",
        openingFunds: summary.openingFunds,
        collections,
        contributions,
        expenses,
        reimbursements,
        sessions,
        reconciliations,
        can: {
          collections: can("collections.read"),
          contributions: can("contributions.read"),
          expenses: can("expenses.read"),
          reimbursements: can("reimbursements.read"),
          reconciliation: can("reconciliation.read"),
        },
        nameFor: (userId) => memberDisplayName(members, userId ?? ""),
        categoryNameFor: (categoryId) =>
          categories.find((item) => item.id === categoryId)?.name ?? "",
      }),
    [
      pandal?.name,
      festival?.name,
      festival?.year,
      range,
      realUser?.displayName,
      realUser?.phoneNumber,
      summary.openingFunds,
      collections,
      contributions,
      expenses,
      reimbursements,
      sessions,
      reconciliations,
      members,
      categories,
      can,
    ]
  );

  // The same permission that lets you open the report screen. There is no
  // separate, weaker export permission by design.
  if (!can("festival.read")) {
    return <GaneshWriteLock message="Your role cannot export reports." />;
  }

  const run = (format: "csv" | "pdf") => {
    const valid = validateRange(range);
    if (!valid.ok) {
      toast.error(valid.error);
      return;
    }
    if (report.transactions.length === 0) {
      toast.error("There is nothing to export in this date range.");
      return;
    }
    setBusy(format);
    const work = format === "csv" ? exportReportCsv(report) : printReport(report);
    Promise.resolve(work)
      .catch((error) => {
        logError(`ganesh.exportReport.${format}`, error);
        toast.error(friendlyErrorMessage(error, "Could not create the report."));
      })
      .finally(() => setBusy(null));
  };

  return (
    <GaneshScreen>
      <GaneshHeader
        title="Export report"
        subtitle={[pandal?.name, festival?.name].filter(Boolean).join(" · ") || undefined}
        icon={<FileDown size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />

      <Section title="Period" subtitle="What the report covers">
        <FilterChips
          layout="wrap"
          value={preset}
          options={REPORT_RANGE_PRESETS.map((item) => ({ id: item.id, label: item.label }))}
          onChange={(next) => setPreset(next as ReportRangePreset)}
        />
        {preset === "custom" ? (
          <>
            <Input
              label="Start date (YYYY-MM-DD)"
              value={customStart}
              onChangeText={setCustomStart}
              placeholder="2026-09-01"
            />
            <Input
              label="End date (YYYY-MM-DD)"
              value={customEnd}
              onChangeText={setCustomEnd}
              placeholder="2026-09-11"
            />
          </>
        ) : null}
        <MetaLabel>Covering: {range.label}</MetaLabel>
      </Section>

      {/* Warnings before the totals, on screen as in the PDF. */}
      {report.warnings.map((warning) => (
        <StatusStrip key={warning} tone="warning" message={warning} />
      ))}

      <Section
        title="What will be exported"
        subtitle={
          report.summary.partialRange
            ? "These totals cover the selected period only, not the whole festival."
            : "Everything in this festival"
        }
      >
        <StatStrip>
          <StatTile label="Collections">
            <Money value={report.summary.collections} size="secondary" />
          </StatTile>
          <StatTile label="Contributions">
            <Money value={report.summary.contributions} size="secondary" />
          </StatTile>
          <StatTile label="Expenses">
            <Money value={report.summary.expenses} size="secondary" />
          </StatTile>
          <StatTile label="Closing balance">
            <Money value={report.summary.closingBalance} size="secondary" />
          </StatTile>
        </StatStrip>
        <MetaLabel>
          {report.transactions.length}{" "}
          {report.transactions.length === 1 ? "transaction" : "transactions"} in this period.
        </MetaLabel>
      </Section>

      <Section
        title="Download"
        subtitle="CSV opens in a spreadsheet. PDF is for reading out and sharing."
      >
        <Button loading={busy === "pdf"} onPress={() => run("pdf")}>
          Create PDF
        </Button>
        <Button variant="outline" loading={busy === "csv"} onPress={() => run("csv")}>
          Export CSV
        </Button>
      </Section>

      <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
        The report only ever contains what your role can already see in the app.
      </Text>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12.5, lineHeight: 18 },
});
