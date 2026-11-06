import { useCallback } from "react";

import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import {
  commitGroupFundWrite,
  GroupFundInvalidError,
  loadGroupFund,
  loadReversalContext,
  newGroupFundEventId,
  newGroupFundId,
  newGroupFundKey,
} from "@/services/groupFunds/groupFundStore";
import type { GroupFund, GroupFundEvent } from "@/shared/types/groupFund";
import { groupFundIssueMessage } from "@/shared/utils/groupFundMessages";
import {
  buildAccountMove,
  buildContribution,
  buildCreateGroupFund,
  buildEditGroupFund,
  buildOpening,
  buildPayout,
  buildPurposeTransfer,
  buildReversal,
  type AccountMoveInput,
  type ContributionInput,
  type GroupFundConfigInput,
  type GroupFundEditPatch,
  type GroupFundWriteContext,
  type GroupFundWriteResult,
  type OpeningInput,
  type PayoutInput,
  type PurposeTransferInput,
} from "@/shared/utils/groupFundWrites";

/**
 * Group Funds writes for the screens (SPENDLY-687). Every write:
 * - loads its fund from **Firestore** first (`loadGroupFund`), never from the
 *   list the screen shows, which may be the read-model copy (R4.3a);
 * - uses the event id the sheet minted once per submit (`newEventId`), so a
 *   retry of the same submit can't apply twice;
 * - goes out as one outbox batch (`commitGroupFundWrite`), and says
 *   "saved" or "will sync" with `writeSavedMessage`.
 * Each returns true when the write was accepted (saved or queued).
 */
export function useGroupFundActions() {
  const { user } = useAuth();
  const uid = user?.uid;

  const run = useCallback(
    async (
      scope: string,
      success: string,
      build: (ctx: GroupFundWriteContext, fund: GroupFund | null) => GroupFundWriteResult,
      fundId: string | null,
      eventId: string
    ): Promise<boolean> => {
      if (!uid) return false;
      try {
        const fund = fundId ? await loadGroupFund(uid, fundId) : null;
        if (fundId && !fund) {
          toast.error("This fund isn't here any more.");
          return false;
        }
        const outcome = await commitGroupFundWrite(uid, build({ uid, nowMs: Date.now(), eventId }, fund), scope, {
          onLateFailure: (error) => {
            logError(`groupFunds.${scope}.late`, error);
            toast.error(friendlyErrorMessage(error, "This change couldn't be saved. Please try again."));
          },
        });
        toast.success(writeSavedMessage(outcome, success));
        return true;
      } catch (error) {
        if (error instanceof GroupFundInvalidError) {
          toast.error(groupFundIssueMessage(error.issues));
          return false;
        }
        logError(`groupFunds.${scope}`, error);
        toast.error(friendlyErrorMessage(error, "This change couldn't be saved. Please try again."));
        return false;
      }
    },
    [uid]
  );

  const newEventId = useCallback(() => (uid ? newGroupFundEventId(uid) : ""), [uid]);
  const newKey = useCallback(() => (uid ? newGroupFundKey(uid) : ""), [uid]);
  const newFundId = useCallback(() => (uid ? newGroupFundId(uid) : ""), [uid]);

  const createFund = useCallback(
    (fundId: string, input: GroupFundConfigInput) =>
      run("create", "Group fund created", (ctx) => buildCreateGroupFund(ctx, fundId, input), null, fundId),
    [run]
  );
  const editFund = useCallback(
    (fundId: string, patch: GroupFundEditPatch, success = "Group fund updated") =>
      run("edit", success, (ctx, fund) => buildEditGroupFund(ctx, fund!, patch), fundId, newEventId()),
    [run, newEventId]
  );
  const addContribution = useCallback(
    (fundId: string, eventId: string, input: ContributionInput) =>
      run("contribution", "Contribution recorded", (ctx, fund) => buildContribution(ctx, fund!, input), fundId, eventId),
    [run]
  );
  const recordPayout = useCallback(
    (fundId: string, eventId: string, input: PayoutInput) =>
      run("payout", "Payout recorded", (ctx, fund) => buildPayout(ctx, fund!, input), fundId, eventId),
    [run]
  );
  const recordOpening = useCallback(
    (fundId: string, eventId: string, input: OpeningInput) =>
      run("opening", "Opening balance recorded", (ctx, fund) => buildOpening(ctx, fund!, input), fundId, eventId),
    [run]
  );
  const movePurpose = useCallback(
    (fundId: string, eventId: string, input: PurposeTransferInput) =>
      run("transfer", "Moved between purposes", (ctx, fund) => buildPurposeTransfer(ctx, fund!, input), fundId, eventId),
    [run]
  );
  const moveAccount = useCallback(
    (fundId: string, eventId: string, input: AccountMoveInput) =>
      run("accountMove", "Moved between accounts", (ctx, fund) => buildAccountMove(ctx, fund!, input), fundId, eventId),
    [run]
  );

  /** Undo one entry. Earlier corrections and a transfer's other half are read fresh first. */
  const reverse = useCallback(
    async (fundId: string, target: GroupFundEvent, date: string, note?: string): Promise<boolean> => {
      if (!uid) return false;
      let knownEvents: GroupFundEvent[];
      try {
        knownEvents = await loadReversalContext(uid, target);
      } catch (error) {
        logError("groupFunds.reverse.context", error);
        toast.error(friendlyErrorMessage(error, "Couldn't check this entry. Please try again."));
        return false;
      }
      // Derived ids (rev_<id>): a second attempt from any device is refused, never doubled.
      return run(
        "reverse",
        "Entry undone",
        (ctx, fund) => buildReversal(ctx, fund!, { target, knownEvents, date, note }),
        fundId,
        newEventId()
      );
    },
    [uid, run, newEventId]
  );

  return {
    newEventId,
    newKey,
    newFundId,
    createFund,
    editFund,
    addContribution,
    recordPayout,
    recordOpening,
    movePurpose,
    moveAccount,
    reverse,
  };
}
