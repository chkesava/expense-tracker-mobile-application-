/**
 * Removing a deleted account from a Pandal — SPENDLY-7 (AUTH-06).
 *
 * When someone deletes their account, their Ganesh Seva membership cannot
 * simply be deleted alongside it. Two reasons:
 *
 * 1. `firestore.rules` says `allow delete: if false` on member documents.
 * 2. The Pandal's own records point at them — collections and expenses carry a
 *    `collectorId`, and `memberAudits` rows name them. Deleting the member
 *    would break the ledger for a committee that is not deleting anything.
 *
 * So membership is **marked `removed` with an audit row**, mirroring
 * `leavePandal` in `services/ganesh/ganeshWrites.ts`. That is a deliberate,
 * documented exception to "delete everything", and it means a Pandal's history
 * keeps the departed member's name. That belongs in the privacy policy rather
 * than buried here — see `docs/SPENDLY-7-account-deletion.md`.
 *
 * Pure, so the decision is provable without an emulator: the Admin SDK path
 * that applies it is not reachable from vitest.
 */

import type { PandalMemberAuditAction } from "../types/ganesh";

export type MembershipAudit = {
  action: PandalMemberAuditAction;
  reason: string;
};

export type MembershipRemoval = {
  /** Whether anything needs writing at all. */
  changed: boolean;
  /** Was this an admin who counted toward the Pandal's admin floor. */
  wasActiveAdmin: boolean;
  nextAdminCount: number;
  /** True when this leaves the Pandal with no admin at all. */
  orphansPandal: boolean;
  audits: MembershipAudit[];
};

const NO_CHANGE: MembershipRemoval = {
  changed: false,
  wasActiveAdmin: false,
  nextAdminCount: 0,
  orphansPandal: false,
  audits: [],
};

export const ACCOUNT_DELETED_REASON = "Account deleted";
export const LAST_ADMIN_REASON = "Last admin deleted their account";

/**
 * Decide what one membership removal writes.
 *
 * Unlike `canLeavePandal`, this **never refuses**. A normal leave is blocked
 * when it would drop a Pandal below one admin, and rightly so. But account
 * deletion is a Play policy obligation, and it cannot be held hostage by
 * someone else's committee needing an admin. So the last admin leaves, the
 * Pandal is flagged, and the caller reports it so the user is warned before
 * they confirm — rather than being silently refused, or silently orphaning it.
 *
 * How an admin-less Pandal recovers is not defined anywhere in this codebase
 * and is not invented here; it is a separate ticket.
 */
export function planMembershipRemoval(input: {
  role?: string | null;
  status?: string | null;
  adminCount?: number | null;
}): MembershipRemoval {
  const status = input.status ?? "active";
  // Already gone: a resumed deletion must not write a second audit row or
  // decrement the admin count twice.
  if (status === "removed") return NO_CHANGE;

  const role = input.role ?? "member";
  const adminCount =
    typeof input.adminCount === "number" && Number.isFinite(input.adminCount)
      ? input.adminCount
      : 1;

  // Only an *active* admin is counted toward the floor, matching
  // `leavePandal`. A suspended admin is not holding the Pandal up.
  const wasActiveAdmin = role === "admin" && status === "active";
  const nextAdminCount = Math.max(0, adminCount - (wasActiveAdmin ? 1 : 0));
  const orphansPandal = wasActiveAdmin && nextAdminCount < 1;

  const audits: MembershipAudit[] = [
    // Reuses the existing `left` vocabulary so `memberAuditLine()` renders it
    // with no change; the reason carries the nuance.
    { action: "left", reason: ACCOUNT_DELETED_REASON },
  ];
  if (orphansPandal) {
    audits.push({ action: "remove_admin", reason: LAST_ADMIN_REASON });
  }

  return {
    changed: true,
    wasActiveAdmin,
    nextAdminCount,
    orphansPandal,
    audits,
  };
}
