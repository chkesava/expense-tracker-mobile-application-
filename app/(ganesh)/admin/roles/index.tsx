import { useEffect } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AdminLinkRow } from "@/components/ganesh/AdminLinkRow";
import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { Button } from "@/components/ui/Button";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePandalRoles } from "@/hooks/usePandalRoles";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function AdminRolesScreen() {
  const { theme } = useTheme();
  const { push } = useRouter();
  const { pandalId } = useGaneshSession();
  const { roles, loading, error, retry } = usePandalRoles(pandalId);
  const { members } = usePandalMembers(pandalId);
  const writes = useGaneshWrites();
  const { can, isAdmin } = useGaneshPermissions();

  useEffect(() => {
    if (!isAdmin) return;
    void writes.ensurePandalRoles().catch((caught) => {
      logError("ganesh.roles.ensure", caught);
    });
  }, [isAdmin, pandalId]);

  const assignedCount = (roleId: string) =>
    members.filter((member) => (member.roleIds ?? []).includes(roleId)).length;

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
        Built-in roles keep the Pandal working. Custom roles are for this committee only.
      </Text>
      {can("roles.create") ? (
        <Button onPress={() => push("/(ganesh)/admin/roles/new" as never)}>Create role</Button>
      ) : null}
      <AdminQueryState
        loading={loading && roles.length === 0}
        error={error}
        onRetry={retry}
        empty={
          roles.length === 0
            ? { title: "No roles yet", description: "Create Treasurer, Collector, or your own role." }
            : null
        }
      >
        <View style={{ gap: 10 }}>
          {roles.map((role) => (
            <AdminLinkRow
              key={role.id}
              title={role.name}
              subtitle={`${role.type === "builtin" ? "Built-in" : "Custom"} · ${role.permissions.length} permissions · ${assignedCount(role.id)} people`}
              onPress={() => push(`/(ganesh)/admin/roles/${role.id}` as never)}
            />
          ))}
        </View>
      </AdminQueryState>
      {error ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          {friendlyErrorMessage(error, "Could not load roles.")}
        </Text>
      ) : null}
    </GaneshScreen>
  );
}
