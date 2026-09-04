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
import {
  ADMIN_ONLY_PERMISSION_GROUPS,
  ALL_PERMISSION_GROUPS,
  PERMISSION_GROUPS,
  expandPermissions,
} from "@/shared/utils/ganeshPermissionRegistry";
import {
  ROLE_PERMISSIONS,
  RULE_ASSET_CREATE_ROLES,
  RULE_ASSET_UPDATE_ROLES,
  RULE_COLLECTION_WRITE_ROLES,
  RULE_EXPENSE_WRITE_ROLES,
  RULE_SEVA_WRITE_ROLES,
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

function canReadFestivalYear(ctx: Ctx): boolean {
  return isActivePandalMember(ctx);
}

function canCreateFestivalYear(
  ctx: Ctx,
  data: { festivalId: unknown; year: unknown }
): boolean {
  return canCreateFestival(ctx)
    && typeof data.festivalId === "string"
    && typeof data.year === "number";
}

function canUpdateFestivalYear(): boolean {
  return false;
}

function canDeleteFestivalYear(): boolean {
  return false;
}

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
  "seva.read",
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
          : subcol === "seva"
            ? ["scheduled", "in_progress", "completed", "cancelled"].includes(d.status as string)
            : subcol === "reimbursements"
              ? ["paid", "voided"].includes(d.status as string)
            : typeof d.status === "string");

  const flagsOk =
    (!("voided" in d) || typeof d.voided === "boolean")
    && (!("reimbursementRequired" in d) || typeof d.reimbursementRequired === "boolean")
    && (!("clientOpId" in d) || (typeof d.clientOpId === "string" && d.clientOpId.length > 0))
    && (!("date" in d) || typeof d.date === "string")
    && (!("paymentMethod" in d)
      || ["cash", "upi", "bank", "other"].includes(d.paymentMethod as string))
    && (!("location" in d)
      || ["cash", "upi", "bank", "other"].includes(d.location as string))
    && (!("direction" in d)
      || subcol !== "fundTransfers"
      || ["to_permanent", "from_permanent"].includes(d.direction as string));

  const summarySigned = new Set(["pendingReimbursements", "cash", "upi", "bank", "other"]);
  const summaryOk = subcol !== "summary"
    || (Object.keys(d).every((key) => RULE_SUMMARY_FIELDS.includes(key))
      && Object.keys(EMPTY_GANESH_SUMMARY).every((key) =>
        summarySigned.has(key) ? okSignedMoney(d, key) : okMoney(d, key)
      ));

  /** Mirrors `sevaCarriesNoMoney()` in firestore.rules. */
  const sevaMoneyOk = subcol !== "seva"
    || !RULE_SEVA_FORBIDDEN_FIELDS.some((key) => key in d);

  return amountsOk && statusOk && flagsOk && summaryOk && sevaMoneyOk;
}

/**
 * Money-shaped keys a seva document may never carry. A seva is the operational
 * schedule; letting `seva.write` park an amount would put money behind the
 * wrong permission the moment anything read it.
 */
const RULE_SEVA_FORBIDDEN_FIELDS = [
  "amount",
  "totalAmount",
  "godFundAmount",
  "personalAmount",
  "sponsoredAmount",
  "estimatedValue",
  "ledgerType",
];

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

  it("does not let an open-join member update the Pandal document (memberIds)", () => {
    expect(canManageMembers(member)).toBe(false);
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
    expect(payloadWellFormed("reimbursements", { status: "paid" })).toBe(true);
    expect(payloadWellFormed("reimbursements", { status: "pending" })).toBe(false);
  });

  it("rejects malformed voided, date and transfer direction values", () => {
    expect(payloadWellFormed("expenses", { voided: "no" })).toBe(false);
    expect(payloadWellFormed("expenses", { date: 20260826 })).toBe(false);
    expect(payloadWellFormed("expenses", { reimbursementRequired: "yes" })).toBe(false);
    expect(payloadWellFormed("expenses", { clientOpId: "retry-1" })).toBe(true);
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

// --- GS-014 / GS-015 --------------------------------------------------------
/** Mirrors `currentAdminCount()` / `afterAdminCount()` in firestore.rules. */
function readAdminCount(doc: { adminCount?: unknown } | null): number {
  if (!doc) return 1;
  return typeof doc.adminCount === "number" ? doc.adminCount : 1;
}

/** Mirrors `keepsAdminCount()` in firestore.rules. */
function keepsAdminCountGuarded(params: {
  oldRole: GaneshRole;
  oldStatus: GaneshMemberStatus;
  newRole: GaneshRole;
  newStatus: GaneshMemberStatus;
  pandalBefore: { adminCount?: unknown } | null;
  pandalAfter: { adminCount?: unknown } | null;
}): boolean {
  const before = readAdminCount(params.pandalBefore);
  const after = readAdminCount(params.pandalAfter);
  const wasAdmin = params.oldRole === "admin" && params.oldStatus === "active";
  const willBeAdmin = params.newRole === "admin" && params.newStatus === "active";
  if (wasAdmin && !willBeAdmin) return after === before - 1 && after >= 1;
  if (!wasAdmin && willBeAdmin) return after === before + 1;
  return after === before;
}

/** Mirrors `createKeepsAdminCount()` in firestore.rules. */
function createKeepsAdminCount(params: {
  newRole: GaneshRole;
  newStatus: GaneshMemberStatus;
  pandalBefore: { adminCount?: unknown } | null;
  pandalAfter: { adminCount?: unknown } | null;
}): boolean {
  const before = readAdminCount(params.pandalBefore);
  const after = readAdminCount(params.pandalAfter);
  const willBeAdmin = params.newRole === "admin" && params.newStatus === "active";
  return willBeAdmin ? after === before + 1 : after === before;
}

/** Mirrors `adminCountDeltaBounded()` in firestore.rules. */
function adminCountDeltaBounded(
  before: { adminCount?: unknown } | null,
  after: { adminCount?: unknown } | null
): boolean {
  const b = readAdminCount(before);
  const a = readAdminCount(after);
  return a >= 1 && a >= b - 1 && a <= b + 1;
}

// --- GS-018 -----------------------------------------------------------------
/** Mirrors the closed-festival clauses of the festival wildcard. */
function canUpdateLedgerDoc(params: {
  ctx: Ctx;
  isCreator: boolean;
  festivalOpen: boolean;
}): boolean {
  if (!isActivePandalMember(params.ctx)) return false;
  if (params.festivalOpen) return params.isCreator || canCloseOrUpdateFestival(params.ctx);
  return false;
}

function canDeleteLedgerDoc(): boolean {
  return false;
}

// --- GS-037 -----------------------------------------------------------------
/** Mirrors `contributionCreateAllowed()` in firestore.rules. */
function canCreateContribution(
  ctx: Ctx,
  payload: { status?: string; sponsorshipId?: string }
): boolean {
  if (!isActivePandalMember(ctx) || !ctx.festivalOpen) return false;
  if (!canWriteExpenseOrContribution(ctx)) return false;
  if (payload.status !== "received") return true;
  if (canReceiveContribution(ctx)) return true;
  return Boolean(payload.sponsorshipId) && canReceiveSponsor(ctx);
}

describe("ganesh firestore rules - GS-014 adminCount on legacy pandals", () => {
  const legacy = {};

  it("treats a pandal with no adminCount field as having one admin", () => {
    expect(readAdminCount(legacy)).toBe(1);
    expect(readAdminCount({ adminCount: "2" })).toBe(1);
    expect(readAdminCount({ adminCount: 3 })).toBe(3);
  });

  it("lets a member write that does not touch adminCount through on a legacy pandal", () => {
    // Role assignment, role-permission propagation and member re-approval all
    // write only the member document, so before and after both read as 1.
    expect(
      keepsAdminCountGuarded({
        oldRole: "member",
        oldStatus: "active",
        newRole: "collector",
        newStatus: "active",
        pandalBefore: legacy,
        pandalAfter: legacy,
      })
    ).toBe(true);
  });

  it("still blocks demoting or removing the final admin", () => {
    expect(
      keepsAdminCountGuarded({
        oldRole: "admin",
        oldStatus: "active",
        newRole: "member",
        newStatus: "active",
        pandalBefore: { adminCount: 1 },
        pandalAfter: { adminCount: 0 },
      })
    ).toBe(false);
    expect(
      keepsAdminCountGuarded({
        oldRole: "admin",
        oldStatus: "active",
        newRole: "admin",
        newStatus: "removed",
        pandalBefore: { adminCount: 2 },
        pandalAfter: { adminCount: 1 },
      })
    ).toBe(true);
  });
});

describe("ganesh firestore rules - GS-015 adminCount cannot drift", () => {
  it("refuses creating an active admin without incrementing the count", () => {
    expect(
      createKeepsAdminCount({
        newRole: "admin",
        newStatus: "active",
        pandalBefore: { adminCount: 1 },
        pandalAfter: { adminCount: 1 },
      })
    ).toBe(false);
    expect(
      createKeepsAdminCount({
        newRole: "admin",
        newStatus: "active",
        pandalBefore: { adminCount: 1 },
        pandalAfter: { adminCount: 2 },
      })
    ).toBe(true);
  });

  it("lets an admin add a non-admin without moving the count", () => {
    expect(
      createKeepsAdminCount({
        newRole: "collector",
        newStatus: "active",
        pandalBefore: { adminCount: 1 },
        pandalAfter: { adminCount: 1 },
      })
    ).toBe(true);
  });

  it("refuses a one-shot inflation of adminCount on a pandal update", () => {
    expect(adminCountDeltaBounded({ adminCount: 1 }, { adminCount: 99 })).toBe(false);
    expect(adminCountDeltaBounded({ adminCount: 1 }, { adminCount: 0 })).toBe(false);
  });

  it("still allows the plus or minus one move a real admin transition makes", () => {
    expect(adminCountDeltaBounded({ adminCount: 1 }, { adminCount: 2 })).toBe(true);
    expect(adminCountDeltaBounded({ adminCount: 2 }, { adminCount: 1 })).toBe(true);
    expect(adminCountDeltaBounded({ adminCount: 2 }, { adminCount: 2 })).toBe(true);
  });
});

describe("ganesh firestore rules - GS-016 the checklist matches the rules", () => {
  it("does not offer members, roles or settings as grantable", () => {
    const grantable = PERMISSION_GROUPS.map((group) => group.id);
    expect(grantable).not.toContain("members");
    expect(grantable).not.toContain("roles");
    expect(grantable).not.toContain("settings");
  });

  it("keeps them available for labelling an admin's own full set", () => {
    const reserved = ADMIN_ONLY_PERMISSION_GROUPS.map((group) => group.id);
    expect(reserved).toEqual(["members", "roles", "settings"]);
    expect(ALL_PERMISSION_GROUPS).toHaveLength(
      PERMISSION_GROUPS.length + ADMIN_ONLY_PERMISSION_GROUPS.length
    );
  });

  it("offers no permission the rules gate on a literal admin role", () => {
    // canManageMembersOf() is role == 'admin' only, so anything it guards must
    // not appear as a checkbox.
    const offered = PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key));
    for (const key of offered) {
      expect(key.startsWith("members.")).toBe(false);
      expect(key.startsWith("roles.")).toBe(false);
      expect(key.startsWith("settings.")).toBe(false);
    }
  });

  it("still offers audit.read, which now gates audit reads in the rules too", () => {
    const offered = PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key));
    expect(offered).toContain("audit.read");
  });
});

describe("ganesh firestore rules - GS-018 a closed festival is read-only", () => {
  it("refuses ledger updates once the festival is closed, for every role", () => {
    for (const actor of [admin, treasurer, member, collector]) {
      const closed: Ctx = { ...actor, festivalOpen: false };
      expect(canUpdateLedgerDoc({ ctx: closed, isCreator: true, festivalOpen: false })).toBe(false);
      expect(canUpdateLedgerDoc({ ctx: closed, isCreator: false, festivalOpen: false })).toBe(false);
    }
  });

  it("still lets admin and treasurer edit a document they did not create while open", () => {
    expect(canUpdateLedgerDoc({ ctx: treasurer, isCreator: false, festivalOpen: true })).toBe(true);
    expect(canUpdateLedgerDoc({ ctx: member, isCreator: false, festivalOpen: true })).toBe(false);
    expect(canUpdateLedgerDoc({ ctx: member, isCreator: true, festivalOpen: true })).toBe(true);
  });

  it("never hard-deletes a ledger record, so voiding stays the only reversal", () => {
    expect(canDeleteLedgerDoc()).toBe(false);
  });
});

describe("ganesh firestore rules - GS-037 receiving on create needs the permission", () => {
  it("refuses a member creating a contribution already received", () => {
    expect(canCreateContribution(member, { status: "received" })).toBe(false);
    expect(canCreateContribution(member, { status: "promised" })).toBe(true);
  });

  it("lets a treasurer record a received contribution in one step", () => {
    expect(canCreateContribution(treasurer, { status: "received" })).toBe(true);
  });

  it("honours a denormalized contributions.receive grant", () => {
    const receiver: Ctx = {
      signedIn: true,
      member: {
        role: "member",
        status: "active",
        permissions: ["contributions.create", "contributions.receive"],
      },
      festivalOpen: true,
    };
    expect(canCreateContribution(receiver, { status: "received" })).toBe(true);
  });

  it("still lets the sponsor flow mirror a received sponsorship into the ledger", () => {
    const sponsorReceiver: Ctx = {
      signedIn: true,
      member: {
        role: "member",
        status: "active",
        permissions: ["contributions.create", "sponsors.receive"],
      },
      festivalOpen: true,
    };
    expect(canCreateContribution(sponsorReceiver, { status: "received" })).toBe(false);
    expect(
      canCreateContribution(sponsorReceiver, { status: "received", sponsorshipId: "s1" })
    ).toBe(true);
    // A plain member cannot borrow that path by inventing a sponsorshipId.
    expect(canCreateContribution(member, { status: "received", sponsorshipId: "s1" })).toBe(false);
  });
});

/* -------------------------------------------------------------------- Seva */

/** Mirrors `canPlanSevaOf()` in firestore.rules. */
function canPlanSeva(ctx: Ctx): boolean {
  return hasPerm(ctx, "seva.write")
    || (isActivePandalMember(ctx) && !hasPermissionsField(ctx) && RULE_SEVA_WRITE_ROLES.includes(roleOf(ctx)!));
}

/** Mirrors `canAssignSevaOf()` in firestore.rules. */
function canAssignSeva(ctx: Ctx): boolean {
  return hasPerm(ctx, "seva.assign")
    || (isActivePandalMember(ctx) && !hasPermissionsField(ctx) && RULE_SEVA_WRITE_ROLES.includes(roleOf(ctx)!));
}

/** Mirrors `canWriteSevaOf()` in firestore.rules. */
function canWriteSeva(ctx: Ctx): boolean {
  return canPlanSeva(ctx) || canAssignSeva(ctx);
}

/** Mirrors the `duties` update clause, including the own-duty self-service arm. */
function canUpdateDuty(
  ctx: Ctx,
  duty: { userId: string },
  uid: string,
  changedKeys: string[]
): boolean {
  if (!isActivePandalMember(ctx) || !ctx.festivalOpen) return false;
  if (canAssignSeva(ctx)) return true;
  const selfServiceKeys = ["status", "updatedBy", "updatedAt"];
  return duty.userId === uid && changedKeys.every((key) => selfServiceKeys.includes(key));
}

describe("ganesh firestore rules — seva schedule", () => {
  const treasurer: Ctx = {
    signedIn: true,
    member: { role: "treasurer", status: "active" },
    festivalOpen: true,
  };
  const member: Ctx = {
    signedIn: true,
    member: { role: "member", status: "active" },
    festivalOpen: true,
  };
  const viewer: Ctx = {
    signedIn: true,
    member: { role: "viewer", status: "active" },
    festivalOpen: true,
  };

  it("keeps the TypeScript seva matrix aligned with the rules role set", () => {
    for (const role of RULE_SEVA_WRITE_ROLES) {
      expect(can(role, "seva.write")).toBe(true);
      expect(can(role, "seva.assign")).toBe(true);
    }
    // Everyone can see the schedule — a volunteer who cannot read it cannot turn up.
    for (const role of ["admin", "treasurer", "member", "collector", "viewer"] as const) {
      expect(can(role, "seva.read")).toBe(true);
    }
  });

  it("lets only treasurer and admin plan or staff seva by role fallback", () => {
    expect(canPlanSeva(treasurer)).toBe(true);
    expect(canAssignSeva(treasurer)).toBe(true);
    expect(canPlanSeva(member)).toBe(false);
    expect(canAssignSeva(member)).toBe(false);
    expect(canPlanSeva(viewer)).toBe(false);
  });

  it("honours a denormalized seva permission on a custom role", () => {
    const planner: Ctx = {
      signedIn: true,
      member: { role: "member", status: "active", permissions: ["seva.read", "seva.write"] },
      festivalOpen: true,
    };
    expect(canPlanSeva(planner)).toBe(true);
    // Planning is not staffing.
    expect(canAssignSeva(planner)).toBe(false);
    expect(canWriteSeva(planner)).toBe(true);
  });

  it("never lets a seva permission reach money", () => {
    const planner: Ctx = {
      signedIn: true,
      member: { role: "member", status: "active", permissions: ["seva.read", "seva.write"] },
      festivalOpen: true,
    };
    expect(canWriteCollection(planner)).toBe(false);
    expect(canWriteExpenseOrContribution(planner)).toBe(false);
    expect(canWritePermanentFund(planner)).toBe(false);
    expect(canWriteReimbursement(planner)).toBe(false);
  });

  it("rejects a seva document carrying money-shaped fields", () => {
    expect(payloadWellFormed("seva", { name: "Morning Aarti", status: "scheduled" })).toBe(true);
    for (const key of RULE_SEVA_FORBIDDEN_FIELDS) {
      expect(payloadWellFormed("seva", { name: "Aarti", [key]: 500 })).toBe(false);
    }
  });

  it("rejects an unknown seva status", () => {
    expect(payloadWellFormed("seva", { status: "in_progress" })).toBe(true);
    expect(payloadWellFormed("seva", { status: "received" })).toBe(false);
    expect(payloadWellFormed("seva", { status: "whatever" })).toBe(false);
  });

  it("denies a removed or suspended member every seva write", () => {
    for (const status of ["removed", "suspended"] as const) {
      const gone: Ctx = { signedIn: true, member: { role: "treasurer", status }, festivalOpen: true };
      expect(canPlanSeva(gone)).toBe(false);
      expect(canAssignSeva(gone)).toBe(false);
      expect(canWriteSeva(gone)).toBe(false);
    }
  });

  it("lets a volunteer report on their own duty without holding seva.assign", () => {
    expect(canUpdateDuty(member, { userId: "u1" }, "u1", ["status", "updatedAt"])).toBe(true);
  });

  it("stops a volunteer editing anyone else's duty", () => {
    expect(canUpdateDuty(member, { userId: "u2" }, "u1", ["status"])).toBe(false);
  });

  it("stops a volunteer reassigning their own duty to someone else", () => {
    expect(canUpdateDuty(member, { userId: "u1" }, "u1", ["userId"])).toBe(false);
    expect(canUpdateDuty(member, { userId: "u1" }, "u1", ["status", "userId"])).toBe(false);
  });

  it("lets a coordinator edit anybody's duty", () => {
    expect(canUpdateDuty(treasurer, { userId: "u2" }, "u1", ["userId", "roleLabel"])).toBe(true);
  });

  it("freezes the schedule once the festival is closed", () => {
    const closed: Ctx = { ...treasurer, festivalOpen: false };
    expect(canUpdateDuty(closed, { userId: "u1" }, "u1", ["status"])).toBe(false);
  });

  it("lets an active member read festivalYears and only festival.create holders write them", () => {
    const payload = { festivalId: "fest-1", year: 2026 };
    expect(canReadFestivalYear(admin)).toBe(true);
    expect(canReadFestivalYear(member)).toBe(true);
    expect(canReadFestivalYear(removed)).toBe(false);
    expect(canCreateFestivalYear(admin, payload)).toBe(true);
    expect(canCreateFestivalYear(treasurer, payload)).toBe(false);
    expect(canCreateFestivalYear(member, payload)).toBe(false);
    expect(canCreateFestivalYear(admin, { festivalId: 1, year: 2026 })).toBe(false);
    expect(canUpdateFestivalYear()).toBe(false);
    expect(canDeleteFestivalYear()).toBe(false);
  });
});

/**
 * GS-017. Hand-written mirror of three clauses in `firestore.rules`:
 *
 *   allow delete: if false;                          (pandals/{pandalId})
 *   keepsPandalCore() -> ownerId may move onto an active admin
 *   pandalNotArchived() -> ANDed into every write predicate
 *
 * There is no emulator in CI, so if those clauses change this file must change
 * with them (GS-074 tracks closing that gap properly).
 */
type ArchiveCtx = {
  /** The pandal's `archived` field, absent on every pandal created before it. */
  archived?: boolean;
};

/** Mirrors `pandalNotArchived()`. Absent field reads as not archived. */
function pandalNotArchived(ctx: ArchiveCtx): boolean {
  return !(ctx.archived === true);
}

/** Mirrors `allow delete` on the pandal document. */
function canDeletePandal(): boolean {
  return false;
}

/** Mirrors the `ownerId` half of `keepsPandalCore()`. */
function keepsOwnerOrMovesToActiveAdmin(params: {
  currentOwnerId: string;
  nextOwnerId: string;
  candidate: { status?: string; role?: string } | null;
}): boolean {
  if (params.nextOwnerId === params.currentOwnerId) return true;
  return (
    params.candidate != null
    && params.candidate.status === "active"
    && params.candidate.role === "admin"
  );
}

describe("ganesh firestore rules - GS-017 pandal ownership and archive", () => {
  it("refuses a hard delete of the pandal, including by its owner", () => {
    // The old clause was `signedIn() && resource.data.ownerId == request.auth.uid`,
    // so a founder who had been removed months earlier could still destroy it.
    expect(canDeletePandal()).toBe(false);
  });

  it("does not let ownerId move onto anyone who is not an active admin", () => {
    const move = (candidate: { status?: string; role?: string } | null) =>
      keepsOwnerOrMovesToActiveAdmin({
        currentOwnerId: "u1",
        nextOwnerId: "u2",
        candidate,
      });

    expect(move({ status: "active", role: "admin" })).toBe(true);
    // Ownership must never land on someone who has left, or on a non-admin.
    expect(move({ status: "removed", role: "admin" })).toBe(false);
    expect(move({ status: "suspended", role: "admin" })).toBe(false);
    expect(move({ status: "active", role: "treasurer" })).toBe(false);
    expect(move({ status: "active", role: "member" })).toBe(false);
    expect(move(null)).toBe(false);
  });

  it("leaves an unchanged ownerId alone, so ordinary pandal edits still pass", () => {
    expect(
      keepsOwnerOrMovesToActiveAdmin({
        currentOwnerId: "u1",
        nextOwnerId: "u1",
        candidate: null,
      })
    ).toBe(true);
  });

  it("treats a pandal with no archived field as writable", () => {
    // Every pandal that predates the field, i.e. all of them today.
    expect(pandalNotArchived({})).toBe(true);
    expect(pandalNotArchived({ archived: false })).toBe(true);
  });

  it("freezes writes on an archived pandal for every role, admin included", () => {
    expect(pandalNotArchived({ archived: true })).toBe(false);
    for (const actor of [admin, treasurer, member, collector]) {
      // `pandalNotArchived()` is ANDed into the write predicates, so the role's
      // own permission no longer matters.
      const archived = { archived: true };
      expect(canWriteCollection(actor) && pandalNotArchived(archived)).toBe(false);
      expect(canWritePermanentFund(actor) && pandalNotArchived(archived)).toBe(false);
    }
  });

  it("keeps reads open on an archived pandal, which is the point of archiving", () => {
    // The freeze is applied to write predicates only, never to `hasPermOf`,
    // because that also backs `canReadAuditOf` — the committee keeps its money
    // history and its audit trail.
    expect(isActivePandalMember(admin)).toBe(true);
    expect(isActivePandalMember(member)).toBe(true);
  });
});

/**
 * Group A, 2026-09-04. Hand-written mirrors of the access-control clauses added
 * for GS-042, GS-043, GS-073, GS-082, GS-083 and GS-084. No emulator in CI
 * (GS-074), so these move with `firestore.rules` or they are worthless.
 */

/** Mirrors `canReadCollectionsOf` / `canReadContributionsOf`. */
function canReadDonorData(params: {
  permissions?: string[];
  permission: "collections.read" | "contributions.read";
  active: boolean;
}): boolean {
  if (!params.active) return false;
  // A member document written before RBAC has no `permissions` array and must
  // not lose access the day these deploy.
  if (params.permissions === undefined) return true;
  return params.permissions.includes(params.permission);
}

/** Mirrors `idIsOwnSlot()` on pandalJoinRequests. */
function joinRequestIdAllowed(requestId: string, pandalId: string, uid: string): boolean {
  return requestId === `${pandalId}__${uid}`;
}

/** Mirrors the pandalJoinRequests delete rule. */
function canDeleteJoinRequest(params: {
  requesterUid: string;
  uid: string;
  isAdminOfPandal: boolean;
}): boolean {
  return params.requesterUid === params.uid || params.isAdminOfPandal;
}

/** Mirrors the pandalInvites create rule. */
function canCreateInvite(params: { createdByIsSelf: boolean; isAdminOfNamedPandal: boolean }) {
  return params.createdByIsSelf && params.isAdminOfNamedPandal;
}

/** Mirrors the membership-index admin-stamp key allowlist. */
function membershipStampAllowed(keys: string[]): boolean {
  const allowed = ["pandalId", "role", "status", "pandalName", "joinedAt", "updatedAt"];
  return keys.every((key) => allowed.includes(key));
}

function canDeleteFestival(): boolean {
  return false;
}

describe("ganesh firestore rules - Group A access control (2026-09-04)", () => {
  it("keeps donor PII from a viewer while leaving it to everyone who had it", () => {
    const forRole = (role: "admin" | "treasurer" | "member" | "collector" | "viewer") =>
      canReadDonorData({
        permissions: [...ROLE_PERMISSIONS[role]],
        permission: "collections.read",
        active: true,
      });

    // Households and collections carry donor name, mobile and address.
    expect(forRole("admin")).toBe(true);
    expect(forRole("treasurer")).toBe(true);
    expect(forRole("member")).toBe(true);
    // A collector needs the household list to collect from it.
    expect(forRole("collector")).toBe(true);
    // The one case being closed: least privilege no longer means full donor DB.
    expect(forRole("viewer")).toBe(false);
    expect(
      canReadDonorData({
        permissions: [...ROLE_PERMISSIONS.viewer],
        permission: "contributions.read",
        active: true,
      })
    ).toBe(false);
  });

  it("does not strip access from a member document written before RBAC", () => {
    // No `permissions` array at all. Denying these would break every legacy
    // member on the day the rules deploy.
    expect(
      canReadDonorData({ permissions: undefined, permission: "collections.read", active: true })
    ).toBe(true);
    // Inactive is still denied, permissions or not.
    expect(
      canReadDonorData({ permissions: undefined, permission: "collections.read", active: false })
    ).toBe(false);
  });

  it("pins a join request to one slot per user per pandal", () => {
    expect(joinRequestIdAllowed("p1__u1", "p1", "u1")).toBe(true);
    // The flood: unlimited ids under one account, each with attacker-supplied
    // displayName and phone rendering into the admin's approval queue.
    expect(joinRequestIdAllowed("anything-else", "p1", "u1")).toBe(false);
    expect(joinRequestIdAllowed("p1__u2", "p1", "u1")).toBe(false);
    expect(joinRequestIdAllowed("p2__u1", "p1", "u1")).toBe(false);
  });

  it("lets an admin clear a join request, and a requester withdraw their own", () => {
    // Was `allow delete: if false`, so a flooded queue was permanent.
    expect(canDeleteJoinRequest({ requesterUid: "u1", uid: "u1", isAdminOfPandal: false })).toBe(true);
    expect(canDeleteJoinRequest({ requesterUid: "u9", uid: "u1", isAdminOfPandal: true })).toBe(true);
    expect(canDeleteJoinRequest({ requesterUid: "u9", uid: "u1", isAdminOfPandal: false })).toBe(false);
  });

  it("refuses an invite minted for a pandal the caller does not administer", () => {
    expect(canCreateInvite({ createdByIsSelf: true, isAdminOfNamedPandal: true })).toBe(true);
    // Code squatting and a misleading name published against a real pandal.
    expect(canCreateInvite({ createdByIsSelf: true, isAdminOfNamedPandal: false })).toBe(false);
    expect(canCreateInvite({ createdByIsSelf: false, isAdminOfNamedPandal: true })).toBe(false);
  });

  it("bounds what an admin may stamp into another user's membership index", () => {
    expect(membershipStampAllowed(["pandalId", "role", "status"])).toBe(true);
    expect(membershipStampAllowed(["pandalId", "role", "status", "pandalName", "updatedAt"])).toBe(true);
    // What stampPandalMembershipIndex actually writes when an admin stamps
    // another user. Omitting `joinedAt` from the allowlist would have denied
    // every admin role change on another person's index.
    expect(membershipStampAllowed(["pandalId", "role", "status", "pandalName", "joinedAt"])).toBe(true);
    // The write primitive being removed: any extra field into someone's tree.
    expect(membershipStampAllowed(["pandalId", "role", "status", "injected"])).toBe(false);
  });

  it("refuses a festival hard delete, as the pandal document already does", () => {
    // Firestore does not cascade: this would leave every collection, expense
    // and contribution alive but unreachable (GS-083, same as GS-017).
    expect(canDeleteFestival()).toBe(false);
  });
});
