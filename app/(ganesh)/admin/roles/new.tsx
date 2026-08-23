import { useState } from "react";
import { Alert, Text } from "react-native";
import { useRouter } from "expo-router";

import { PermissionChecklist } from "@/components/ganesh/PermissionChecklist";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { CRITICAL_PERMISSIONS, groupedPermissionPreview } from "@/shared/utils/ganeshPermissionRegistry";
import type { GaneshPermission } from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

export default function AdminCreateRoleScreen() {
  const { theme } = useTheme();
  const { replace } = useRouter();
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

  return (
    <GaneshScreen>
      <Input label="Role name" value={name} onChangeText={setName} placeholder="Treasurer" />
      <Input
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Manages festival financial operations"
      />
      {preview.length > 0 ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          {permissions.length} permissions · {preview.join(", ")}
        </Text>
      ) : (
        <Text style={{ color: theme.colors.mutedForeground }}>Choose what this role can do.</Text>
      )}
      <PermissionChecklist selected={permissions} onChange={setPermissions} />
      <Button
        loading={busy}
        onPress={() => {
          const critical = permissions.filter((item) => CRITICAL_PERMISSIONS.includes(item));
          const save = () => {
            setBusy(true);
            writes
              .createPandalRole({ name, description, permissions })
              .then((id) => replace(`/(ganesh)/admin/roles/${id}` as never))
              .catch((caught) => {
                logError("ganesh.roles.create", caught);
                toast.error(friendlyErrorMessage(caught, "Could not create the role."));
              })
              .finally(() => setBusy(false));
          };
          if (critical.length > 0) {
            Alert.alert(
              "Sensitive permissions",
              "This role can change money or people. Continue?",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Create role", onPress: save },
              ]
            );
            return;
          }
          save();
        }}
      >
        Create role
      </Button>
    </GaneshScreen>
  );
}
