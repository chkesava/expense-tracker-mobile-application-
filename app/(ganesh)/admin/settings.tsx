import { useState } from "react";
import { Text, View } from "react-native";

import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandals } from "@/hooks/usePandals";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { formatGaneshWhen, formatPandalCode } from "@/shared/utils/ganeshIdentity";
import { ganeshRoleLabel } from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

export default function AdminPandalSettingsScreen() {
  const { theme } = useTheme();
  const { pandalId } = useGaneshSession();
  const { pandals, loading, error } = usePandals();
  const { members } = usePandalMembers(pandalId);
  const writes = useGaneshWrites();
  const pandal = pandals.find((item) => item.id === pandalId);
  const admins = members.filter((member) => member.role === "admin" && member.status === "active");
  const [_name, setName] = useState<string | undefined>(undefined);
  const [_area, setArea] = useState<string | undefined>(undefined);
  const [_description, setDescription] = useState<string | undefined>(undefined);
  const [_contactPhone, setContactPhone] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const joinMode = pandal?.joinMode ?? "approval";
  const name = _name ?? pandal?.name ?? "";
  const area = _area ?? pandal?.area ?? "";
  const description = _description ?? pandal?.description ?? "";
  const contactPhone = _contactPhone ?? pandal?.contactPhone ?? "";

  return (
    <GaneshScreen>
      <AdminQueryState
        loading={loading && !pandal}
        error={error}
        empty={
          !pandal
            ? { title: "Pandal not found", description: "Switch Pandal from the Pandal tab." }
            : null
        }
      >
        {pandal ? (
          <>
            <Text style={{ color: theme.colors.mutedForeground }}>
              Code {formatPandalCode(pandal.code)}
              {pandal.createdAt ? ` · Created ${formatGaneshWhen(pandal.createdAt)}` : ""}
            </Text>
            {admins.length > 0 ? (
              <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
                Current admin{admins.length === 1 ? "" : "s"}:{" "}
                {admins.map((admin) => `${admin.displayName} (${ganeshRoleLabel(admin.role)})`).join(", ")}
              </Text>
            ) : null}
            <Input label="Pandal name" value={name} onChangeText={setName} />
            <Input label="Area" value={area} onChangeText={setArea} />
            <Input label="Description" value={description} onChangeText={setDescription} />
            <Input
              label="Contact number"
              value={contactPhone}
              onChangeText={setContactPhone}
              keyboardType="phone-pad"
            />
            <Button
              loading={busy}
              onPress={() => {
                setBusy(true);
                writes
                  .updatePandalProfile({ name, area, description, contactPhone })
                  .catch((caught) => {
                    logError("ganesh.admin.settings", caught);
                    toast.error(friendlyErrorMessage(caught, "Could not save Pandal settings."));
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Save Pandal
            </Button>
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
              Membership approval
            </Text>
            <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
              Approval means you accept each request. Open lets people join as members with the
              code.
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button
                variant={joinMode === "approval" ? "primary" : "outline"}
                onPress={() => void writes.updatePandalJoinMode("approval")}
              >
                Approval
              </Button>
              <Button
                variant={joinMode === "open" ? "primary" : "outline"}
                onPress={() => void writes.updatePandalJoinMode("open")}
              >
                Open
              </Button>
            </View>
            <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
              Contribution targets, festival defaults, and expense categories are on their own
              Admin screens.
            </Text>
          </>
        ) : null}
      </AdminQueryState>
    </GaneshScreen>
  );
}
