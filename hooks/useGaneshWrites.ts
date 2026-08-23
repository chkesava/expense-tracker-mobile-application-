import { useCallback } from "react";

import { getFirestoreDb } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import {
  addPermanentFundDonation,
  adjustPermanentFund,
  assertPermanentFundOnline,
  seedPermanentFund,
  transferFestivalToPermanent,
  transferPermanentToFestival,
} from "@/services/ganesh/ganeshPermanentFund";
import * as writes from "@/services/ganesh/ganeshWrites";
import type { PermanentFundLocation } from "@/shared/types/ganesh";

function requireDb() {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase is not configured.");
  return db;
}

export function useGaneshWrites() {
  const { actor, pandalId, festivalId } = useGaneshSession();
  const { isOnline } = useNetwork();

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
    createPandalAndFestival: (input: Parameters<typeof writes.createPandalAndFestival>[2]) => {
      if (Number(input.initialFund?.amount ?? 0) > 0 || Number(input.allocateToFestival?.amount ?? 0) > 0) {
        assertPermanentFundOnline(isOnline);
      }
      return run("Pandal created", () => writes.createPandalAndFestival(requireDb(), actor!, input));
    },
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
    closeFestival: (settlement?: Parameters<typeof writes.closeFestival>[4]) => {
      const ctx = requireFestival();
      if (settlement && settlement.transferAmount > 0) {
        assertPermanentFundOnline(isOnline);
      }
      return run(
        settlement && settlement.transferAmount > 0
          ? "Festival settled and closed"
          : "Festival closed",
        () => writes.closeFestival(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, settlement)
      );
    },
    seedPermanentFund: (input?: {
      amount?: number;
      location?: PermanentFundLocation;
      description?: string;
    }) => {
      if (!actor || !pandalId) throw new Error("Select a Pandal first.");
      if (Number(input?.amount ?? 0) > 0) assertPermanentFundOnline(isOnline);
      return run("Permanent Fund saved", () =>
        seedPermanentFund(requireDb(), actor, pandalId, input)
      );
    },
    addPermanentFundDonation: (input: {
      amount: number;
      location: PermanentFundLocation;
      description?: string;
    }) => {
      if (!actor || !pandalId) throw new Error("Select a Pandal first.");
      assertPermanentFundOnline(isOnline);
      return run("Permanent Fund donation saved", () =>
        addPermanentFundDonation(requireDb(), actor, pandalId, input)
      );
    },
    adjustPermanentFund: (input: {
      amount: number;
      location: PermanentFundLocation;
      reason: string;
    }) => {
      if (!actor || !pandalId) throw new Error("Select a Pandal first.");
      assertPermanentFundOnline(isOnline);
      return run("Permanent Fund adjusted", () =>
        adjustPermanentFund(requireDb(), actor, pandalId, input)
      );
    },
    transferPermanentToFestival: (input: {
      festivalId?: string;
      amount: number;
      location: PermanentFundLocation;
      festivalName?: string;
      description?: string;
    }) => {
      if (!actor || !pandalId) throw new Error("Select a Pandal first.");
      const targetFestivalId = input.festivalId ?? festivalId;
      if (!targetFestivalId) throw new Error("Select a festival first.");
      assertPermanentFundOnline(isOnline);
      return run("Transferred to festival", () =>
        transferPermanentToFestival(requireDb(), actor, pandalId, targetFestivalId, input)
      );
    },
    transferFestivalToPermanent: (input: {
      amount: number;
      location: PermanentFundLocation;
      festivalName?: string;
      description?: string;
      type?: "CARRY_FORWARD" | "TRANSFER_IN";
    }) => {
      const ctx = requireFestival();
      assertPermanentFundOnline(isOnline);
      return run("Transferred to Permanent Fund", () =>
        transferFestivalToPermanent(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, {
          ...input,
          type: input.type ?? "TRANSFER_IN",
        })
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
