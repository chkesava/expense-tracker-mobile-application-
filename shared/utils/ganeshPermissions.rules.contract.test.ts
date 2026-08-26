/**
 * Contract test for Ganesh RBAC helpers in `firestore.rules`.
 *
 * THIS FILE DOES NOT EXECUTE FIRESTORE RULES. It is a hand-written mirror of
 * the permission helpers and the last-admin / self-promote clauses. Update it
 * whenever those rules change.
 */

import { describe, expect, it } from "vitest";

import { EMPTY_GANESH_SUMMARY } from "@/shared/types/ganesh";
import type { GaneshMemberStatus, GaneshRole } from "@/shared/types/ganesh";
import { expandPermissions } from "@/shared/utils/ganeshPermissionRegistry";
import {
  ROLE_PERMISSIONS,
  RULE_ASSET_CREATE_ROLES,
  RULE_ASSET_UPDATE_ROLES,
  RULE_COLLECTION_WRITE_ROLES,
  RULE_EXPENSE_WRITE_ROLES,
  RULE_SPONSOR_CREATE_ROLES,
  RULE_SPONSOR_UPDATE_ROLES,
  RULE_TREASURER_WRITE_ROLES,
  can,
} from "./ganeshPermissions";

type Member = { role: GaneshRole; status: GaneshMemberStatus; permissions?: string[] } | null;

type Ctx = {
  signedIn: boolean;
  member: Member;
  ownerId?: string;
  uid?: string;
  festivalOpen?: boolean;
};

function isActivePandalMember(ctx: Ctx): boolean {
  return ctx.signedIn && ctx.member?.status === "active";
}

function roleOf(ctx: Ctx): GaneshRole | undefined {
  return ctx.member?.role;
}

function hasPermissionsField(ctx: Ctx): boolean {
  return Array.isArray(ctx.member?.permissions);
}

function hasPerm(ctx: Ctx, perm: string): boolean {
  return isActivePandalMember(ctx) && (
    roleOf(ctx) === "admin" || Boolean(ctx.member?.permissions?.includes(perm))
  );
}

function canManageMembers(ctx: Ctx): boolean {
  return isActivePandalMember(ctx) && roleOf(ctx) === "admin";
}

function canWriteCollection(ctx: Ctx): boolean {
  return hasPerm(ctx, "collections.create")
    || (isActivePandalMember(ctx) && !hasPermissionsField(ctx) && RULE_COLLECTION_WRITE_ROLES.includes(roleOf(ctx)!));
}

function canWriteExpenseOrContribution(ctx: Ctx): boolean {
  return hasPerm(ctx, "expenses.create")
    || hasPerm(ctx, "contributions.create")
    || (isActivePandalMember(ctx) && !hasPermissionsField(ctx) && RULE_EXPENSE_WRITE_ROLES.includes(roleOf(ctx)!));
}

function canWriteReimbursement(ctx: Ctx): boolean {
  return hasPerm(ctx, "reimbursements.create")
    || (isActivePandalMember(ctx) && !hasPermissionsField(ctx) && RULE_TREASURER_WRITE_ROLES.includes(roleOf(ctx)!));
}

function canWritePermanentFund(ctx: Ctx): boolean {
  return hasPerm(ctx, "permanentFund.transfer")
    || hasPerm(ctx, "permanentFund.add")
    || (isActivePandalMember(ctx) && !hasPermissionsField(ctx) && roleOf(ctx) === "admin");
}

function canCloseOrUpdateFestival(ctx: Ctx): boolean {
  return hasPerm(ctx, "festival.update")
    || hasPerm(ctx, "festival.close")
    || (isActivePandalMember(ctx) && !hasPermissionsField(ctx) && RULE_TREASURER_WRITE_ROLES.includes(roleOf(ctx)!));
}

function canCreateFestival(ctx: Ctx): boolean {
  return hasPerm(ctx, "festival.create")
    || (isActivePandalMember(ctx) && !hasPermissionsField(ctx) && roleOf(ctx) === "admin");
}

function canCreateExpense(ctx: Ctx): boolean {
  return isActivePandalMember(ctx) && (ctx.festivalOpen ?? true) && canWriteExpenseOrContribution(ctx);
}

function canCreateRegularExpense(
  ctx: Ctx,
  input: { assetId?: string } = {}
): boolean {
  const hasAssetId = Boolean(input.assetId);
  return canCreateExpense(ctx) && !hasAssetId;
}

function canCreateAssetPurchaseExpense(
  ctx: Ctx,
  input: { assetId?: string; assetExistsAfter?: boolean } = {}
): boolean {
  return canCreateExpense(ctx)
    && canCreateAsset(ctx)
    && Boolean(input.assetId)
    && Boolean(input.assetExistsAfter);
}

function ownerIdGrantsRead(ownerId: string, uid: string, member: Member): boolean {
  return isActivePandalMember({ signedIn: true, member }) && member?.status === "active";
}

function cannotSelfPromoteToAdmin(params: {
  memberId: string;
  uid: string;
  oldRole: GaneshRole;
  newRole: GaneshRole;
}): boolean {
  return !(params.memberId === params.uid && params.newRole === "admin" && params.oldRole !== "admin");
}

function keepsAdminCount(params: {
  oldRole: GaneshRole;
  oldStatus: GaneshMemberStatus;
  newRole: GaneshRole;
  newStatus: GaneshMemberStatus;
  currentAdminCount: number;
  afterAdminCount: number;
}): boolean {
  const wasAdmin = params.oldRole === "admin" && params.oldStatus === "active";
  const willBeAdmin = params.newRole === "admin" && params.newStatus === "active";
  if (wasAdmin && !willBeAdmin) {
    return params.afterAdminCount === params.currentAdminCount - 1 && params.afterAdminCount >= 1;
  }
  if (!wasAdmin && willBeAdmin) {
    return params.afterAdminCount === params.currentAdminCount + 1;
  }
  return params.afterAdminCount === params.currentAdminCount;
}

const admin: Ctx = { signedIn: true, member: { role: "admin", status: "active" }, festivalOpen: true };
const treasurer: Ctx = { signedIn: true, member: { role: "treasurer", status: "active" }, festivalOpen: true };
const member: Ctx = { signedIn: true, member: { role: "member", status: "active" }, festivalOpen: true };
const collector: Ctx = { signedIn: true, member: { role: "collector", status: "active" }, festivalOpen: true };
const viewer: Ctx = { signedIn: true, member: { role: "viewer", status: "active" }, festivalOpen: true };
const removed: Ctx = { signedIn: true, member: { role: "member", status: "removed" }, festivalOpen: true };
const ownerOnly: Ctx = { signedIn: true, member: null, ownerId: "u1", uid: "u1", festivalOpen: true };

describe("ganesh firestore rules contract", () => {
  it("keeps the TypeScript matrix aligned with the rules role sets", () => {
    const roles: GaneshRole[] = ["admin", "treasurer", "member", "collector", "viewer"];
    expect(roles.filter((role) => can(role, "collections.create"))).toEqual(RULE_COLLECTION_WRITE_ROLES);
    expect(roles.filter((role) => can(role, "expenses.create"))).toEqual(RULE_EXPENSE_WRITE_ROLES);
    expect(roles.filter((role) => can(role, "reimbursements.create"))).toEqual(RULE_TREASURER_WRITE_ROLES);
    expect(roles.filter((role) => can(role, "festival.close"))).toEqual(RULE_TREASURER_WRITE_ROLES);
    expect(roles.filter((role) => can(role, "permanentFund.transfer"))).toEqual(["admin"]);
    expect(roles.filter((role) => can(role, "members.approve"))).toEqual(["admin"]);
    expect(roles.filter((role) => can(role, "festival.create"))).toEqual(["admin"]);
    expect(roles.filter((role) => can(role, "festival.update"))).toEqual(RULE_TREASURER_WRITE_ROLES);
    expect(roles.filter((role) => can(role, "audit.read"))).toEqual(RULE_TREASURER_WRITE_ROLES);
    expect(roles.filter((role) => can(role, "assets.create"))).toEqual(RULE_ASSET_CREATE_ROLES);
    expect(roles.filter((role) => can(role, "assets.update"))).toEqual(RULE_ASSET_UPDATE_ROLES);
    expect(roles.filter((role) => can(role, "contributions.receive"))).toEqual(RULE_TREASURER_WRITE_ROLES);
    expect(roles.filter((role) => can(role, "contributions.cancel"))).toEqual(RULE_TREASURER_WRITE_ROLES);
    expect(roles.filter((role) => can(role, "sponsors.create"))).toEqual(RULE_SPONSOR_CREATE_ROLES);
    expect(roles.filter((role) => can(role, "sponsors.receive"))).toEqual(RULE_TREASURER_WRITE_ROLES);
    expect(roles.filter((role) => can(role, "sponsors.cancel"))).toEqual(RULE_TREASURER_WRITE_ROLES);
  });

  it("does not grant ledger access from ownerId alone", () => {
    expect(isActivePandalMember(ownerOnly)).toBe(false);
    expect(ownerIdGrantsRead("u1", "u1", null)).toBe(false);
  });

  it("denies a removed member every write helper", () => {
    expect(isActivePandalMember(removed)).toBe(false);
    expect(canWriteCollection(removed)).toBe(false);
    expect(canCreateExpense(removed)).toBe(false);
    expect(canWritePermanentFund(removed)).toBe(false);
  });

  it("denies a member writing role: admin on their own members doc", () => {
    expect(
      cannotSelfPromoteToAdmin({
        memberId: "member-1",
        uid: "member-1",
        oldRole: "member",
        newRole: "admin",
      })
    ).toBe(false);
    expect(canManageMembers(member)).toBe(false);
  });

  it("denies collector Permanent Fund transfers and viewer expenses", () => {
    expect(canWritePermanentFund(collector)).toBe(false);
    expect(canWritePermanentFund(treasurer)).toBe(false);
    expect(canWritePermanentFund(admin)).toBe(true);
    expect(canCreateExpense(viewer)).toBe(false);
    expect(canWriteCollection(viewer)).toBe(false);
    expect(canWriteCollection(collector)).toBe(true);
  });

  it("denies treasurer membership and PF writes but allows close and reimbursements", () => {
    expect(canManageMembers(treasurer)).toBe(false);
    expect(canWritePermanentFund(treasurer)).toBe(false);
    expect(canCloseOrUpdateFestival(treasurer)).toBe(true);
    expect(canWriteReimbursement(treasurer)).toBe(true);
    expect(canCreateFestival(treasurer)).toBe(false);
  });

  it("denies a member writing expense categories or reading admin audit logs", () => {
    expect(canCloseOrUpdateFestival(member)).toBe(false);
    expect(canCloseOrUpdateFestival(admin)).toBe(true);
    expect(canCloseOrUpdateFestival(treasurer)).toBe(true);
    expect(can(member.member?.role, "audit.read")).toBe(false);
    expect(can(member.member?.role, "festival.update")).toBe(false);
    expect(can(admin.member?.role, "audit.read")).toBe(true);
  });

  it("denies demoting or removing the last admin", () => {
    expect(
      keepsAdminCount({
        oldRole: "admin",
        oldStatus: "active",
        newRole: "member",
        newStatus: "active",
        currentAdminCount: 1,
        afterAdminCount: 0,
      })
    ).toBe(false);
    expect(
      keepsAdminCount({
        oldRole: "admin",
        oldStatus: "active",
        newRole: "admin",
        newStatus: "removed",
        currentAdminCount: 1,
        afterAdminCount: 0,
      })
    ).toBe(false);
    expect(
      keepsAdminCount({
        oldRole: "admin",
        oldStatus: "active",
        newRole: "member",
        newStatus: "active",
        currentAdminCount: 2,
        afterAdminCount: 1,
      })
    ).toBe(true);
  });

  it("never treats a custom permission set as Pandal Admin", () => {
    const superTreasurer: Ctx = {
      signedIn: true,
      member: {
        role: "member",
        status: "active",
        permissions: ["roles.assign", "permanentFund.transfer", "members.approve", "settings.update"],
      },
    };
    expect(canManageMembers(superTreasurer)).toBe(false);
    expect(canWritePermanentFund(superTreasurer)).toBe(true);
  });

  it("uses denormalized permissions when present and falls back to role names when missing", () => {
    const customCollector: Ctx = {
      signedIn: true,
      member: { role: "member", status: "active", permissions: ["collections.create"] },
      festivalOpen: true,
    };
    expect(canWriteCollection(customCollector)).toBe(true);
    expect(canWriteExpenseOrContribution(customCollector)).toBe(false);
    expect(canWriteCollection(member)).toBe(true);
    expect(canManageMembers(customCollector)).toBe(false);
  });

  it("denies a member reading another Pandal when they have no ACTIVE membership there", () => {
    const otherPandal: Ctx = { signedIn: true, member: null };
    expect(isActivePandalMember(otherPandal)).toBe(false);
    expect(canCreateExpense(otherPandal)).toBe(false);
  });

  it("lets a signed-in person read their own member doc so join can check membership", () => {
    expect(canReadOwnMemberDoc({ signedIn: true, uid: "u1", memberId: "u1" })).toBe(true);
    expect(canReadOwnMemberDoc({ signedIn: true, uid: "u1", memberId: "u2" })).toBe(false);
    expect(canReadOwnMemberDoc({ signedIn: false, uid: "u1", memberId: "u1" })).toBe(false);
  });

  it("requires assets.create plus the sibling asset for asset_purchase expenses", () => {
    const expensesOnly: Ctx = {
      signedIn: true,
      member: { role: "member", status: "active", permissions: ["expenses.create"] },
      festivalOpen: true,
    };
    const bothPerms: Ctx = {
      signedIn: true,
      member: {
        role: "member",
        status: "active",
        permissions: ["expenses.create", "assets.create"],
      },
      festivalOpen: true,
    };
    expect(canCreateRegularExpense(member)).toBe(true);
    expect(canCreateRegularExpense(member, { assetId: "chair-1" })).toBe(false);
    expect(canCreateAssetPurchaseExpense(member, { assetId: "chair-1", assetExistsAfter: true })).toBe(
      true
    );
    expect(canCreateAssetPurchaseExpense(viewer, { assetId: "chair-1", assetExistsAfter: true })).toBe(
      false
    );
    expect(canCreateAssetPurchaseExpense(collector, { assetId: "chair-1", assetExistsAfter: true })).toBe(
      false
    );
    expect(
      canCreateAssetPurchaseExpense(expensesOnly, { assetId: "chair-1", assetExistsAfter: true })
    ).toBe(false);
    expect(canCreateRegularExpense(expensesOnly)).toBe(true);
    expect(
      canCreateAssetPurchaseExpense(bothPerms, { assetId: "chair-1", assetExistsAfter: true })
    ).toBe(true);
    expect(
      canCreateAssetPurchaseExpense(bothPerms, { assetId: "chair-1", assetExistsAfter: false })
    ).toBe(false);
    expect(canCreateAsset(member)).toBe(true);
    expect(canCreateAsset(viewer)).toBe(false);
  });

  it("lets denormalized assets.read through and falls back when permissions are missing", () => {
    const withAssets: Ctx = {
      signedIn: true,
      member: { role: "viewer", status: "active", permissions: ["assets.read"] },
    };
    const viewerFallback = viewer;
    const viewerCannotUpdate: Ctx = {
      signedIn: true,
      member: { role: "viewer", status: "active", permissions: ["assets.read"] },
    };
    expect(canReadAsset(withAssets)).toBe(true);
    expect(canReadAsset(viewerFallback)).toBe(true);
    expect(canCreateAsset(viewerFallback)).toBe(false);
    expect(canUpdateAsset(viewerFallback)).toBe(false);
    expect(canUpdateAsset(viewerCannotUpdate)).toBe(false);
    expect(canCreateAsset(member)).toBe(true);
    expect(canUpdateAsset(treasurer)).toBe(true);
    expect(canUpdateAsset(member)).toBe(false);
  });

  it("lets the requester file or refresh a pending join request, but not approve themselves", () => {
    expect(
      canWriteOwnJoinRequest({
        signedIn: true,
        uid: "u1",
        requestUserId: "u1",
        nextStatus: "pending",
      })
    ).toBe(true);
    expect(
      canWriteOwnJoinRequest({
        signedIn: true,
        uid: "u1",
        requestUserId: "u1",
        nextStatus: "approved",
      })
    ).toBe(false);
    expect(canManageMembers(member)).toBe(false);
  });

  it("lets a Pandal Admin stamp another person's membership index, but not a member", () => {
    expect(
      canWritePandalMembershipIndex({
        isOwner: false,
        actor: admin,
        pandalId: "p1",
        payloadPandalId: "p1",
        status: "active",
      })
    ).toBe(true);
    expect(
      canWritePandalMembershipIndex({
        isOwner: true,
        actor: member,
        pandalId: "p1",
        payloadPandalId: "p1",
        status: "active",
      })
    ).toBe(true);
    expect(
      canWritePandalMembershipIndex({
        isOwner: false,
        actor: member,
        pandalId: "p1",
        payloadPandalId: "p1",
        status: "active",
      })
    ).toBe(false);
    expect(
      canWritePandalMembershipIndex({
        isOwner: false,
        actor: admin,
        pandalId: "p1",
        payloadPandalId: "other",
        status: "active",
      })
    ).toBe(false);
  });

  it("lets fallback treasurer and denormalized receive mark promised as received", () => {
    const denormalizedReceive: Ctx = {
      signedIn: true,
      member: { role: "member", status: "active", permissions: ["contributions.receive"] },
      festivalOpen: true,
    };
    expect(canUpdateContributionStatus(treasurer, "promised", "received")).toBe(true);
    expect(canUpdateContributionStatus(denormalizedReceive, "promised", "received")).toBe(true);
    expect(canUpdateContributionStatus(member, "promised", "received")).toBe(false);
    expect(canUpdateContributionStatus({ ...treasurer, festivalOpen: false }, "promised", "received")).toBe(
      false
    );
  });

  it("does not let expenses.create alone mark a contribution received", () => {
    const expensesOnly: Ctx = {
      signedIn: true,
      member: { role: "member", status: "active", permissions: ["expenses.create"] },
      festivalOpen: true,
    };
    expect(canWriteExpenseOrContribution(expensesOnly)).toBe(true);
    expect(canUpdateContributionStatus(expensesOnly, "promised", "received")).toBe(false);
    expect(canUpdateContributionStatus(expensesOnly, "promised", "promised")).toBe(true);
    expect(canUpdateContributionStatus(member, "promised", "cancelled")).toBe(false);
    expect(canUpdateContributionStatus(treasurer, "promised", "cancelled")).toBe(true);
    expect(canUpdateContributionStatus(treasurer, "received", "cancelled")).toBe(false);
    expect(canUpdateContributionStatus(treasurer, "received", "promised")).toBe(false);
  });

  it("lets fallback treasurer and denormalized receive mark a sponsorship received", () => {
    const denormalizedReceive: Ctx = {
      signedIn: true,
      member: { role: "member", status: "active", permissions: ["sponsors.receive"] },
      festivalOpen: true,
    };
    expect(canUpdateSponsorshipStatus(treasurer, "promised", "received")).toBe(true);
    expect(canUpdateSponsorshipStatus(denormalizedReceive, "promised", "received")).toBe(true);
    expect(canUpdateSponsorshipStatus(member, "promised", "received")).toBe(false);
    expect(canUpdateSponsorshipStatus({ ...treasurer, festivalOpen: false }, "promised", "received")).toBe(
      false
    );
    expect(canUpdateSponsorshipStatus(treasurer, "promised", "confirmed")).toBe(true);
    expect(
      canUpdateSponsorshipStatus(
        {
          signedIn: true,
          member: { role: "member", status: "active", permissions: ["sponsors.update"] },
          festivalOpen: true,
        },
        "prospective",
        "promised"
      )
    ).toBe(true);
  });

  it("does not let expenses.create alone mark a sponsorship received", () => {
    const expensesOnly: Ctx = {
      signedIn: true,
      member: { role: "member", status: "active", permissions: ["expenses.create"] },
      festivalOpen: true,
    };
    expect(canWriteExpenseOrContribution(expensesOnly)).toBe(true);
    expect(canUpdateSponsorshipStatus(expensesOnly, "promised", "received")).toBe(false);
    expect(canUpdateSponsorshipStatus(expensesOnly, "promised", "promised")).toBe(false);
    expect(canCreateReceivedSponsorship(expensesOnly)).toBe(false);
    expect(canCreateReceivedSponsorship(treasurer)).toBe(true);
    expect(canCreateReceivedSponsorship(member)).toBe(false);
    expect(canUpdateSponsorshipStatus(member, "promised", "cancelled")).toBe(false);
    expect(canUpdateSponsorshipStatus(treasurer, "promised", "cancelled")).toBe(true);
    expect(canUpdateSponsorshipStatus(treasurer, "received", "cancelled")).toBe(false);
  });
});

function canReadOwnMemberDoc(params: { signedIn: boolean; uid: string; memberId: string }): boolean {
  return params.signedIn && params.memberId === params.uid;
}

// --- GS-002 -----------------------------------------------------------------
// Mirrors `builtinMemberPermissions()` in firestore.rules. Kept as a literal so
// a drift between the rules file and ROLE_PERMISSIONS.member fails a test
// rather than silently widening what an open-join self-create may claim.
export const RULE_BUILTIN_MEMBER_PERMISSIONS: string[] = [
  "collections.read",
  "expenses.read",
  "contributions.read",
  "reimbursements.read",
  "members.read",
  "permanentFund.read",
  "festival.read",
  "assets.read",
  "sponsors.read",
  "collections.create",
  "collections.update",
  "expenses.create",
  "expenses.update",
  "contributions.create",
  "contributions.update",
  "assets.create",
  "sponsors.create",
  "sponsors.update",
];

/** Mirrors `selfJoinClaimsNoExtraPower()` in firestore.rules. */
function selfJoinClaimsNoExtraPower(payload: {
  permissions?: string[];
  roleIds?: string[];
}): boolean {
  const permissionsOk =
    payload.permissions === undefined
    || payload.permissions.every((key) => RULE_BUILTIN_MEMBER_PERMISSIONS.includes(key));
  const roleIdsOk =
    payload.roleIds === undefined || payload.roleIds.every((id) => id === "member");
  return permissionsOk && roleIdsOk;
}

/** Mirrors the `members/{memberId}` create rule in firestore.rules. */
function canSelfCreateMemberDoc(params: {
  signedIn: boolean;
  uid: string;
  memberId: string;
  joinMode: "open" | "approval";
  ownerId?: string;
  payload: {
    userId: string;
    status: string;
    role: string;
    permissions?: string[];
    roleIds?: string[];
  };
}): boolean {
  if (!params.signedIn) return false;
  if (params.memberId !== params.uid) return false;
  if (params.payload.userId !== params.uid) return false;
  if (params.payload.status !== "active") return false;
  if (params.payload.role === "admin") return params.ownerId === params.uid;
  if (params.payload.role !== "member") return false;
  return params.joinMode === "open" && selfJoinClaimsNoExtraPower(params.payload);
}

// --- GS-003 -----------------------------------------------------------------
/** Mirrors the `pandalInvites/{code}` read grants in firestore.rules. */
const pandalInvites = {
  canGet: (signedIn: boolean) => signedIn,
  canList: (_signedIn: boolean) => false,
};

// --- GS-004 -----------------------------------------------------------------
const RULE_MONEY_CEILING = 1_000_000_000;

const RULE_SUMMARY_FIELDS: string[] = [...Object.keys(EMPTY_GANESH_SUMMARY), "updatedAt"];

function okMoney(d: Record<string, unknown>, key: string): boolean {
  if (!(key in d)) return true;
  const value = d[key];
  return typeof value === "number" && value >= 0 && value <= RULE_MONEY_CEILING;
}

function okSignedMoney(d: Record<string, unknown>, key: string): boolean {
  if (!(key in d)) return true;
  const value = d[key];
  return (
    typeof value === "number" && value >= -RULE_MONEY_CEILING && value <= RULE_MONEY_CEILING
  );
}

const RULE_MONEY_FIELDS = [
  "amount",
  "totalAmount",
  "godFundAmount",
  "personalAmount",
  "sponsoredAmount",
  "estimatedValue",
  "expectedAmount",
  "collectedAmount",
  "contributionTarget",
];

/** Derived counters maintained by increment(); bounded but not floored. */
const RULE_SIGNED_COUNTER_FIELDS = [
  "contributionPaid",
  "personalExpenses",
  "reimbursed",
  "pendingReimbursement",
];

/** Mirrors `payloadWellFormed()` in firestore.rules. */
function payloadWellFormed(subcol: string, d: Record<string, unknown>): boolean {
  const amountsOk =
    RULE_MONEY_FIELDS.every((key) => okMoney(d, key))
    && RULE_SIGNED_COUNTER_FIELDS.every((key) => okSignedMoney(d, key));

  const statusOk = !("status" in d)
    || (subcol === "contributions"
      ? ["promised", "received", "cancelled"].includes(d.status as string)
      : subcol === "sponsorships"
        ? ["prospective", "promised", "confirmed", "received", "cancelled"].includes(
            d.status as string
          )
        : subcol === "households"
          ? ["pending", "partial", "paid", "not_interested", "not_available"].includes(
              d.status as string
            )
          : typeof d.status === "string");

  const flagsOk =
    (!("voided" in d) || typeof d.voided === "boolean")
    && (!("date" in d) || typeof d.date === "string")
    && (!("direction" in d)
      || subcol !== "fundTransfers"
      || ["to_permanent", "from_permanent"].includes(d.direction as string));

  const summaryOk = subcol !== "summary"
    || (Object.keys(d).every((key) => RULE_SUMMARY_FIELDS.includes(key))
      && Object.keys(EMPTY_GANESH_SUMMARY).every((key) =>
        key === "pendingReimbursements" ? okSignedMoney(d, key) : okMoney(d, key)
      ));

  return amountsOk && statusOk && flagsOk && summaryOk;
}

// --- GS-005 -----------------------------------------------------------------
/** Mirrors `isAppendOnlyLog()` in firestore.rules. */
function isAppendOnlyLog(subcol: string): boolean {
  return subcol === "fundTransfers" || subcol === "auditLogs";
}

function canUpdateFestivalSubcol(subcol: string, ctx: Ctx): boolean {
  return !isAppendOnlyLog(subcol) && isActivePandalMember(ctx);
}

function canDeleteFestivalSubcol(subcol: string, ctx: Ctx): boolean {
  return !isAppendOnlyLog(subcol) && canCloseOrUpdateFestival(ctx);
}

describe("ganesh firestore rules — GS-002 open-join self-create", () => {
  const basePayload = {
    userId: "u1",
    status: "active",
    role: "member",
    roleIds: ["member"],
    permissions: RULE_BUILTIN_MEMBER_PERMISSIONS,
  };
  const openJoin = {
    signedIn: true,
    uid: "u1",
    memberId: "u1",
    joinMode: "open" as const,
  };

  it("keeps the rules literal aligned with expandPermissions(ROLE_PERMISSIONS.member)", () => {
    expect([...RULE_BUILTIN_MEMBER_PERMISSIONS].sort()).toEqual(
      [...expandPermissions([...ROLE_PERMISSIONS.member])].sort()
    );
  });

  it("allows the honest open-join payload the app actually writes", () => {
    expect(canSelfCreateMemberDoc({ ...openJoin, payload: basePayload })).toBe(true);
  });

  it("rejects a self-created membership that claims permissions beyond the member set", () => {
    expect(
      canSelfCreateMemberDoc({
        ...openJoin,
        payload: { ...basePayload, permissions: [...RULE_BUILTIN_MEMBER_PERMISSIONS, "permanentFund.transfer"] },
      })
    ).toBe(false);
    expect(
      canSelfCreateMemberDoc({
        ...openJoin,
        payload: { ...basePayload, permissions: ["festival.close"] },
      })
    ).toBe(false);
  });

  it("rejects a self-created membership that claims roleIds other than member", () => {
    expect(
      canSelfCreateMemberDoc({
        ...openJoin,
        payload: { ...basePayload, roleIds: ["treasurer"] },
      })
    ).toBe(false);
    expect(
      canSelfCreateMemberDoc({
        ...openJoin,
        payload: { ...basePayload, roleIds: ["member", "treasurer"] },
      })
    ).toBe(false);
  });

  it("still rejects self-create when the pandal is approval-only", () => {
    expect(
      canSelfCreateMemberDoc({ ...openJoin, joinMode: "approval", payload: basePayload })
    ).toBe(false);
  });

  it("still lets the founder create their own admin membership", () => {
    expect(
      canSelfCreateMemberDoc({
        ...openJoin,
        joinMode: "approval",
        ownerId: "u1",
        payload: { ...basePayload, role: "admin", permissions: ["permanentFund.transfer"] },
      })
    ).toBe(true);
  });
});

describe("ganesh firestore rules — GS-003 pandalInvites enumeration", () => {
  it("lets a signed-in user get an invite by code but never list the collection", () => {
    expect(pandalInvites.canGet(true)).toBe(true);
    expect(pandalInvites.canGet(false)).toBe(false);
    expect(pandalInvites.canList(true)).toBe(false);
  });
});

describe("ganesh firestore rules — GS-004 festival payload validation", () => {
  it("accepts the collection payload the app writes", () => {
    expect(
      payloadWellFormed("collections", {
        donorName: "House 12",
        amount: 500,
        date: "2026-08-26",
        voided: false,
      })
    ).toBe(true);
  });

  it("rejects negative, non-numeric and overflow amounts", () => {
    expect(payloadWellFormed("collections", { amount: -50000 })).toBe(false);
    expect(payloadWellFormed("collections", { amount: "500" })).toBe(false);
    expect(payloadWellFormed("collections", { amount: 1e300 })).toBe(false);
    expect(payloadWellFormed("expenses", { totalAmount: 100, godFundAmount: -100 })).toBe(false);
    expect(payloadWellFormed("reimbursements", { amount: -1 })).toBe(false);
  });

  it("bounds derived per-member counters without flooring them at zero", () => {
    expect(payloadWellFormed("members", { pendingReimbursement: -1000 })).toBe(true);
    expect(payloadWellFormed("members", { contributionPaid: -500 })).toBe(true);
    expect(payloadWellFormed("members", { pendingReimbursement: "x" })).toBe(false);
    expect(payloadWellFormed("members", { reimbursed: 1e300 })).toBe(false);
    expect(payloadWellFormed("members", { contributionTarget: -1 })).toBe(false);
  });

  it("rejects status values outside each subcollection's enum", () => {
    expect(payloadWellFormed("contributions", { status: "received" })).toBe(true);
    expect(payloadWellFormed("contributions", { status: "confirmed" })).toBe(false);
    expect(payloadWellFormed("sponsorships", { status: "confirmed" })).toBe(true);
    expect(payloadWellFormed("households", { status: "not_available" })).toBe(true);
    expect(payloadWellFormed("households", { status: "settled" })).toBe(false);
  });

  it("rejects malformed voided, date and transfer direction values", () => {
    expect(payloadWellFormed("expenses", { voided: "no" })).toBe(false);
    expect(payloadWellFormed("expenses", { date: 20260826 })).toBe(false);
    expect(payloadWellFormed("fundTransfers", { direction: "sideways" })).toBe(false);
    expect(payloadWellFormed("fundTransfers", { direction: "to_permanent" })).toBe(true);
  });

  it("accepts the summary writes the app makes and rejects forged fields", () => {
    expect(payloadWellFormed("summary", { ...EMPTY_GANESH_SUMMARY, updatedAt: 1 })).toBe(true);
    expect(payloadWellFormed("summary", { chanda: 12000, collectionCount: 4 })).toBe(true);
    expect(payloadWellFormed("summary", { chanda: 1000, godFundBonus: 999 })).toBe(false);
    expect(payloadWellFormed("summary", { godFundExpenses: -1 })).toBe(false);
    expect(payloadWellFormed("summary", { chanda: 1e300 })).toBe(false);
  });
});

describe("ganesh firestore rules — GS-005 append-only fund transfers and audit logs", () => {
  it("refuses updates and deletes on fundTransfers and auditLogs for every role", () => {
    for (const actor of [admin, treasurer, member, collector]) {
      for (const subcol of ["fundTransfers", "auditLogs"]) {
        expect(canUpdateFestivalSubcol(subcol, actor)).toBe(false);
        expect(canDeleteFestivalSubcol(subcol, actor)).toBe(false);
      }
    }
  });

  it("leaves the normal ledger subcollections editable and deletable as before", () => {
    expect(canUpdateFestivalSubcol("collections", collector)).toBe(true);
    expect(canDeleteFestivalSubcol("collections", treasurer)).toBe(true);
    expect(canDeleteFestivalSubcol("collections", collector)).toBe(false);
  });
});

function canReadAsset(ctx: Ctx): boolean {
  return hasPerm(ctx, "assets.read")
    || (isActivePandalMember(ctx) && !hasPermissionsField(ctx));
}

function canCreateAsset(ctx: Ctx): boolean {
  return hasPerm(ctx, "assets.create")
    || (isActivePandalMember(ctx) && !hasPermissionsField(ctx) && RULE_ASSET_CREATE_ROLES.includes(roleOf(ctx)!));
}

function canUpdateAsset(ctx: Ctx): boolean {
  return hasPerm(ctx, "assets.update")
    || (isActivePandalMember(ctx) && !hasPermissionsField(ctx) && RULE_ASSET_UPDATE_ROLES.includes(roleOf(ctx)!));
}

function canWriteOwnJoinRequest(params: {
  signedIn: boolean;
  uid: string;
  requestUserId: string;
  nextStatus: "pending" | "approved" | "rejected";
}): boolean {
  return params.signedIn && params.requestUserId === params.uid && params.nextStatus === "pending";
}

function canWritePandalMembershipIndex(params: {
  isOwner: boolean;
  actor: Ctx;
  pandalId: string;
  payloadPandalId: string;
  status: string;
}): boolean {
  if (params.isOwner) return true;
  return (
    canManageMembers(params.actor)
    && params.payloadPandalId === params.pandalId
    && (params.status === "active" || params.status === "suspended" || params.status === "removed")
  );
}

function canReceiveContribution(ctx: Ctx): boolean {
  return hasPerm(ctx, "contributions.receive")
    || (
      isActivePandalMember(ctx)
      && !hasPermissionsField(ctx)
      && RULE_TREASURER_WRITE_ROLES.includes(roleOf(ctx)!)
    );
}

function canCancelContribution(ctx: Ctx): boolean {
  return hasPerm(ctx, "contributions.cancel")
    || (
      isActivePandalMember(ctx)
      && !hasPermissionsField(ctx)
      && RULE_TREASURER_WRITE_ROLES.includes(roleOf(ctx)!)
    );
}

function contributionUpdateAllowed(
  ctx: Ctx,
  oldStatus: string,
  newStatus: string
): boolean {
  if (oldStatus === newStatus) return true;
  return Boolean(ctx.festivalOpen)
    && oldStatus === "promised"
    && (
      (newStatus === "received" && canReceiveContribution(ctx))
      || (newStatus === "cancelled" && canCancelContribution(ctx))
    );
}

function canUpdateContributionStatus(
  ctx: Ctx,
  oldStatus: string,
  newStatus: string
): boolean {
  const statusChanged = oldStatus !== newStatus;
  const updateAllowed = contributionUpdateAllowed(ctx, oldStatus, newStatus);
  return isActivePandalMember(ctx)
    && (
      (statusChanged && updateAllowed)
      || (canWriteExpenseOrContribution(ctx) && updateAllowed)
    )
    && (Boolean(ctx.festivalOpen) || canCloseOrUpdateFestival(ctx));
}

function canCreateSponsor(ctx: Ctx): boolean {
  return hasPerm(ctx, "sponsors.create")
    || (isActivePandalMember(ctx) && !hasPermissionsField(ctx) && RULE_SPONSOR_CREATE_ROLES.includes(roleOf(ctx)!));
}

function canUpdateSponsor(ctx: Ctx): boolean {
  return hasPerm(ctx, "sponsors.update")
    || (isActivePandalMember(ctx) && !hasPermissionsField(ctx) && RULE_SPONSOR_UPDATE_ROLES.includes(roleOf(ctx)!));
}

function canReceiveSponsor(ctx: Ctx): boolean {
  return hasPerm(ctx, "sponsors.receive")
    || (
      isActivePandalMember(ctx)
      && !hasPermissionsField(ctx)
      && RULE_TREASURER_WRITE_ROLES.includes(roleOf(ctx)!)
    );
}

function canCancelSponsor(ctx: Ctx): boolean {
  return hasPerm(ctx, "sponsors.cancel")
    || (
      isActivePandalMember(ctx)
      && !hasPermissionsField(ctx)
      && RULE_TREASURER_WRITE_ROLES.includes(roleOf(ctx)!)
    );
}

function canWriteSponsor(ctx: Ctx): boolean {
  return canCreateSponsor(ctx) || canUpdateSponsor(ctx) || canReceiveSponsor(ctx) || canCancelSponsor(ctx);
}

function sponsorshipUpdateAllowed(ctx: Ctx, oldStatus: string, newStatus: string): boolean {
  if (oldStatus === newStatus) return true;
  if (!ctx.festivalOpen) return false;
  if (oldStatus === "prospective" && newStatus === "promised") return canUpdateSponsor(ctx);
  if (oldStatus === "promised" && newStatus === "confirmed") return canUpdateSponsor(ctx);
  if ((oldStatus === "promised" || oldStatus === "confirmed") && newStatus === "received") {
    return canReceiveSponsor(ctx);
  }
  if (
    (oldStatus === "prospective" || oldStatus === "promised" || oldStatus === "confirmed")
    && newStatus === "cancelled"
  ) {
    return canCancelSponsor(ctx);
  }
  return false;
}

function canUpdateSponsorshipStatus(
  ctx: Ctx,
  oldStatus: string,
  newStatus: string
): boolean {
  const statusChanged = oldStatus !== newStatus;
  const updateAllowed = sponsorshipUpdateAllowed(ctx, oldStatus, newStatus);
  const closedBypass =
    canCloseOrUpdateFestival(ctx)
    && !(statusChanged && (newStatus === "received" || newStatus === "cancelled"));
  return isActivePandalMember(ctx)
    && (
      (statusChanged && updateAllowed)
      || (canWriteSponsor(ctx) && updateAllowed)
    )
    && (Boolean(ctx.festivalOpen) || closedBypass);
}

function canCreateReceivedSponsorship(ctx: Ctx): boolean {
  return isActivePandalMember(ctx)
    && Boolean(ctx.festivalOpen)
    && canWriteSponsor(ctx)
    && canReceiveSponsor(ctx);
}
