import { useCallback, useState } from "react";

import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useReadModelModes } from "@/hooks/useReadModelSource";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { deliverTaxSummary, snapshotExport, TAX_ESTIMATE_COLLECTIONS } from "@/services/tax/taxSummaryExport";
import type { FinancialYearKey } from "@/shared/features/tax/types";
import type { TaxRegimeComparison } from "@/shared/features/tax/utils/compareRegimes";
import type { TaxReadiness } from "@/shared/features/tax/utils/readiness";
import { buildTaxSummary } from "@/shared/features/tax/utils/summaryExport";
import type { TaxEstimateInput } from "@/shared/features/tax/utils/taxInput";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { formatAmount } from "@/shared/utils/formatCurrency";

/**
 * SPENDLY-710 — export the year's readiness summary (CSV or PDF) and record
 * it as a snapshot. The file is delivered first; the snapshot follows once
 * Firestore confirms the inputs (taxSummaryExport, R4.3a), so a slow or
 * offline check never holds up the file.
 */
export function useTaxSummaryExport(fy: FinancialYearKey) {
  const { user } = useAuth();
  const uid = user?.uid;
  const { settings } = useSettings();
  const currency = useDisplayCurrency();
  const modes = useReadModelModes(TAX_ESTIMATE_COLLECTIONS);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const exportSummary = useCallback(
    async (format: "csv" | "pdf", data: { input: TaxEstimateInput; comparison: TaxRegimeComparison; readiness: TaxReadiness }) => {
      if (!uid || exporting) return;
      setExporting(format);
      const generatedAtMs = Date.now();
      // Exports carry real figures: ghost mode hides amounts on screen, not in a file the user asked for.
      const formatMoney = (n: number) => formatAmount(n, currency);
      const formatDate = (ms: number) => formatDisplayDate(new Date(ms), settings.dateFormat);
      try {
        const summary = buildTaxSummary({ fy, ...data, generatedAtMs, formatMoney });
        await deliverTaxSummary(summary, format, formatMoney, formatDate);
      } catch (failure) {
        logError("tax.summaryExport", failure, { format });
        toast.error(friendlyErrorMessage(failure, format === "csv" ? "Couldn't export the CSV." : "Couldn't create the PDF."));
        setExporting(null);
        return;
      }
      setExporting(null);
      try {
        const result = await snapshotExport(uid, { fy, input: data.input, comparison: data.comparison, modes, generatedAtMs });
        if (result.kind === "unconfirmed") toast.info("Exported. Spendly couldn't confirm your figures with the server, so this export isn't saved to your history.");
      } catch (failure) {
        logError("tax.summaryExport.snapshot", failure);
      }
    },
    [uid, exporting, fy, currency, settings.dateFormat, modes]
  );

  return { exporting, exportSummary };
}
