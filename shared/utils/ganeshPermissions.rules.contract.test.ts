/**
 * Contract test for Ganesh RBAC helpers in `firestore.rules`.
 *
 * THIS FILE DOES NOT EXECUTE FIRESTORE RULES. It is a hand-written mirror of
 * the permission helpers and the last-admin / self-promote clauses. Update it
 * whenever those rules change.
 */

import { describe, expect, it } from "vitest";

import type { GaneshMemberStatus, GaneshRole } from "@/shared/types/ganesh";
import {
  RULE_COLLECTION_WRITE_ROLES,
  RULE_EXPENSE_WRITE_ROLES,
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
});
