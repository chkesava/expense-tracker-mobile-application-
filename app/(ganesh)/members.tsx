import { Text, View } from "react-native";

import { RoleChips } from "@/components/ganesh/RoleChips";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useMemberAudits } from "@/hooks/useMemberAudits";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePandals } from "@/hooks/usePandals";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { GaneshRole, PandalMember, PandalMemberAudit } from "@/shared/types/ganesh";
import { formatGaneshWhen, memberDisplayName } from "@/shared/utils/ganeshIdentity";
import {
  ASSIGNABLE_ROLES,
  ganeshRoleLabel,
  ganeshStatusLabel,
} from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

function auditLine(audit: PandalMemberAudit, members: PandalMember[]): string {
  const actor = memberDisplayName(members, audit.actorId);
  const target = memberDisplayName(members, audit.targetUserId);
  if (audit.action === "approved") {
    return `${actor} approved ${target} as ${ganeshRoleLabel(audit.newRole).toUpperCase()}`;
  }
  if (audit.action === "suspended") {
    return `${actor} suspended ${target}`;
  }
  if (audit.action === "removed") {
    return `${actor} removed ${target}`;
  }
  if (audit.action === "join_mode") {
    return `${actor} set join mode to ${audit.reason ?? "approval"}`;
  }
  if (audit.oldRole && audit.newRole && audit.oldRole !== audit.newRole) {
    return `${actor} changed ${target} ${audit.oldRole.toUpperCase()} → ${audit.newRole.toUpperCase()}`;
  }
  return `${actor} updated ${target}`;
}

export default function GaneshMembersScreen() {
  const { theme } = useTheme();
  const { pandalId } = useGaneshSession();
  const { pandals } = usePandals();
  const { members } = usePandalMembers(pandalId);
  const { audits } = useMemberAudits(pandalId);
  const { can } = useGaneshPermissions();
  const writes = useGaneshWrites();
  const pandal = pandals.find((item) => item.id === pandalId);
  const adminCount =
    pandal?.adminCount ??
    members.filter((member) => member.role === "admin" && member.status === "active").length;
  const canManage = can("members.assignRole");

  const change = (
    member: PandalMember,
    input: { role?: GaneshRole; status?: PandalMember["status"] }
  ) => {
    const nextRole = input.role ?? member.role;
    const nextStatus = input.status ?? member.status;
    const wasAdmin = member.role === "admin" && member.status === "active";
    const willBeAdmin = nextRole === "admin" && nextStatus === "active";
    if (wasAdmin && !willBeAdmin && adminCount <= 1) {
      toast.error("Assign another Pandal Admin before changing this user.");
      return;
    }
    void writes.updatePandalMember(member.userId, input).catch((error) => {
      logError("ganesh.members.update", error);
      toast.error(friendlyErrorMessage(error, "Could not update this member."));
    });
  };

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
        Committee
      </Text>
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
        Everyone in this Pandal. Roles stay with the Pandal. Leaving never rewrites historical
        entered-by names.
      </Text>
      {members.length === 0 ? (
        <EmptyState title="No members yet" description="Approve a join request to add the first person." />
      ) : (
        members.map((member) => {
          const lastAdmin = member.role === "admin" && member.status === "active" && adminCount <= 1;
          return (
            <View
              key={member.id}
              style={{
                backgroundColor: theme.colors.card,
                borderRadius: 16,
                padding: 14,
                gap: 10,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
                {member.displayName}
              </Text>
              <Text style={{ color: theme.colors.mutedForeground }}>
                {ganeshRoleLabel(member.role)} · {ganeshStatusLabel(member.status)}
              </Text>
              {canManage && member.status !== "removed" ? (
                <View style={{ gap: 10 }}>
                  <RoleChips
                    value={member.role}
                    options={ASSIGNABLE_ROLES}
                    onChange={(role) => change(member, { role })}
                  />
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    {member.status === "active" ? (
                      <Button
                        variant="outline"
                        style={{ flex: 1 }}
                        disabled={lastAdmin}
                        onPress={() => change(member, { status: "suspended" })}
                      >
                        Suspend
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        style={{ flex: 1 }}
                        onPress={() => change(member, { status: "active" })}
                      >
                        Restore
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      style={{ flex: 1 }}
                      disabled={lastAdmin}
                      onPress={() => change(member, { status: "removed" })}
                    >
                      Remove
                    </Button>
                  </View>
                  {lastAdmin ? (
                    <Text style={{ color: theme.colors.mutedForeground }}>
                      This is the only Pandal Admin.
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })
      )}
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
    </GaneshScreen>
  );
}
