import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/Button";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useMemberAudits } from "@/hooks/useMemberAudits";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePandalRoles } from "@/hooks/usePandalRoles";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { PandalMember, PandalMemberAudit, PandalRole } from "@/shared/types/ganesh";
import { formatGaneshWhen, memberDisplayName } from "@/shared/utils/ganeshIdentity";
import { ganeshRoleLabel, ganeshStatusLabel } from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

function memberRolesLabel(member: PandalMember, roles: PandalRole[]): string {
  if (member.role === "admin") return "Pandal Admin";
  const names = (member.roleIds ?? [])
    .map((roleId) => roles.find((role) => role.id === roleId)?.name)
    .filter(Boolean);
  if (names.length > 0) return names.join(" · ");
  return ganeshRoleLabel(member.role);
}

function auditLine(audit: PandalMemberAudit, members: PandalMember[]): string {
  const actor = memberDisplayName(members, audit.actorId);
  const target = memberDisplayName(members, audit.targetUserId);
  if (audit.action === "approved") return `${actor} approved ${target}`;
  if (audit.action === "suspended") return `${actor} suspended ${target}`;
  if (audit.action === "removed") return `${actor} removed ${target}`;
  if (audit.action === "join_mode") return `${actor} changed who can join`;
  if (audit.action === "make_admin") return `${actor} made ${target} a Pandal Admin`;
  if (audit.action === "remove_admin") return `${actor} removed Admin from ${target}`;
  if (audit.action === "role_assigned") return `${actor} assigned ${audit.roleName ?? "a role"} to ${target}`;
  if (audit.action === "role_unassigned") return `${actor} removed ${audit.roleName ?? "a role"} from ${target}`;
  if (audit.action === "role_permissions") return `${actor} changed ${audit.roleName ?? "a role"}`;
  if (audit.oldRole && audit.newRole && audit.oldRole !== audit.newRole) {
    return `${actor} changed ${target} to ${ganeshRoleLabel(audit.newRole)}`;
  }
  return `${actor} updated ${target}`;
}

export default function GaneshMembersScreen() {
  const { theme } = useTheme();
  const { push } = useRouter();
  const { pandalId } = useGaneshSession();
  const { members } = usePandalMembers(pandalId);
  const { roles } = usePandalRoles(pandalId);
  const { can } = useGaneshPermissions();
  const canReadAudit = can("audit.read");
  const { audits } = useMemberAudits(pandalId, canReadAudit);
  const active = members.filter((member) => member.status !== "removed");

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
        Committee
      </Text>
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
        Open a person to assign roles or make them Admin.
      </Text>
      {can("members.approve") ? (
        <Button variant="outline" onPress={() => push("/(ganesh)/join-requests" as never)}>
          Join requests
        </Button>
      ) : null}
      {active.length === 0 ? (
        <EmptyState title="No members yet" description="Approve a join request to add the first person." />
      ) : (
        active.map((member) => (
          <Pressable
            key={member.id}
            onPress={() => push(`/(ganesh)/member/${member.userId}` as never)}
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: 16,
              padding: 14,
              gap: 4,
              borderWidth: 1,
              borderColor: theme.colors.border,
              minHeight: 64,
            }}
          >
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
              {member.displayName}
            </Text>
            <Text style={{ color: theme.colors.mutedForeground }}>
              {memberRolesLabel(member, roles)} · {ganeshStatusLabel(member.status)}
              {member.createdAt ? ` · Joined ${formatGaneshWhen(member.createdAt)}` : ""}
            </Text>
          </Pressable>
        ))
      )}
      {canReadAudit ? (
        <>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Member changes</Text>
          {audits.length === 0 ? (
            <Text style={{ color: theme.colors.mutedForeground }}>No membership changes yet.</Text>
          ) : (
            audits.map((audit) => (
              <View key={audit.id} style={{ gap: 2 }}>
                <Text style={{ color: theme.colors.foreground }}>{auditLine(audit, members)}</Text>
                {audit.at ? (
                  <Text style={{ color: theme.colors.mutedForeground }}>{formatGaneshWhen(audit.at)}</Text>
                ) : null}
              </View>
            ))
          )}
        </>
      ) : null}
    </GaneshScreen>
  );
}
