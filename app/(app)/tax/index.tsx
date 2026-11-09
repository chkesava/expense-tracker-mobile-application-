import { Redirect, useLocalSearchParams, type Href } from "expo-router";

import { LoadingState } from "@/components/common/LoadingState";
import { PageShell } from "@/components/layout/PageShell";
import { useTaxCenterFlag } from "@/hooks/useTaxCenterEnabled";
import { isFinancialYearKey } from "@/shared/features/tax/utils/taxYear";

/**
 * `/tax` (and `/tax?fy=…`, used by calendar events and older links) opens the
 * Tax & ITR section of the Money hub (SPENDLY-733), keeping the year. With the
 * tax center off, the hub opens on its default section instead.
 */
export default function TaxCenterRoute() {
  const { enabled, loading } = useTaxCenterFlag();
  const params = useLocalSearchParams<{ fy?: string }>();
  // Wait for system_settings before acting on "off", so a deep link isn't
  // redirected by the default (flag off) before the first snapshot.
  if (!enabled && loading) return <PageShell scrollable={false}><LoadingState variant="spinner" /></PageShell>;
  if (!enabled) return <Redirect href={"/ledger" as Href} />;
  const fy = typeof params.fy === "string" && isFinancialYearKey(params.fy) ? params.fy : "";
  return <Redirect href={(fy ? `/ledger?tab=tax&fy=${fy}` : "/ledger?tab=tax") as Href} />;
}
