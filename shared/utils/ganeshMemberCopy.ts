import type { PandalMember, PandalMemberAudit } from "@/shared/types/ganesh";
import { memberDisplayName } from "@/shared/utils/ganeshIdentity";
import { ganeshRoleLabel } from "@/shared/utils/ganeshPermissions";

export function lastAdminSafetyMessage(isSelf: boolean): string {
  if (isSelf) {
    return "You cannot remove or demote yourself until another Admin is assigned.";
  }
  return "This is the only Pandal Admin. Assign another before suspending or removing them.";
}

/** KAN-34: a member may leave unless they are the last active Admin. */
export function canLeavePandal(input: {
  role?: string | null;
  status?: string | null;
  adminCount: number;
}): { ok: true } | { ok: false; error: string } {
  if (input.status != null && input.status !== "active") {
    return { ok: false, error: "You are not an active member of this Pandal." };
  }
  if (input.role === "admin" && input.adminCount <= 1) {
    return { ok: false, error: lastAdminSafetyMessage(true) };
  }
  return { ok: true };
}

export function memberAuditLine(audit: PandalMemberAudit, members: PandalMember[]): string {
  const actor = memberDisplayName(members, audit.actorId);
  const target = memberDisplayName(members, audit.targetUserId);
  if (audit.action === "pandal_created") return `${actor} created this Pandal`;
  if (audit.action === "approved") return `${actor} approved ${target}`;
  if (audit.action === "rejected") return `${actor} did not approve ${target}`;
  if (audit.action === "joined") return `${target} joined`;
  if (audit.action === "left") return `${target} left`;
  if (audit.action === "suspended") return `${actor} suspended ${target}`;
  if (audit.action === "removed") return `${actor} removed ${target}`;
  if (audit.action === "join_mode") return `${actor} changed who can join`;
  if (audit.action === "make_admin") return `${actor} made ${target} a Pandal Admin`;
  if (audit.action === "remove_admin") return `${actor} removed Admin from ${target}`;
  if (audit.action === "role_assigned") {
    return `${actor} assigned ${audit.roleName ?? "a role"} to ${target}`;
  }
  if (audit.action === "role_unassigned") {
    return `${actor} removed ${audit.roleName ?? "a role"} from ${target}`;
  }
  if (audit.action === "role_permissions") {
    return `${actor} changed ${audit.roleName ?? "a role"}`;
  }
  if (audit.oldRole && audit.newRole && audit.oldRole !== audit.newRole) {
    return `${actor} changed ${target} to ${ganeshRoleLabel(audit.newRole)}`;
  }
  return `${actor} updated ${target}`;
}
