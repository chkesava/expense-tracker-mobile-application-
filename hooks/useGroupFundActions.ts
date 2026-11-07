import { useCallback } from "react";

import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import {
  commitGroupFundWrite,
  GroupFundInvalidError,
  loadGroupFund,
  loadMemberMonthEvents,
  loadReversalContext,
  newGroupFundEventId,
  newGroupFundId,
  newGroupFundKey,
} from "@/services/groupFunds/groupFundStore";
import type { GroupFund, GroupFundEvent } from "@/shared/types/groupFund";
import { memberMonthStatus, type MemberMonthStatus } from "@/shared/utils/groupFundMath";
import { groupFundIssueMessage } from "@/shared/utils/groupFundMessages";
import {
  buildAccountMove,
  buildBackfillContribution,
  buildContribution,
  buildCreateGroupFund,
  buildEditGroupFund,
  buildOpening,
  buildPastPayout,
  buildPayout,
  buildPurposeTransfer,
  buildReversal,
  type AccountMoveInput,
  type BackfillContributionInput,
  type ContributionInput,
  type GroupFundConfigInput,
  type GroupFundEditPatch,
  type GroupFundWriteContext,
  type GroupFundWriteResult,
  type OpeningInput,
  type PastPayoutInput,
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

  const recordPastPayout = useCallback(
    (fundId: string, eventId: string, input: PastPayoutInput) =>
      run("pastPayout", "Past payout recorded", (ctx, fund) => buildPastPayout(ctx, fund!, input), fundId, eventId),
    [run]
  );

  /**
   * SPENDLY-700: record past months by hand, one member at a time (each is
   * its own batch with a fixed id, so nothing can be recorded twice). Rows
   * already recorded are skipped. Stops at the first failure and says how
   * many were saved, so the user can fix it and press Save again.
   */
  const recordBackfill = useCallback(
    async (fundId: string, rows: BackfillContributionInput[], monthLabel: string): Promise<boolean> => {
      if (!uid || rows.length === 0) return false;
      let saved = 0;
      let queued = false;
      for (const row of rows) {
        try {
          const fund = await loadGroupFund(uid, fundId);
          if (!fund) {
            toast.error("This fund isn't here any more.");
            return false;
          }
          const outcome = await commitGroupFundWrite(
            uid,
            buildBackfillContribution({ uid, nowMs: Date.now(), eventId: "" }, fund, row),
            "backfill",
            {
              onLateFailure: (error) => {
                logError("groupFunds.backfill.late", error);
                toast.error(friendlyErrorMessage(error, "A past payment couldn't be saved. Please try again."));
              },
            }
          );
          if (outcome !== "acked") queued = true;
          saved += 1;
        } catch (error) {
          const message =
            error instanceof GroupFundInvalidError
              ? groupFundIssueMessage(error.issues)
              : friendlyErrorMessage(error, "A past payment couldn't be saved.");
          if (!(error instanceof GroupFundInvalidError)) logError("groupFunds.backfill", error);
          toast.error(saved > 0 ? `Saved ${saved} of ${rows.length}. ${message}` : message);
          return false;
        }
      }
      const what = `${saved} past payment${saved === 1 ? "" : "s"} for ${monthLabel}`;
      toast.success(queued ? `Recorded ${what}. It will sync when you're online.` : `Recorded ${what}.`);
      return true;
    },
    [uid]
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

  /** What a member has already paid toward a purpose for a month, or null if it can't be checked. */
  const checkMemberMonth = useCallback(
    async (fund: GroupFund, memberId: string, purposeId: string, period: string): Promise<MemberMonthStatus | null> => {
      if (!uid) return null;
      try {
        const events = await loadMemberMonthEvents(uid, fund.id, memberId, period);
        return memberMonthStatus(fund, events, memberId, purposeId, period);
      } catch (error) {
        logError("groupFunds.checkMemberMonth", error);
        return null;
      }
    },
    [uid]
  );

  return {
    checkMemberMonth,
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
    recordPastPayout,
    recordBackfill,
    reverse,
  };
}
