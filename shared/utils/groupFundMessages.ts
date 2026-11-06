/**
 * SPENDLY-687 — Group Funds copy: why a write was refused, and how a history
 * row reads. Pure, so the wording is tested once and every screen agrees.
 */

import type { GroupFund, GroupFundEvent, GroupFundEventKind } from "../types/groupFund";
import { groupFundEventEffect } from "./groupFundMath";
import type { GroupFundIssue } from "./groupFundModel";

const ISSUE_TEXT: Record<GroupFundIssue, string> = {
  name_required: "Give it a name.",
  name_too_long: "That name is too long.",
  notes_too_long: "The notes are too long.",
  note_too_long: "The note is too long.",
  recipient_too_long: "The recipient's name is too long.",
  reference_too_long: "The reference is too long.",
  amount_invalid: "Enter an amount.",
  amount_not_positive: "The amount must be more than zero.",
  amount_too_large: "That amount is too large.",
  amount_too_precise: "Use at most two decimal places.",
  date_invalid: "Pick a valid date.",
  period_invalid: "Pick a valid month.",
  id_invalid: "Something went wrong. Please try again.",
  purposes_required: "Add at least one purpose, like “Loan repayment”.",
  too_many_purposes: "A fund can have up to 20 purposes.",
  too_many_members: "A fund can have up to 200 members.",
  purpose_invalid: "Each purpose needs a name. Purposes with money recorded can be archived, not removed.",
  purpose_duplicate: "Two purposes have the same name.",
  purpose_unknown: "Choose a purpose.",
  purpose_archived: "That purpose is archived.",
  member_invalid: "Each member needs a name. Members with money recorded can be archived, not removed.",
  member_duplicate: "Two members have the same name.",
  member_unknown: "Choose a member.",
  member_archived: "That member is archived.",
  member_required: "Choose who paid.",
  account_required: "Choose the account.",
  account_unsupported: "Choose a bank or cash account. Group money can't sit on a credit card or a deleted account.",
  accounts_same: "Choose two different accounts.",
  purposes_same: "Choose two different purposes.",
  fund_archived: "This fund is archived. Restore it to record money.",
  exceeds_held: "That's more than this purpose holds.",
  exceeds_account_held: "That's more than this fund holds in that account.",
  reversal_not_allowed: "This entry can't be undone.",
  already_reversed: "This entry was already undone.",
  no_change: "Nothing changed.",
};

/** The first issue as a sentence for a toast. */
export function groupFundIssueMessage(issues: readonly GroupFundIssue[]): string {
  const first = issues[0];
  return first ? ISSUE_TEXT[first] : "Something went wrong. Please try again.";
}

export const GROUP_FUND_EVENT_LABELS: Record<GroupFundEventKind, string> = {
  opening: "Opening balance",
  contribution: "Contribution",
  payout: "Payout",
  transfer_out: "Moved out",
  transfer_in: "Moved in",
  account_move: "Moved between accounts",
  reversal: "Correction",
};

export type GroupFundEventRow = {
  title: string;
  detail: string;
  /** Signed change to the fund's held money (0 for a move between accounts). */
  heldDelta: number;
};

/** How one history row reads. Names come from the fund and the user's accounts. */
export function describeGroupFundEvent(
  event: GroupFundEvent,
  fund: Pick<GroupFund, "purposes" | "members">,
  accountName: (accountId: string) => string
): GroupFundEventRow {
  const purpose = fund.purposes.find((p) => p.id === event.purposeId)?.name ?? "Purpose";
  const member = event.memberId ? fund.members.find((m) => m.id === event.memberId)?.name ?? "Member" : null;
  const account = event.accountId ? accountName(event.accountId) : null;
  const heldDelta = groupFundEventEffect(event).heldDelta;
  switch (event.kind) {
    case "contribution":
      return { title: member ?? "Contribution", detail: [purpose, account && `into ${account}`, event.period].filter(Boolean).join(" · "), heldDelta };
    case "payout":
      return {
        title: event.recipient ? `Paid to ${event.recipient}` : "Payout",
        detail: [purpose, account && `from ${account}`, event.reference].filter(Boolean).join(" · "),
        heldDelta,
      };
    case "opening":
      return { title: "Opening balance", detail: [purpose, account && `in ${account}`].filter(Boolean).join(" · "), heldDelta };
    case "transfer_out":
      return { title: `Moved out of ${purpose}`, detail: "Between purposes", heldDelta };
    case "transfer_in":
      return { title: `Moved into ${purpose}`, detail: "Between purposes", heldDelta };
    case "account_move":
      return {
        title: "Moved between accounts",
        detail: [account, event.toAccountId && accountName(event.toAccountId)].filter(Boolean).join(" → "),
        heldDelta,
      };
    case "reversal": {
      const undone = event.reversedKind ? GROUP_FUND_EVENT_LABELS[event.reversedKind].toLowerCase() : "entry";
      return { title: `Correction: ${undone} undone`, detail: [member, purpose].filter(Boolean).join(" · "), heldDelta };
    }
  }
}

/** Kinds a user may undo from the history (a correction is never undone). */
export function canReverseGroupFundEvent(event: GroupFundEvent, reversedIds: ReadonlySet<string>): boolean {
  return event.kind !== "reversal" && !reversedIds.has(event.id);
}

/**
 * SPENDLY-687: why a contribution might be a duplicate, or null when it looks
 * fine. A member who has already paid for this month (in full, or anything at
 * all when no expected amount is set), or a payment above what's still due,
 * asks for confirmation instead of silently adding a second entry.
 */
export function contributionDuplicateWarning(input: {
  memberName: string;
  purposeName: string;
  monthLabel: string;
  expected: number | null;
  received: number;
  amount: number;
  money: (value: number) => string;
}): string | null {
  const { memberName, purposeName, monthLabel, expected, received, amount, money } = input;
  if (expected !== null && expected > 0) {
    const pending = Math.max(0, expected - received);
    if (received >= expected) {
      return `${memberName} has already paid ${money(received)} of ${money(expected)} for ${purposeName} in ${monthLabel}. Record ${money(amount)} more anyway?`;
    }
    if (amount > pending + 0.005) {
      return `${memberName} only owes ${money(pending)} more for ${purposeName} in ${monthLabel}. Record ${money(amount)} anyway?`;
    }
    return null;
  }
  return received > 0
    ? `${memberName} already paid ${money(received)} for ${purposeName} in ${monthLabel}. Record another ${money(amount)}?`
    : null;
}
