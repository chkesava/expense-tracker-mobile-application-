import { useMemo } from "react";
import { useSalaryRecords } from "./useSalaryRecords";
import { useSalaryProfiles } from "./useSalaryProfiles";
import { useSalaryReviews } from "./useSalaryReviews";
import { useIncomes } from "./useIncomes";
import { useSettings } from "@/providers/SettingsProvider";
import { shiftMonthKey, todayDateKey } from "@/shared/utils/dates";
import { roundMoney } from "@/shared/utils/money";
import { detectSalaryCandidates } from "@/shared/features/salary/utils/detectSalary";
import { detectSalaryIrregularities, filterActiveSalarySignals } from "@/shared/features/salary/utils/irregularity";
import { buildSalaryForecast } from "@/shared/features/salary/utils/forecast";
import type { SalaryCandidate, SalarySignal } from "@/shared/features/salary";

export function useSalaryIntelligenceData(options?: { enabled?: boolean }) {
  const { settings } = useSettings();
  const today = todayDateKey(settings.timezone);

  const { records, loading: recordsLoading, error: recordsError, retry: retryRecords } = useSalaryRecords(options);
  const { profiles, primaryProfile, loading: profilesLoading, error: profilesError, retry: retryProfiles } = useSalaryProfiles(options);
  const { reviews, loading: reviewsLoading, error: reviewsError, retry: retryReviews } = useSalaryReviews(options);
  const { incomes, loading: incomesLoading } = useIncomes();

  // 1. Detect salary candidates from ledger incomes
  const { candidates, pendingCandidates } = useMemo(() => {
    if (incomes.length === 0) {
      return { candidates: [] as SalaryCandidate[], pendingCandidates: [] as SalaryCandidate[] };
    }
    const detected = detectSalaryCandidates(incomes, {
      existingRecords: records,
      existingReviews: reviews,
      salaryProfile: primaryProfile ?? undefined,
    });
    const pending = detected.filter((c) => !c.existingStatus || c.existingStatus === "pending");
    return { candidates: detected, pendingCandidates: pending };
  }, [incomes, records, reviews, primaryProfile]);

  // 2. Active irregularity signals
  const { activeSignals, allSignals } = useMemo(() => {
    if (records.length === 0 && profiles.length === 0) {
      return { activeSignals: [] as SalarySignal[], allSignals: [] as SalarySignal[] };
    }
    const detected = detectSalaryIrregularities(records, {
      profile: primaryProfile ?? undefined,
      todayKey: today,
    });
    const active = filterActiveSalarySignals(detected);
    return { activeSignals: active, allSignals: detected };
  }, [records, profiles, primaryProfile, today]);

  // 3. Expected salary forecast
  const forecast = useMemo(() => {
    if (records.length === 0 && profiles.length === 0) return null;
    return buildSalaryForecast(records, {
      profile: primaryProfile ?? undefined,
      todayKey: today,
      monthsAhead: 6,
    });
  }, [records, profiles, primaryProfile, today]);

  // 4. Derived helpers & recent summary
  const latestRegularRecord = useMemo(
    () => records.find((r) => r.type === "regular") || null,
    [records]
  );

  const totalBonusLast12Months = useMemo(() => {
    const oneYearAgo = shiftMonthKey(today.slice(0, 7), -12);
    return roundMoney(
      records
        .filter((r) => (r.type === "bonus" || r.type === "incentive") && (r.payPeriod?.month || r.month) >= oneYearAgo)
        .reduce((sum, r) => sum + r.netAmount, 0)
    );
  }, [records, today]);

  const primaryEmployerName =
    primaryProfile?.primaryEmployer || latestRegularRecord?.employer?.name || "Employer";

  const loading = recordsLoading || profilesLoading || reviewsLoading || incomesLoading;
  const error = recordsError || profilesError || reviewsError;

  return {
    records,
    profiles,
    primaryProfile,
    primaryEmployerName,
    reviews,
    candidates,
    pendingCandidates,
    activeSignals,
    allSignals,
    forecast,
    latestRegularRecord,
    totalBonusLast12Months,
    loading,
    error,
    retry: () => {
      retryRecords();
      retryProfiles();
      retryReviews();
    },
  };
}
