import { useCallback } from "react";

import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
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
import * as assetWrites from "@/services/ganesh/ganeshAssets";
import * as sevaWrites from "@/services/ganesh/ganeshSeva";
import * as sponsorWrites from "@/services/ganesh/ganeshSponsors";
import * as writes from "@/services/ganesh/ganeshWrites";
import {
  assertGodFundSpendOnline,
  assertReimbursementOnline,
  assertVoidOnline,
} from "@/services/ganesh/ganeshWrites";
import { assertMoneyReceiveOnline } from "@/shared/utils/ganeshContributions";
import type {
  DutyStatus,
  GaneshFileMeta,
  GaneshMemberStatus,
  GaneshRole,
  PermanentFundLocation,
  SevaStatus,
} from "@/shared/types/ganesh";
import * as roleWrites from "@/services/ganesh/ganeshRoles";
import { assertHasPermission, type GaneshPermission } from "@/shared/utils/ganeshPermissions";

function requireDb() {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase is not configured.");
  return db;
}

export function useGaneshWrites() {
  const { actor, pandalId, festivalId } = useGaneshSession();
  const { isOnline } = useNetwork();
  const { can: hasPerm, isAdmin, permissions } = useGaneshPermissions();

  const run = useCallback(
    async <T,>(label: string, work: () => Promise<T>): Promise<T> => {
      if (!actor) throw new Error("You must be signed in.");
      const result = await work();
      toast.success(label);
      return result;
    },
    [actor]
  );

  const requirePerm = useCallback(
    (permission: GaneshPermission) => {
      if (hasPerm(permission)) return;
      assertHasPermission(permissions, permission, isAdmin);
    },
    [hasPerm, isAdmin, permissions]
  );

  const requireFestival = useCallback((overrideFestivalId?: string) => {
    if (!actor) throw new Error("You must be signed in.");
    const targetFestivalId = overrideFestivalId ?? festivalId;
    if (!pandalId || !targetFestivalId) throw new Error("Select a Pandal and festival first.");
    return { actor, pandalId, festivalId: targetFestivalId, db: requireDb() };
  }, [actor, pandalId, festivalId]);

  const requirePandal = useCallback(() => {
    if (!actor) throw new Error("You must be signed in.");
    if (!pandalId) throw new Error("Select a Pandal first.");
    return { actor, pandalId, db: requireDb() };
  }, [actor, pandalId]);

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
    requestPandalJoin: async (code: string) => {
      if (!actor) throw new Error("You must be signed in.");
      const result = await writes.requestPandalJoin(requireDb(), actor, code);
      toast.success(
        result.joined
          ? "You're now a member."
          : "Request sent to the admin. Waiting for approval."
      );
      return result;
    },
    decideJoinRequest: (
      requestId: string,
      decision: "approved" | "rejected",
      roleForJoin?: Parameters<typeof writes.decideJoinRequest>[4]
    ) => {
      requirePerm("members.approve");
      return run(decision === "approved" ? "Member approved" : "Request rejected", () =>
        writes.decideJoinRequest(requireDb(), actor!, requestId, decision, roleForJoin)
      );
    },
    updatePandalProfile: (input: Parameters<typeof writes.updatePandalProfile>[3]) => {
      if (!pandalId || !actor) throw new Error("Select a Pandal first.");
      requirePerm("settings.update");
      return run("Pandal saved", () =>
        writes.updatePandalProfile(requireDb(), actor, pandalId, input)
      );
    },
    updateFestivalDetails: (
      targetFestivalId: string,
      input: Parameters<typeof writes.updateFestivalDetails>[4]
    ) => {
      if (!pandalId || !actor) throw new Error("Select a Pandal first.");
      requirePerm("festival.update");
      return run("Festival saved", () =>
        writes.updateFestivalDetails(requireDb(), actor, pandalId, targetFestivalId, input)
      );
    },
    updatePandalJoinMode: (joinMode: Parameters<typeof writes.updatePandalJoinMode>[3]) => {
      if (!pandalId || !actor) throw new Error("Select a Pandal first.");
      requirePerm("settings.update");
      return run(joinMode === "open" ? "Open join enabled" : "Approval required to join", () =>
        writes.updatePandalJoinMode(requireDb(), actor, pandalId, joinMode)
      );
    },
    updatePandalMember: (
      targetUserId: string,
      input: { role?: GaneshRole; status?: GaneshMemberStatus; reason?: string }
    ) => {
      if (!pandalId || !actor) throw new Error("Select a Pandal first.");
      if (input.status === "removed") requirePerm("members.remove");
      else if (input.status === "suspended") requirePerm("members.suspend");
      else requirePerm("members.assignRole");
      return run("Member updated", () =>
        writes.updatePandalMember(requireDb(), actor, pandalId, targetUserId, input)
      );
    },
    createFestival: (input: { name: string; year: number }) => {
      if (!pandalId || !actor) throw new Error("Select a Pandal first.");
      requirePerm("festival.create");
      return run("Festival created", () =>
        writes.createFestival(requireDb(), actor, pandalId, input)
      );
    },
    updateFestivalTargets: (input: Parameters<typeof writes.updateFestivalTargets>[4]) => {
      requirePerm("festival.update");
      const ctx = requireFestival();
      return run("Targets updated", () =>
        writes.updateFestivalTargets(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, input)
      );
    },
    setMemberContributionTarget: (
      memberId: string,
      input: Parameters<typeof writes.setMemberContributionTarget>[5]
    ) => {
      requirePerm("festival.update");
      const ctx = requireFestival();
      return run(
        input.resetToDefault ? "Using committee default target" : "Person target saved",
        () =>
          writes.setMemberContributionTarget(
            ctx.db,
            ctx.actor,
            ctx.pandalId,
            ctx.festivalId,
            memberId,
            input
          )
      );
    },
    addOpeningFund: (input: Parameters<typeof writes.addOpeningFund>[4]) => {
      requirePerm("openingFunds.create");
      const ctx = requireFestival();
      return run("Opening fund saved", () =>
        writes.addOpeningFund(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, input)
      );
    },
    addCollection: (input: Parameters<typeof writes.addCollection>[4]) => {
      requirePerm("collections.create");
      const ctx = requireFestival();
      return run("Collection saved", () =>
        writes.addCollection(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, input)
      );
    },
    updateHousehold: (householdId: string, input: Parameters<typeof writes.updateHousehold>[5]) => {
      requirePerm("collections.update");
      const ctx = requireFestival();
      return run("Household updated", () =>
        writes.updateHousehold(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, householdId, input)
      );
    },
    addContribution: (input: Parameters<typeof writes.addContribution>[4]) => {
      requirePerm("contributions.create");
      if (input.pandalAsset) requirePerm("assets.create");
      // Recording a contribution as already received IS receiving it. The rules
      // enforce this on create as well as on the promised -> received
      // transition (GS-037); check here so the user gets the permission message
      // rather than a bare permission-denied from Firestore.
      const status = input.status ?? (input.kind === "money" ? "received" : "promised");
      if (status === "received") {
        requirePerm("contributions.receive");
        writes.assertMoneyReceiveOnline(isOnline, input.kind);
      }
      const ctx = requireFestival();
      return run("Contribution saved", () =>
        writes.addContribution(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, input)
      );
    },
    attachContributionPhoto: (contributionId: string, photo: GaneshFileMeta) => {
      requirePerm("contributions.update");
      const ctx = requireFestival();
      return writes.attachContributionPhoto(
        ctx.db,
        ctx.actor,
        ctx.pandalId,
        ctx.festivalId,
        contributionId,
        photo
      );
    },
    receiveContribution: (
      contributionId: string,
      input?: Parameters<typeof writes.receiveContribution>[5] & { kind?: string }
    ) => {
      requirePerm("contributions.receive");
      const ctx = requireFestival();
      writes.assertMoneyReceiveOnline(isOnline, input?.kind ?? "item");
      const { kind: _kind, ...payload } = input ?? {};
      return run("Marked received", () =>
        writes.receiveContribution(
          ctx.db,
          ctx.actor,
          ctx.pandalId,
          ctx.festivalId,
          contributionId,
          payload
        )
      );
    },
    cancelContribution: (contributionId: string, reason?: string) => {
      requirePerm("contributions.cancel");
      const ctx = requireFestival();
      return run("Contribution cancelled", () =>
        writes.cancelContribution(
          ctx.db,
          ctx.actor,
          ctx.pandalId,
          ctx.festivalId,
          contributionId,
          reason
        )
      );
    },
    updatePromisedContribution: (
      contributionId: string,
      input: Parameters<typeof writes.updatePromisedContribution>[5]
    ) => {
      requirePerm("contributions.update");
      const ctx = requireFestival();
      return run("Contribution saved", () =>
        writes.updatePromisedContribution(
          ctx.db,
          ctx.actor,
          ctx.pandalId,
          ctx.festivalId,
          contributionId,
          input
        )
      );
    },
    addExpense: (input: Parameters<typeof writes.addExpense>[4]) => {
      requirePerm("expenses.create");
      if ((input.sponsoredAmount ?? 0) > 0) requirePerm("sponsors.receive");
      assertGodFundSpendOnline(isOnline, input.godFundAmount);
      const ctx = requireFestival();
      return run("Expense saved", () =>
        writes.addExpense(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, input)
      );
    },
    addAssetPurchase: (input: Parameters<typeof writes.addAssetPurchase>[4]) => {
      requirePerm("expenses.create");
      requirePerm("assets.create");
      if ((input.sponsoredAmount ?? 0) > 0) requirePerm("sponsors.receive");
      assertGodFundSpendOnline(isOnline, input.godFundAmount);
      const ctx = requireFestival();
      return run("Asset purchase saved", () =>
        writes.addAssetPurchase(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, input)
      );
    },
    updateExpenseAmounts: (
      expenseId: string,
      input: Parameters<typeof writes.updateExpenseAmounts>[5],
      options?: { festivalId?: string }
    ) => {
      requirePerm("expenses.update");
      // The service only opens a transaction when the God Fund share grows, but
      // it cannot see the old amount from here, so gate on any God Fund share.
      assertGodFundSpendOnline(isOnline, input.godFundAmount);
      const ctx = requireFestival(options?.festivalId);
      return run("Expense updated", () =>
        writes.updateExpenseAmounts(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, expenseId, input)
      );
    },
    attachExpenseReceipt: (expenseId: string, receipt: GaneshFileMeta) => {
      requirePerm("expenses.update");
      const ctx = requireFestival();
      return writes.attachExpenseReceipt(
        ctx.db,
        ctx.actor,
        ctx.pandalId,
        ctx.festivalId,
        expenseId,
        receipt
      );
    },
    addReimbursement: (input: Parameters<typeof writes.addReimbursement>[4]) => {
      requirePerm("reimbursements.create");
      assertReimbursementOnline(isOnline);
      const ctx = requireFestival();
      return run("Reimbursement saved", () =>
        writes.addReimbursement(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, input)
      );
    },
    voidFinancialRecord: (
      input: Parameters<typeof writes.voidFinancialRecord>[4],
      options?: { festivalId?: string }
    ) => {
      requirePerm("expenses.void");
      assertVoidOnline(isOnline);
      const ctx = requireFestival(options?.festivalId);
      return run("Record voided", () =>
        writes.voidFinancialRecord(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, input)
      );
    },
    closeFestival: (settlement?: Parameters<typeof writes.closeFestival>[4]) => {
      requirePerm("festival.close");
      const ctx = requireFestival();
      if (settlement && settlement.transferAmount > 0) {
        requirePerm("permanentFund.transfer");
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
      requirePerm("permanentFund.add");
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
      requirePerm("permanentFund.add");
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
      requirePerm("permanentFund.transfer");
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
      requirePerm("permanentFund.transfer");
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
      requirePerm("permanentFund.transfer");
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
      requirePerm("festival.update");
      const ctx = requireFestival();
      return run("Totals recalculated", () =>
        writes.recomputeFestivalSummary(ctx.db, ctx.pandalId, ctx.festivalId)
      );
    },
    addCustomCategory: (name: string) => {
      requirePerm("festival.update");
      const ctx = requireFestival();
      return run("Category added", () =>
        writes.addCustomCategory(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, name)
      );
    },
    updateCategory: (
      categoryId: string,
      input: Parameters<typeof writes.updateCategory>[5]
    ) => {
      requirePerm("festival.update");
      const ctx = requireFestival();
      return run("Category updated", () =>
        writes.updateCategory(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, categoryId, input)
      );
    },
    ensurePandalRoles: async () => {
      if (!pandalId || !actor) throw new Error("Select a Pandal first.");
      requirePerm("roles.read");
      return roleWrites.ensurePandalRoles(requireDb(), actor, pandalId);
    },
    createPandalRole: (input: Parameters<typeof roleWrites.createPandalRole>[3]) => {
      if (!pandalId || !actor) throw new Error("Select a Pandal first.");
      requirePerm("roles.create");
      return run("Role created", () => roleWrites.createPandalRole(requireDb(), actor, pandalId, input));
    },
    updatePandalRole: (
      roleId: string,
      input: Parameters<typeof roleWrites.updatePandalRole>[4]
    ) => {
      if (!pandalId || !actor) throw new Error("Select a Pandal first.");
      requirePerm("roles.update");
      return run("Role saved", () =>
        roleWrites.updatePandalRole(requireDb(), actor, pandalId, roleId, input)
      );
    },
    deletePandalRole: (roleId: string) => {
      if (!pandalId || !actor) throw new Error("Select a Pandal first.");
      requirePerm("roles.delete");
      return run("Role deleted", () => roleWrites.deletePandalRole(requireDb(), actor, pandalId, roleId));
    },
    setMemberRoleIds: (targetUserId: string, roleIds: string[]) => {
      if (!pandalId || !actor) throw new Error("Select a Pandal first.");
      requirePerm("roles.assign");
      return run("Roles saved", () =>
        roleWrites.setMemberRoleIds(requireDb(), actor, pandalId, targetUserId, roleIds)
      );
    },
    setPandalAdmin: (targetUserId: string, makeAdmin: boolean) => {
      if (!pandalId || !actor) throw new Error("Select a Pandal first.");
      if (!isAdmin) throw new Error("Only a Pandal Admin can change Admin access.");
      return run(makeAdmin ? "Made Pandal Admin" : "Removed Admin access", () =>
        roleWrites.setPandalAdmin(requireDb(), actor, pandalId, targetUserId, makeAdmin)
      );
    },
    createPandalAsset: (input: Parameters<typeof assetWrites.createPandalAsset>[3]) => {
      requirePerm("assets.create");
      const ctx = requirePandal();
      return run("Asset added", () =>
        assetWrites.createPandalAsset(ctx.db, ctx.actor, ctx.pandalId, input)
      );
    },
    updatePandalAsset: (
      assetId: string,
      patch: Parameters<typeof assetWrites.updatePandalAsset>[4]
    ) => {
      requirePerm("assets.update");
      const ctx = requirePandal();
      return run("Asset updated", () =>
        assetWrites.updatePandalAsset(ctx.db, ctx.actor, ctx.pandalId, assetId, patch)
      );
    },
    adjustAssetQuantity: (
      assetId: string,
      input: Parameters<typeof assetWrites.adjustAssetQuantity>[4]
    ) => {
      requirePerm("assets.update");
      const ctx = requirePandal();
      return run("Quantity updated", () =>
        assetWrites.adjustAssetQuantity(ctx.db, ctx.actor, ctx.pandalId, assetId, input)
      );
    },
    setAssetStatus: (
      assetId: string,
      input: Parameters<typeof assetWrites.setAssetStatus>[4]
    ) => {
      if (input.status === "disposed" || input.status === "lost") {
        requirePerm("assets.dispose");
      } else {
        requirePerm("assets.update");
      }
      const ctx = requirePandal();
      return run(
        input.status === "disposed"
          ? "Asset disposed"
          : input.status === "lost"
            ? "Asset marked lost"
            : "Status updated",
        () => assetWrites.setAssetStatus(ctx.db, ctx.actor, ctx.pandalId, assetId, input)
      );
    },
    attachAssetPhoto: (
      assetId: string,
      photo: Parameters<typeof assetWrites.attachAssetPhoto>[4]
    ) => {
      if (!hasPerm("assets.create") && !hasPerm("assets.update")) {
        requirePerm("assets.update");
      }
      const ctx = requirePandal();
      return assetWrites.attachAssetPhoto(ctx.db, ctx.actor, ctx.pandalId, assetId, photo);
    },
    createSponsor: (input: Parameters<typeof sponsorWrites.createSponsor>[3]) => {
      requirePerm("sponsors.create");
      const ctx = requirePandal();
      return run("Sponsor added", () =>
        sponsorWrites.createSponsor(ctx.db, ctx.actor, ctx.pandalId, input)
      );
    },
    updateSponsor: (
      sponsorId: string,
      input: Parameters<typeof sponsorWrites.updateSponsor>[4]
    ) => {
      requirePerm("sponsors.update");
      const ctx = requirePandal();
      return run("Sponsor saved", () =>
        sponsorWrites.updateSponsor(ctx.db, ctx.actor, ctx.pandalId, sponsorId, input)
      );
    },
    attachSponsorPhoto: (
      sponsorId: string,
      photo: Parameters<typeof sponsorWrites.attachSponsorPhoto>[4]
    ) => {
      if (!hasPerm("sponsors.create") && !hasPerm("sponsors.update")) {
        requirePerm("sponsors.update");
      }
      const ctx = requirePandal();
      return sponsorWrites.attachSponsorPhoto(ctx.db, ctx.actor, ctx.pandalId, sponsorId, photo);
    },
    addSponsorship: (
      sponsorId: string,
      input: Parameters<typeof sponsorWrites.addSponsorship>[5]
    ) => {
      requirePerm("sponsors.create");
      if (input.status === "received") requirePerm("sponsors.receive");
      if (input.pandalAsset) requirePerm("assets.create");
      if (input.status === "received" && input.sponsoringType === "cash") {
        assertMoneyReceiveOnline(isOnline, "money");
      }
      const ctx = requireFestival();
      return run("Sponsorship saved", () =>
        sponsorWrites.addSponsorship(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, sponsorId, input)
      );
    },
    updateOpenSponsorship: (
      sponsorshipId: string,
      input: Parameters<typeof sponsorWrites.updateOpenSponsorship>[5]
    ) => {
      requirePerm("sponsors.update");
      const ctx = requireFestival();
      return run("Sponsorship saved", () =>
        sponsorWrites.updateOpenSponsorship(
          ctx.db,
          ctx.actor,
          ctx.pandalId,
          ctx.festivalId,
          sponsorshipId,
          input
        )
      );
    },
    promiseSponsorship: (sponsorshipId: string) => {
      requirePerm("sponsors.update");
      const ctx = requireFestival();
      return run("Marked promised", () =>
        sponsorWrites.promiseSponsorship(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, sponsorshipId)
      );
    },
    confirmSponsorship: (sponsorshipId: string) => {
      requirePerm("sponsors.update");
      const ctx = requireFestival();
      return run("Sponsorship confirmed", () =>
        sponsorWrites.confirmSponsorship(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, sponsorshipId)
      );
    },
    receiveSponsorship: (
      sponsorshipId: string,
      input?: Parameters<typeof sponsorWrites.receiveSponsorship>[5] & { sponsoringType?: string }
    ) => {
      requirePerm("sponsors.receive");
      const ctx = requireFestival();
      if (input?.sponsoringType === "cash") {
        assertMoneyReceiveOnline(isOnline, "money");
      }
      const { sponsoringType: _type, ...payload } = input ?? {};
      return run("Marked received", () =>
        sponsorWrites.receiveSponsorship(
          ctx.db,
          ctx.actor,
          ctx.pandalId,
          ctx.festivalId,
          sponsorshipId,
          payload
        )
      );
    },
    cancelSponsorship: (sponsorshipId: string, reason?: string) => {
      requirePerm("sponsors.cancel");
      const ctx = requireFestival();
      return run("Sponsorship cancelled", () =>
        sponsorWrites.cancelSponsorship(
          ctx.db,
          ctx.actor,
          ctx.pandalId,
          ctx.festivalId,
          sponsorshipId,
          reason
        )
      );
    },
    /* ------------------------------------------------------------- Seva */
    // Seva writes take no online gate: none of them reads a balance, so they
    // stay plain batches and keep working with no signal at the pandal, which
    // is exactly when a schedule gets changed.
    createSeva: (input: Parameters<typeof sevaWrites.createSeva>[4]) => {
      requirePerm("seva.write");
      const ctx = requireFestival();
      return run("Seva added", () =>
        sevaWrites.createSeva(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, input)
      );
    },
    updateSeva: (sevaId: string, input: Parameters<typeof sevaWrites.updateSeva>[5]) => {
      requirePerm("seva.write");
      const ctx = requireFestival();
      return run("Seva updated", () =>
        sevaWrites.updateSeva(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, sevaId, input)
      );
    },
    setSevaStatus: (sevaId: string, next: SevaStatus) => {
      requirePerm("seva.write");
      const ctx = requireFestival();
      const label = next === "completed" ? "Seva completed" : next === "in_progress" ? "Seva started" : "Seva updated";
      return run(label, () =>
        sevaWrites.setSevaStatus(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, sevaId, next)
      );
    },
    voidSeva: (sevaId: string, reason?: string) => {
      requirePerm("seva.write");
      const ctx = requireFestival();
      return run("Seva removed", () =>
        sevaWrites.voidSeva(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, sevaId, reason)
      );
    },
    assignSevaDuty: (sevaId: string, input: Parameters<typeof sevaWrites.assignDuty>[5]) => {
      requirePerm("seva.assign");
      const ctx = requireFestival();
      return run("Volunteer assigned", () =>
        sevaWrites.assignDuty(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, sevaId, input)
      );
    },
    removeSevaDuty: (sevaId: string, dutyId: string) => {
      requirePerm("seva.assign");
      const ctx = requireFestival();
      return run("Volunteer removed", () =>
        sevaWrites.removeDuty(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, sevaId, dutyId)
      );
    },
    setSevaDutyStatus: (sevaId: string, dutyId: string, next: DutyStatus, isOwnDuty = false) => {
      // A volunteer reporting on their own duty needs no permission - the rules
      // allow it for the assignee, restricted to the status field. Staffing
      // anyone else still requires seva.assign.
      if (!isOwnDuty) requirePerm("seva.assign");
      const ctx = requireFestival();
      const label = next === "on_duty" ? "On duty" : next === "completed" ? "Duty completed" : "Duty updated";
      return run(label, () =>
        sevaWrites.setDutyStatus(ctx.db, ctx.actor, ctx.pandalId, ctx.festivalId, sevaId, dutyId, next)
      );
    },
  };
}
