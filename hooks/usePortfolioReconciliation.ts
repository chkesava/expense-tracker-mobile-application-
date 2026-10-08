import { useCallback, useState } from "react";

import { friendlyErrorMessage, logError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { usePortfolio } from "@/hooks/usePortfolio";
import { applyReconciliationRepairs } from "@/services/portfolio/investmentCash";
import {
  buildReconciliationReport,
  planRepairs,
  verifyReconciliation,
  type ReconciliationReport,
} from "@/shared/features/portfolio/utils/portfolioReconciliation";

export type RecalibrationStage = "idle" | "scanning" | "preview" | "repairing" | "done";

/**
 * Drives the SPENDLY-419 Scan → Preview → Repair → Verify flow from the same live
 * data `usePortfolio()` already subscribes to — no extra Firestore reads.
 *
 * Repair only ever writes the `auto_repair` findings (the unambiguous "a cash
 * PURCHASE entry exists but its transaction row doesn't" case). Every other
 * finding stays informational here; a user confronting a `needs_user_input`
 * finding records it the normal way (edit/trade/adjustment), not through this flow.
 */
export function usePortfolioReconciliation() {
  const { user } = useAuth();
  const { holdings, transactions, cashEntries } = usePortfolio({ includeSecondary: true });
  const [stage, setStage] = useState<RecalibrationStage>("idle");
  const [report, setReport] = useState<ReconciliationReport | null>(null);

  const scan = useCallback(() => {
    setStage("scanning");
    const nextReport = buildReconciliationReport(holdings, transactions, cashEntries);
    setReport(nextReport);
    setStage("preview");
    return nextReport;
  }, [holdings, transactions, cashEntries]);

  const repair = useCallback(async () => {
    if (!user || !report) return null;
    const plan = planRepairs(report);
    if (plan.findings.length === 0) {
      setStage("done");
      return null;
    }
    setStage("repairing");
    try {
      const runId = `recon_run_${newId()}`;
      const result = await applyReconciliationRepairs(user.uid, plan, runId, {
        triggeredBy: "self_service",
        source: "app",
      });
      toast.success(`Repaired ${result.repairedCount} of ${plan.findings.length} finding(s)`);
      setStage("done");
      return result;
    } catch (error) {
      logError("portfolio.reconciliationRepair", error);
      toast.error(friendlyErrorMessage(error, "Failed to repair portfolio history"));
      setStage("preview");
      return null;
    }
  }, [user, report]);

  /** Re-scans a single holding's live data and reports whether it's now clean. */
  const verifyHolding = useCallback(
    (holdingId: string) => {
      const holding = holdings.find((item) => item.id === holdingId);
      if (!holding) return { clean: true, remaining: [] };
      const holdingTxs = transactions.filter((tx) => tx.holdingId === holdingId);
      return verifyReconciliation(holding, holdingTxs, cashEntries);
    },
    [holdings, transactions, cashEntries]
  );

  const reset = useCallback(() => {
    setStage("idle");
    setReport(null);
  }, []);

  return { stage, report, scan, repair, verifyHolding, reset };
}
