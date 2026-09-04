import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { AdminGlyph } from "@/components/ganesh/admin/adminArt";
import { FestivalStackHero } from "@/components/ganesh/chrome/FestivalStackHero";
import { ganeshStackLayout } from "@/components/ganesh/chrome/stackLayout";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { PermissionChecklist } from "@/components/ganesh/PermissionChecklist";
import { Section, StatusStrip } from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import {
  CRITICAL_PERMISSIONS,
  groupedPermissionPreview,
} from "@/shared/utils/ganeshPermissionRegistry";
import type { GaneshPermission } from "@/shared/utils/ganeshPermissions";

export default function AdminCreateRoleScreen() {
  const { replace, back } = useRouter();
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<GaneshPermission[]>([]);
  const [busy, setBusy] = useState(false);

  const preview = groupedPermissionPreview(permissions);

  if (!can("roles.create")) {
    return <GaneshWriteLock message="You do not have permission to create roles." />;
  }

  const onCreate = () => {
    const critical = permissions.filter((item) => CRITICAL_PERMISSIONS.includes(item));
    const save = () => {
      setBusy(true);
      writes
        .createPandalRole({ name, description, permissions })
        .then((id) => replace(`/(ganesh)/admin/roles/${id}`))
        .catch((caught) => {
          logError("ganesh.roles.create", caught);
          toast.error(friendlyErrorMessage(caught, "Could not create the role."));
        })
        .finally(() => setBusy(false));
    };
    if (critical.length > 0) {
      Alert.alert("Sensitive permissions", "This role can change money or people. Continue?", [
        { text: "Cancel", style: "cancel" },
        { text: "Create role", onPress: save },
      ]);
      return;
    }
    save();
  };

  return (
    <GaneshScreen contentContainerStyle={ganeshStackLayout.bleed}>
      <FestivalStackHero
        title="Create role"
        subtitle="For this committee only"
        onBack={back}
        mark={<AdminGlyph name="iconRoles" size={40} />}
      />
      <View style={ganeshStackLayout.body}>
      <Section title="Details">
        <View style={styles.form}>
          <Input
            label="Role name"
            value={name}
            onChangeText={setName}
            placeholder="Treasurer"
            autoCapitalize="words"
          />
          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Manages festival financial operations"
          />
        </View>
      </Section>

      <StatusStrip
        tone={permissions.length > 0 ? "accent" : "muted"}
        message={
          preview.length > 0
            ? `${permissions.length} permission${permissions.length === 1 ? "" : "s"} · ${preview.join(", ")}`
            : "Choose what this role can do."
        }
      />

      <PermissionChecklist selected={permissions} onChange={setPermissions} />

      <Button loading={busy} disabled={!name.trim() || permissions.length === 0} onPress={onCreate}>
        Create role
      </Button>
      </View>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 12,
  },
});
