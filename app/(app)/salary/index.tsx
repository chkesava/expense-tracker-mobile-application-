import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Banknote, RotateCcw } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import {
  PaycheckTimeline,
  SalaryBreakdownCard,
  SalaryFinancialContextCard,
  SalaryForecastCard,
  SalaryHeaderSummary,
  SalaryIrregularityAlert,
  SalaryReviewModal,
  SalaryTrendCard,
} from "@/components/salary";
import { useSalaryIntelligenceData } from "@/hooks/useSalaryIntelligenceData";
import { useSalaryReviewActions } from "@/hooks/useSalaryReviewActions";
import { useTaxCenterFlag } from "@/hooks/useTaxCenterEnabled";
import { toast } from "@/lib/toast";
import { useSettings } from "@/providers/SettingsProvider";
import type {
  SalaryCandidate,
  SalaryRecord,
  SalaryRejectionReason,
} from "@/shared/features/salary/types";
import type {
  SalaryConfirmOverrides,
  SalaryRecordCorrection,
} from "@/shared/features/salary/utils/review";
import type {
  SalarySignal,
  SalarySignalDismissalReason,
} from "@/shared/features/salary/utils/irregularity";
import { todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";

function candidateFromRecord(record: SalaryRecord): SalaryCandidate {
  return {
    incomeId: record.transactionId || record.id,
    amount: record.netAmount,
    date: record.paymentDate,
    employer: record.employer,
    payPeriod: record.payPeriod,
    confidence: record.confidence || "high",
    evidence: record.evidence || ["user_confirmed"],
    detectionRule: record.provenance?.detectionRule || "user_confirmed",
    suggestedType: record.type,
    rawNarration: record.notes || "",
    accountId: record.accountId ?? undefined,
    existingStatus: "confirmed",
  };
}

export default function SalaryDashboardScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const bottomPadding = usePageListBottomPadding();
  const { settings } = useSettings();
  const today = todayDateKey(settings.timezone);
  const { enabled: taxCenterEnabled } = useTaxCenterFlag();

  const {
    records,
    primaryProfile,
    primaryEmployerName,
    reviews,
    pendingCandidates,
    activeSignals,
    latestRegularRecord,
    totalBonusLast12Months,
    loading,
    error,
    retry,
  } = useSalaryIntelligenceData();

  const { confirm, reject, correct, saving } = useSalaryReviewActions();

  // Selected paycheck for breakdown drilldown
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  // Review modal state
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [activeCandidate, setActiveCandidate] = useState<SalaryCandidate | null>(null);
  const [activeRecord, setActiveRecord] = useState<SalaryRecord | null>(null);

  // Local signal dismissals
  const [dismissedSignalIds, setDismissedSignalIds] = useState<string[]>([]);

  const visibleSignals = useMemo(
    () => activeSignals.filter((s) => !dismissedSignalIds.includes(s.id)),
    [activeSignals, dismissedSignalIds]
  );

  const selectedRecord = useMemo(() => {
    if (selectedRecordId) {
      const match = records.find((r) => r.id === selectedRecordId);
      if (match) return match;
    }
    return latestRegularRecord || records[0] || null;
  }, [selectedRecordId, records, latestRegularRecord]);

  const monthlyBudget = Math.max(0, Number(settings.monthlyBudget) || 0);

  // Handlers
  const handleOpenPendingCandidate = useCallback((candidate: SalaryCandidate) => {
    setActiveCandidate(candidate);
    setActiveRecord(null);
    setIsReviewOpen(true);
  }, []);

  const handleOpenRecordDetail = useCallback((record: SalaryRecord) => {
    setSelectedRecordId(record.id);
    setActiveCandidate(candidateFromRecord(record));
    setActiveRecord(record);
    setIsReviewOpen(true);
  }, []);

  const handleConfirmCandidate = useCallback(
    async (candidate: SalaryCandidate, overrides?: SalaryConfirmOverrides) => {
      const ok = await confirm(candidate, overrides, activeRecord ?? undefined);
      if (ok) {
        setIsReviewOpen(false);
        setActiveCandidate(null);
        setActiveRecord(null);
      }
    },
    [confirm, activeRecord]
  );

  const handleRejectCandidate = useCallback(
    async (candidate: SalaryCandidate, reason: SalaryRejectionReason) => {
      const ok = await reject(candidate, reason, activeRecord ?? undefined);
      if (ok) {
        setIsReviewOpen(false);
        setActiveCandidate(null);
        setActiveRecord(null);
      }
    },
    [reject, activeRecord]
  );

  const handleCorrectRecord = useCallback(
    async (record: SalaryRecord, correction: SalaryRecordCorrection) => {
      const ok = await correct(record, correction);
      if (ok) {
        setIsReviewOpen(false);
        setActiveCandidate(null);
        setActiveRecord(null);
      }
    },
    [correct]
  );

  const handleDismissSignal = useCallback(
    (signal: SalarySignal, _reason: SalarySignalDismissalReason) => {
      setDismissedSignalIds((prev) => [...prev, signal.id]);
      toast.info("Signal dismissed");
    },
    []
  );

  const activeReview = useMemo(() => {
    if (!activeCandidate) return undefined;
    return reviews.find(
      (r) =>
        r.refKey === `income:${activeCandidate.incomeId}` ||
        (activeRecord && r.refKey === `income:${activeRecord.transactionId || activeRecord.id}`)
    );
  }, [activeCandidate, activeRecord, reviews]);

  const header = (
    <PageHeader
      title="Salary Intelligence"
      subtitle="Paycheck Analytics & Cash-flow Visibility"
      icon={<Banknote size={20} color={theme.colors.primary} />}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/insights" as Href))}
      rightElement={
        <RotateCcw
          size={18}
          color={theme.colors.mutedForeground}
          onPress={() => retry()}
          accessibilityRole="button"
          accessibilityLabel="Refresh salary data"
        />
      }
    />
  );

  let body;
  if (error && records.length === 0 && pendingCandidates.length === 0) {
    body = (
      <ErrorState
        title="Couldn't load salary intelligence"
        description={error.message}
        onRetry={retry}
      />
    );
  } else if (loading && records.length === 0 && pendingCandidates.length === 0) {
    body = (
      <View style={{ padding: theme.space.lg, gap: theme.space.md }}>
        <DashboardSkeleton variant="hero" />
        <DashboardSkeleton variant="section" rows={4} />
      </View>
    );
  } else if (records.length === 0 && pendingCandidates.length === 0) {
    body = (
      <EmptyState
        illustration="expenses"
        title="No salary history found"
        description="Spendly automatically detects regular salary credits from your ledger incomes. Record your next paycheck or add an income entry to get started."
        primaryAction={{
          label: "View Ledger Incomes",
          onPress: () => router.push("/ledger?tab=income" as Href),
        }}
      />
    );
  } else {
    body = (
      <ScrollView
        contentContainerStyle={{
          padding: theme.space.lg,
          paddingBottom: bottomPadding,
          gap: theme.space.lg,
        }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={retry} />}
      >
        {/* Irregularity & Alert Banner */}
        {visibleSignals.length > 0 && (
          <SalaryIrregularityAlert
            signals={visibleSignals}
            onDismissSignal={handleDismissSignal}
            onReviewSignal={() => {
              if (pendingCandidates.length > 0) {
                handleOpenPendingCandidate(pendingCandidates[0]);
              }
            }}
          />
        )}

        {/* Hero Summary & Review Prompt */}
        <SalaryHeaderSummary
          latestRecord={latestRegularRecord || records[0] || null}
          primaryEmployer={primaryEmployerName}
          totalBonusPast12Months={totalBonusLast12Months}
          pendingCandidatesCount={pendingCandidates.length}
          onOpenReviews={
            pendingCandidates.length > 0
              ? () => handleOpenPendingCandidate(pendingCandidates[0])
              : undefined
          }
          onAddManualRecord={() => router.push("/ledger?tab=income" as Href)}
        />

        {/* Expected Payday & Multi-Month Forecast */}
        <SalaryForecastCard
          records={records}
          todayKey={today}
          profile={primaryProfile ?? undefined}
          employerName={primaryEmployerName}
          onAddToCalendar={() => router.push("/calendar" as Href)}
        />

        {/* Payslip Component Waterfall & Deductions */}
        {selectedRecord && (
          <SalaryBreakdownCard
            record={selectedRecord}
            onEditPayslip={handleOpenRecordDetail}
          />
        )}

        {/* MoM Growth, Base Trend & Stability */}
        <SalaryTrendCard
          records={records}
          employerName={primaryEmployerName}
          onSelectMonth={(m: string) => {
            const found = records.find(
              (r) => (r.payPeriod?.month || r.month) === m
            );
            if (found) setSelectedRecordId(found.id);
          }}
        />

        {/* Financial Context Linkages */}
        <SalaryFinancialContextCard
          latestRecord={latestRegularRecord || records[0] || null}
          monthlyBudget={monthlyBudget}
          taxCenterEnabled={taxCenterEnabled}
          hasEpfEstablishment={Boolean(
            (latestRegularRecord || records[0])?.employer?.epfEstablishmentId
          )}
          epfEstablishmentId={
            (latestRegularRecord || records[0])?.employer?.epfEstablishmentId
          }
        />

        {/* Chronological Paycheck Timeline */}
        <PaycheckTimeline
          records={records}
          onSelectRecord={handleOpenRecordDetail}
          onSelectMissingPaycheck={() => router.push("/calendar" as Href)}
        />
      </ScrollView>
    );
  }

  return (
    <PageShell scrollable={false} contentContainerStyle={styles.container}>
      {header}
      {body}

      <SalaryReviewModal
        isOpen={isReviewOpen}
        candidate={activeCandidate}
        existingRecord={activeRecord ?? undefined}
        existingReview={activeReview}
        onClose={() => {
          setIsReviewOpen(false);
          setActiveCandidate(null);
          setActiveRecord(null);
        }}
        onConfirm={handleConfirmCandidate}
        onReject={handleRejectCandidate}
        onCorrect={handleCorrectRecord}
        saving={saving}
      />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
