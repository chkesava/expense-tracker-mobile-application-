import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AdminGlyph } from "@/components/ganesh/admin/adminArt";
import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { FestivalStackHero } from "@/components/ganesh/chrome/FestivalStackHero";
import { ganeshStackLayout } from "@/components/ganesh/chrome/stackLayout";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { PermissionChecklist, PermissionSummary } from "@/components/ganesh/PermissionChecklist";
import {
  Avatar,
  GaneshEmptyState,
  LedgerRow,
  Section,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
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

export default function AdminRoleDetailScreen() {
  const g = useGaneshTokens();
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

  const resetDraft = () => {
    setName(undefined);
    setDescription(undefined);
    setPermissions(undefined);
  };

  const saveRole = () => {
    if (!role) return;
    setBusy(true);
    writes
      .updatePandalRole(role.id, { name, description, permissions })
      .then(() => {
        setEditing(false);
        resetDraft();
      })
      .catch((caught) => {
        logError("ganesh.roles.update", caught);
        toast.error(friendlyErrorMessage(caught, "Could not save the role."));
      })
      .finally(() => setBusy(false));
  };

  const onSave = () => {
    if (!role) return;
    const addedCritical = permissions.filter(
      (item) => CRITICAL_PERMISSIONS.includes(item) && !role.permissions.includes(item)
    );
    if (addedCritical.length > 0) {
      Alert.alert(
        "Sensitive permissions",
        "This change can let people move money or manage the committee.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Save", onPress: saveRole },
        ]
      );
      return;
    }
    saveRole();
  };

  const onDelete = () => {
    if (!role) return;
    if (assigned.length > 0) {
      Alert.alert(
        "Role is in use",
        `This role is assigned to ${assigned.length} ${
          assigned.length === 1 ? "person" : "people"
        }. Remove those assignments first.`
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
  };

  return (
    <GaneshScreen contentContainerStyle={ganeshStackLayout.bleed}>
      <FestivalStackHero
        title={role?.name || "Role"}
        subtitle={
          role
            ? `${role.type === "builtin" ? "Built-in" : "Custom"} · ${
                role.permissions.length
              } permissions · ${assigned.length} ${assigned.length === 1 ? "person" : "people"}`
            : undefined
        }
        onBack={back}
        mark={<AdminGlyph name="iconRoles" size={40} />}
      />
      <View style={ganeshStackLayout.body}>
      <AdminQueryState
        loading={loading && !role}
        error={error}
        onRetry={retry}
        empty={!role ? { title: "Role not found", description: "It may have been deleted." } : null}
      >
        {role ? (
          editing ? (
            <>
              <Section title="Details">
                <View style={styles.form}>
                  <Input label="Role name" value={name} onChangeText={setName} />
                  <Input label="Description" value={description} onChangeText={setDescription} />
                </View>
              </Section>

              <PermissionChecklist selected={permissions} onChange={setPermissions} />

              <View style={styles.form}>
                <Button loading={busy} onPress={onSave}>
                  Save role
                </Button>
                <Button
                  variant="ghost"
                  onPress={() => {
                    setEditing(false);
                    resetDraft();
                  }}
                >
                  Cancel
                </Button>
              </View>
            </>
          ) : (
            <>
              {role.description ? (
                <StatusStrip tone="info" message={role.description} />
              ) : null}

              <PermissionSummary permissions={role.permissions} />

              <Section
                title="Assigned people"
                subtitle={`${assigned.length} ${assigned.length === 1 ? "person" : "people"}`}
              >
                {assigned.length === 0 ? (
                  <GaneshEmptyState
                    compact
                    icon={<AdminGlyph name="iconRoles" size={22} />}
                    title="Nobody has this role yet"
                    description="Open a member to assign it."
                  />
                ) : (
                  <View style={styles.people}>
                    {assigned.map((member) => (
                      <LedgerRow
                        key={member.userId}
                        id={member.userId}
                        icon={<Avatar name={member.displayName} seed={member.userId} size={36} />}
                        iconTint="none"
                        title={member.displayName}
                        meta={member.role === "admin" ? "Pandal Admin" : "Committee"}
                        onPress={(userId) => push(`/(ganesh)/member/${userId}`)}
                      />
                    ))}
                  </View>
                )}
              </Section>

              <View style={styles.form}>
                {can("roles.update") ? (
                  <Button onPress={() => setEditing(true)}>Edit role</Button>
                ) : null}
                {role.type === "custom" ? (
                  can("roles.delete") ? (
                    <Button variant="outline" onPress={onDelete}>
                      Delete role
                    </Button>
                  ) : null
                ) : (
                  <StatusStrip
                    tone="muted"
                    message="Built-in roles can be edited but not deleted."
                  />
                )}
              </View>
            </>
          )
        ) : null}
      </AdminQueryState>
      </View>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 12,
  },
  people: {
    gap: 10,
  },
});
