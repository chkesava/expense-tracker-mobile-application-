import { useCallback } from "react";

import { getFirestoreDb } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import * as writes from "@/services/ganesh/ganeshWrites";

function requireDb() {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase is not configured.");
  return db;
}

export function useGaneshWrites() {
  const { actor, pandalId, festivalId } = useGaneshSession();

  const run = useCallback(
    async <T,>(label: string, work: () => Promise<T>): Promise<T> => {
      if (!actor) throw new Error("You must be signed in.");
      const result = await work();
      toast.success(label);
      return result;
    },
    [actor]
  );

  const requireFestival = useCallback(() => {
    if (!actor) throw new Error("You must be signed in.");
    if (!pandalId || !festivalId) throw new Error("Select a Pandal and festival first.");
    return { actor, pandalId, festivalId, db: requireDb() };
  }, [actor, pandalId, festivalId]);

  return {
    actor,
    pandalId,
    festivalId,
    createPandalAndFestival: (input: Parameters<typeof writes.createPandalAndFestival>[2]) =>
      run("Pandal created", () => writes.createPandalAndFestival(requireDb(), actor!, input)),
    requestPandalJoin: (code: string) =>
      run("Join request sent", () => writes.requestPandalJoin(requireDb(), actor!, code)),
    decideJoinRequest: (
      requestId: string,
      decision: "approved" | "rejected",
      role?: Parameters<typeof writes.decideJoinRequest>[4]
    ) =>
      run(decision === "approved" ? "Member approved" : "Request rejected", () =>
        writes.decideJoinRequest(requireDb(), actor!, requestId, decision, role)
      ),
    createFestival: (input: { name: string; year: number }) => {
      if (!pandalId || !actor) throw new Error("Select a Pandal first.");
      return run("Festival created", () =>
        writes.createFestival(requireDb(), actor, pandalId, input)
      );
    },
    updateFestivalTargets: (input: Parameters<typeof writes.updateFestivalTargets>[4]) => {
      const ctx = requireFestival();
      return run("Targets updated", () =>
        writes.updateFestivalTargets(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, input)
      );
    },
    addOpeningFund: (input: Parameters<typeof writes.addOpeningFund>[4]) => {
      const ctx = requireFestival();
      return run("Opening fund saved", () =>
        writes.addOpeningFund(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, input)
      );
    },
    addCollection: (input: Parameters<typeof writes.addCollection>[4]) => {
      const ctx = requireFestival();
      return run("Collection saved", () =>
        writes.addCollection(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, input)
      );
    },
    updateHousehold: (householdId: string, input: Parameters<typeof writes.updateHousehold>[5]) => {
      const ctx = requireFestival();
      return run("Household updated", () =>
        writes.updateHousehold(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, householdId, input)
      );
    },
    addContribution: (input: Parameters<typeof writes.addContribution>[4]) => {
      const ctx = requireFestival();
      return run("Contribution saved", () =>
        writes.addContribution(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, input)
      );
    },
    updateContributionStatus: (
      contributionId: string,
      status: Parameters<typeof writes.updateContributionStatus>[5]
    ) => {
      const ctx = requireFestival();
      return run("Contribution updated", () =>
        writes.updateContributionStatus(
          ctx.db,
          ctx.actor,
          ctx.pandalId,
          ctx.festivalId,
          contributionId,
          status
        )
      );
    },
    addExpense: (input: Parameters<typeof writes.addExpense>[4]) => {
      const ctx = requireFestival();
      return run("Expense saved", () =>
        writes.addExpense(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, input)
      );
    },
    addReimbursement: (input: Parameters<typeof writes.addReimbursement>[4]) => {
      const ctx = requireFestival();
      return run("Reimbursement saved", () =>
        writes.addReimbursement(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, input)
      );
    },
    voidFinancialRecord: (input: Parameters<typeof writes.voidFinancialRecord>[4]) => {
      const ctx = requireFestival();
      return run("Record voided", () =>
        writes.voidFinancialRecord(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, input)
      );
    },
    closeFestival: () => {
      const ctx = requireFestival();
      return run("Festival closed", () =>
        writes.closeFestival(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId)
      );
    },
    recomputeFestivalSummary: () => {
      const ctx = requireFestival();
      return run("Totals recalculated", () =>
        writes.recomputeFestivalSummary(ctx.db, ctx.pandalId, ctx.festivalId)
      );
    },
    addCustomCategory: (name: string) => {
      const ctx = requireFestival();
      return run("Category added", () =>
        writes.addCustomCategory(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, name)
      );
    },
  };
}
