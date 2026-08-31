import type { GaneshRole } from "@/shared/types/ganesh";

export function shouldSeedFestivalMember(status: unknown): boolean {
  return status !== "closed";
}

export function festivalMemberSeedPayload(input: {
  userId: string;
  displayName: string;
  role: GaneshRole;
  contributionTarget?: number;
}): {
  userId: string;
  displayName: string;
  role: GaneshRole;
  contributionTarget: number;
  contributionPaid: number;
  personalExpenses: number;
  reimbursed: number;
  pendingReimbursement: number;
} {
  return {
    userId: input.userId,
    displayName: input.displayName,
    role: input.role,
    contributionTarget: Number(input.contributionTarget ?? 0),
    contributionPaid: 0,
    personalExpenses: 0,
    reimbursed: 0,
    pendingReimbursement: 0,
  };
}

/**
 * Open join cannot update `pandals/{id}.memberIds` or write `memberAudits`.
 * Both require `canManageMembers()` (admin). Festival member rows can be
 * seeded after the member doc exists because builtin members hold
 * `expenses.create`.
 */
export const OPEN_JOIN_CAN_UPDATE_MEMBER_IDS = false;
export const OPEN_JOIN_CAN_WRITE_MEMBER_AUDIT = false;
