import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AdminLinkRow } from "@/components/ganesh/AdminLinkRow";
import { PermissionChecklist, PermissionSummary } from "@/components/ganesh/PermissionChecklist";
import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePandalRoles } from "@/hooks/usePandalRoles";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { CRITICAL_PERMISSIONS } from "@/shared/utils/ganeshPermissionRegistry";
import type { GaneshPermission } from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

export default function AdminRoleDetailScreen() {
  const { theme } = useTheme();
  const { push, back } = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pandalId } = useGaneshSession();
  const { roles, loading, error, retry } = usePandalRoles(pandalId);
  const { members } = usePandalMembers(pandalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const role = roles.find((item) => item.id === id);
  const assigned = members.filter((member) => (member.roleIds ?? []).includes(id ?? ""));
  const [editing, setEditing] = useState(false);
  const [_name, setName] = useState<string | undefined>(undefined);
  const [_description, setDescription] = useState<string | undefined>(undefined);
  const [_permissions, setPermissions] = useState<GaneshPermission[] | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const name = _name ?? role?.name ?? "";
  const description = _description ?? role?.description ?? "";
  const permissions = _permissions ?? role?.permissions ?? [];

  return (
    <GaneshScreen>
      <AdminQueryState
        loading={loading && !role}
        error={error}
        onRetry={retry}
        empty={!role ? { title: "Role not found", description: "It may have been deleted." } : null}
      >
        {role ? (
          <>
            <Text style={{ color: theme.colors.mutedForeground }}>
              {role.type === "builtin" ? "Built-in role" : "Custom role"} · {role.permissions.length}{" "}
              permissions · {assigned.length} people
            </Text>
            {editing ? (
              <View style={{ gap: 12 }}>
                <Input label="Role name" value={name} onChangeText={setName} />
                <Input label="Description" value={description} onChangeText={setDescription} />
                <PermissionChecklist selected={permissions} onChange={setPermissions} />
                <Button
                  loading={busy}
                  onPress={() => {
                    const save = () => {
                      setBusy(true);
                      writes
                        .updatePandalRole(role.id, { name, description, permissions })
                        .then(() => {
                          setEditing(false);
                          setName(undefined);
                          setDescription(undefined);
                          setPermissions(undefined);
                        })
                        .catch((caught) => {
                          logError("ganesh.roles.update", caught);
                          toast.error(friendlyErrorMessage(caught, "Could not save the role."));
                        })
                        .finally(() => setBusy(false));
                    };
                    const addedCritical = permissions.filter(
                      (item) =>
                        CRITICAL_PERMISSIONS.includes(item) && !role.permissions.includes(item)
                    );
                    if (addedCritical.length > 0) {
                      Alert.alert(
                        "Sensitive permissions",
                        "This change can let people move money or manage the committee.",
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Save", onPress: save },
                        ]
                      );
                      return;
                    }
                    save();
                  }}
                >
                  Save role
                </Button>
                <Button variant="ghost" onPress={() => setEditing(false)}>
                  Cancel
                </Button>
              </View>
            ) : (
              <>
                {role.description ? (
                  <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
                    {role.description}
                  </Text>
                ) : null}
                <PermissionSummary permissions={role.permissions} />
                <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
                  Assigned people
                </Text>
                {assigned.length === 0 ? (
                  <Text style={{ color: theme.colors.mutedForeground }}>No one has this role yet.</Text>
                ) : (
                  assigned.map((member) => (
                    <AdminLinkRow
                      key={member.userId}
                      title={member.displayName}
                      subtitle={member.role === "admin" ? "Pandal Admin" : "Committee"}
                      onPress={() => push(`/(ganesh)/member/${member.userId}` as never)}
                    />
                  ))
                )}
                {can("roles.update") ? (
                  <Button onPress={() => setEditing(true)}>Edit role</Button>
                ) : null}
                {role.type === "custom" ? (
                  can("roles.delete") ? (
                  <Button
                    variant="outline"
                    onPress={() => {
                      if (assigned.length > 0) {
                        Alert.alert(
                          "Role is in use",
                          `This role is assigned to ${assigned.length} user${assigned.length === 1 ? "" : "s"}. Remove those assignments first.`
                        );
                        return;
                      }
                      Alert.alert("Delete this role?", `${role.name} will be removed.`, [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () => {
                            writes
                              .deletePandalRole(role.id)
                              .then(() => back())
                              .catch((caught) => {
                                logError("ganesh.roles.delete", caught);
                                toast.error(friendlyErrorMessage(caught, "Could not delete the role."));
                              });
                          },
                        },
                      ]);
                    }}
                  >
                    Delete role
                  </Button>
                  ) : null
                ) : (
                  <Text style={{ color: theme.colors.mutedForeground }}>
                    Built-in roles can be edited but not deleted.
                  </Text>
                )}
              </>
            )}
          </>
        ) : null}
      </AdminQueryState>
    </GaneshScreen>
  );
}
