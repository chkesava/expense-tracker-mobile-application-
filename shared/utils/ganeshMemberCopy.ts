import type { PandalMember, PandalMemberAudit } from "@/shared/types/ganesh";
import { memberDisplayName } from "@/shared/utils/ganeshIdentity";
import { ganeshRoleLabel } from "@/shared/utils/ganeshPermissions";

export function lastAdminSafetyMessage(isSelf: boolean): string {
  if (isSelf) {
    return "You cannot remove or demote yourself until another Admin is assigned.";
  }
  return "This is the only Pandal Admin. Assign another before suspending or removing them.";
}

export function memberAuditLine(audit: PandalMemberAudit, members: PandalMember[]): string {
  const actor = memberDisplayName(members, audit.actorId);
  const target = memberDisplayName(members, audit.targetUserId);
  if (audit.action === "pandal_created") return `${actor} created this Pandal`;
  if (audit.action === "approved") return `${actor} approved ${target}`;
  if (audit.action === "rejected") return `${actor} did not approve ${target}`;
  if (audit.action === "joined") return `${target} joined`;
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
