import { useMemo } from "react";
import { useSalaryRecords } from "./useSalaryRecords";
import { useSalaryProfiles } from "./useSalaryProfiles";
import { useSettings } from "@/providers/SettingsProvider";
import { todayDateKey } from "@/shared/utils/dates";
import { detectSalaryIrregularities, filterActiveSalarySignals } from "@/shared/features/salary/utils/irregularity";
import { buildSalaryForecast } from "@/shared/features/salary/utils/forecast";
import type { SalarySignal } from "@/shared/features/salary/utils/irregularity";

export function useSalaryIntelligenceData(options?: { enabled?: boolean }) {
  const { settings } = useSettings();
  const today = todayDateKey(settings.timezone);

  const { records, loading: recordsLoading, error: recordsError, retry: retryRecords } = useSalaryRecords(options);
  const { profiles, primaryProfile, loading: profilesLoading, error: profilesError, retry: retryProfiles } = useSalaryProfiles(options);

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

  const forecast = useMemo(() => {
    if (records.length === 0 && profiles.length === 0) return null;
    return buildSalaryForecast(records, {
      profile: primaryProfile ?? undefined,
      todayKey: today,
      monthsAhead: 6,
    });
  }, [records, profiles, primaryProfile, today]);

  const loading = recordsLoading || profilesLoading;
  const error = recordsError || profilesError;

  return {
    records,
    profiles,
    primaryProfile,
    activeSignals,
    allSignals,
    forecast,
    loading,
    error,
    retry: () => {
      retryRecords();
      retryProfiles();
    },
  };
}
