import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Calculator, ChartCandlestick, FolderLock, IndianRupee, PiggyBank, ReceiptIndianRupee, Scale, UserRound } from "lucide-react-native";
import type { ReactNode } from "react";

import { ActionMenuSheet } from "@/components/common/ActionMenuSheet";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ProgressIndicator } from "@/components/dashboard/ProgressIndicator";
import { ReadinessChecklist } from "@/components/tax/ReadinessChecklist";
import { ReadinessSectionRow } from "@/components/tax/ReadinessSectionRow";
import { TaxNotice } from "@/components/tax/TaxNotice";
import { AGE_BAND_LABELS, RESIDENTIAL_STATUS_LABELS, TaxProfileSheet } from "@/components/tax/TaxProfileSheet";
import { TaxYearChips } from "@/components/tax/TaxYearChips";
import { Button } from "@/components/ui/Button";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useTaxReadiness } from "@/hooks/useTaxReadiness";
import { useTaxRecordActions } from "@/hooks/useTaxRecordActions";
import { useTaxSummaryExport } from "@/hooks/useTaxSummaryExport";
import { useNetwork } from "@/providers/NetworkProvider";
import { useSettings } from "@/providers/SettingsProvider";
import type { FinancialYearKey } from "@/shared/features/tax/types";
import { TAX_LIMITATIONS } from "@/shared/features/tax/utils/estimatePresentation";
import type { ReadinessSection } from "@/shared/features/tax/utils/readiness";
import { defaultTaxYear, selectableTaxYears, taxYearLabel } from "@/shared/features/tax/utils/taxYear";
import { todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";

const SECTION_TITLES: Record<ReadinessSection, string> = {
  profile: "Your details",
  income: "Income",
  tds: "TDS & Form 16",
  deductions: "Deductions",
  "capital-gains": "Capital gains",
  payments: "Tax payments",
  estimate: "Tax estimate",
};

/**
 * Tax & ITR Readiness Center (epic SPENDLY-288, dashboard SPENDLY-296), shown
 * as the Money hub's "Tax & ITR" section (SPENDLY-733): pick a financial year,
 * see how ready it is to review, and work through the checklist. Each section
 * shows its headline figure, marked as a recorded fact or a calculation, and
 * opens the screen that breaks it down.
 *
 * The caller shows it only while the tax center is enabled. It reads the
 * year's tax data only while mounted (SPENDLY-406), through each section's
 * hooks and read switches. The top label is "Ready to review" at most: the
 * user files, Spendly doesn't.
 */
export function TaxCenterHub({
  initialFy,
  onYearChange,
}: {
  /** A year from a link (`?fy=`); ignored when it isn't selectable. */
  initialFy?: string;
  /** Keeps the URL in step, so a shared or restored link reopens the same year. */
  onYearChange?: (fy: FinancialYearKey) => void;
}) {
  const { theme } = useTheme();
  const router = useRouter();
  const { settings } = useSettings();
  const todayKey = todayDateKey(settings?.timezone);
  const years = useMemo(() => selectableTaxYears(todayKey), [todayKey]);
  const [fy, setFyState] = useState(() => (initialFy && years.includes(initialFy) ? initialFy : defaultTaxYear(todayKey)));
  const setFy = (next: FinancialYearKey) => {
    setFyState(next);
    onYearChange?.(next);
  };
  const currency = useDisplayCurrency();
  const { isOnline } = useNetwork();
  const { readiness, input, comparison, profile, loading, error, retry } = useTaxReadiness(fy);
  const { exporting, exportSummary } = useTaxSummaryExport(fy);
  const [exportOpen, setExportOpen] = useState(false);
  const actions = useTaxRecordActions(fy, todayKey);
  const [profileOpen, setProfileOpen] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);

  const go = (section: ReadinessSection) => {
    if (section === "profile") setProfileOpen(true);
    else router.push(`/tax/${fy}/${section}` as Href);
  };
  const sectionOf = (s: ReadinessSection) => readiness.sections.find((x) => x.section === s);
  const color = theme.colors.primary;
  const rows: { section: ReadinessSection; subtitle: string; icon: ReactNode }[] = [
    {
      section: "profile",
      subtitle: profile
        ? `${RESIDENTIAL_STATUS_LABELS[profile.residentialStatus]} · ${AGE_BAND_LABELS[profile.ageBand]}`
        : "Residential status and age band, for the right slabs",
      icon: <UserRound size={20} color={color} />,
    },
    { section: "income", subtitle: "Salary, interest, dividends, rent and income you add", icon: <IndianRupee size={20} color={color} /> },
    { section: "tds", subtitle: "Form 16, TDS certificates and your AIS or 26AS, compared", icon: <Scale size={20} color={color} /> },
    { section: "deductions", subtitle: "Tax-saving investments, insurance, loans, rent and donations", icon: <PiggyBank size={20} color={color} /> },
    { section: "capital-gains", subtitle: "Sales of shares, funds, gold and property", icon: <ChartCandlestick size={20} color={color} /> },
    { section: "payments", subtitle: "Advance tax and self-assessment tax, from your challans", icon: <ReceiptIndianRupee size={20} color={color} /> },
    { section: "estimate", subtitle: "Old and new regime side by side. Informational only", icon: <Calculator size={20} color={color} /> },
  ];

  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const heading = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md };
  const { ready, total } = readiness.progress;
  const top =
    readiness.label === "ready_to_review"
      ? { title: "Ready to review", detail: "Nothing required is open. Check each figure against your documents before you file.", status: "good" as const }
      : readiness.label === "not_started"
        ? { title: "Not started", detail: "Set your details and add your Form 16 or income to begin.", status: "neutral" as const }
        : { title: `${ready} of ${total} sections ready`, detail: "Finish the items below. Spendly never files for you.", status: "watch" as const };

  let body: ReactNode;
  if (error) {
    body = <ErrorState title="Couldn't load your tax records" description={error.message} onRetry={error.retryable ? retry : undefined} />;
  } else if (loading) {
    body = <LoadingState variant="list" count={5} label="Checking your year…" />;
  } else {
    body = (
      <>
        <View style={{ gap: theme.space.xs }} accessibilityLiveRegion="polite">
          <Text accessibilityRole="header" style={{ ...heading, fontSize: theme.typography.lg }}>
            {top.title}
          </Text>
          <ProgressIndicator
            pct={(ready / total) * 100}
            status={top.status}
            accessibilityLabel={`${ready} of ${total} sections have nothing required open`}
          />
          <Text style={muted}>{top.detail}</Text>
        </View>
        <Button
          variant="tonal"
          size="sm"
          onPress={() => setExportOpen(true)}
          loading={exporting !== null}
          disabled={exporting !== null}
          accessibilityLabel={`Export a summary of ${taxYearLabel(fy)}`}
        >
          Export summary (PDF or CSV)
        </Button>

        {rows.map((r) => (
          <ReadinessSectionRow
            key={r.section}
            title={SECTION_TITLES[r.section]}
            subtitle={r.subtitle}
            icon={r.icon}
            readiness={sectionOf(r.section)}
            currency={currency}
            onPress={() => go(r.section)}
          />
        ))}
        <ReadinessSectionRow
          title="Documents"
          subtitle="Form 16, AIS, 26AS, proofs and receipts, kept privately"
          icon={<FolderLock size={20} color={color} />}
          currency={currency}
          onPress={() => router.push(`/tax/${fy}/documents` as Href)}
        />

        <View style={{ gap: theme.space.sm }}>
          <Text accessibilityRole="header" style={heading}>
            Your checklist
          </Text>
          <ReadinessChecklist
            items={readiness.items}
            sectionTitles={SECTION_TITLES}
            saving={actions.saving}
            onOpen={go}
            onDecide={(item, decision) => void actions.checklistDecision(item.id, decision)}
            onUndo={(item) => void actions.undoChecklist(item.id)}
          />
        </View>

        {/* SPENDLY-299: known limitations, visible in the app. */}
        <View style={{ gap: theme.space.xs }}>
          <Pressable
            onPress={() => setLimitsOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: limitsOpen }}
            style={{ minHeight: 48, justifyContent: "center" }}
          >
            <Text style={{ color: theme.colors.primary, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>
              {limitsOpen ? "Hide" : "What Spendly doesn't cover"}
            </Text>
          </Pressable>
          {limitsOpen
            ? TAX_LIMITATIONS.map((line) => (
                <Text key={line} style={muted}>
                  • {line}
                </Text>
              ))
            : null}
        </View>
      </>
    );
  }

  return (
    <View style={{ gap: theme.space.lg }}>
      <TaxYearChips years={years} value={fy} onChange={setFy} inset={false} />
      {!isOnline ? <TaxNotice tone="offline">You're offline. Showing what's saved on this device; changes sync later.</TaxNotice> : null}
      <TaxNotice>
        Spendly helps you get your records ready. It doesn't file your return or give tax advice. Check every figure against your
        Form 16, AIS and certificates before you file.
      </TaxNotice>
      {body}
      <ActionMenuSheet
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title={`Summary of ${taxYearLabel(fy)}`}
        actions={[
          { label: "PDF, to read or share", onPress: () => void exportSummary("pdf", { input, comparison, readiness }) },
          { label: "CSV, for a spreadsheet", onPress: () => void exportSummary("csv", { input, comparison, readiness }) },
        ]}
      />
      <TaxProfileSheet
        open={profileOpen}
        fy={fy}
        profile={profile}
        saving={actions.saving}
        onSave={(values) => actions.saveProfile(profile, values)}
        onClose={() => setProfileOpen(false)}
      />
    </View>
  );
}
