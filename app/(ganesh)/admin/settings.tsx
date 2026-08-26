import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Settings } from "lucide-react-native";

import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  Avatar,
  FilterChips,
  GaneshHeader,
  MetaLabel,
  Section,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandals } from "@/hooks/usePandals";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { formatGaneshWhen, formatPandalCode } from "@/shared/utils/ganeshIdentity";
import { useTheme } from "@/theme/ThemeProvider";

const JOIN_OPTIONS = [
  { id: "approval" as const, label: "Approval needed" },
  { id: "open" as const, label: "Open with code" },
];

export default function AdminPandalSettingsScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { pandalId } = useGaneshSession();
  const { pandals, loading, error } = usePandals();
  const { members } = usePandalMembers(pandalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();

  const canUpdate = can("settings.update");
  const pandal = pandals.find((item) => item.id === pandalId);
  const admins = members.filter(
    (member) => member.role === "admin" && member.status === "active"
  );

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
    <GaneshScreen safeTop>
      <GaneshHeader
        title="Pandal settings"
        subtitle={pandal?.code ? `Code ${formatPandalCode(pandal.code)}` : undefined}
        icon={<Settings size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />

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
            <Section title="Profile">
              <View style={styles.form}>
                <Input
                  label="Pandal name"
                  value={name}
                  onChangeText={setName}
                  editable={canUpdate}
                />
                <Input label="Area" value={area} onChangeText={setArea} editable={canUpdate} />
                <Input
                  label="Description"
                  value={description}
                  onChangeText={setDescription}
                  editable={canUpdate}
                />
                <Input
                  label="Contact number"
                  value={contactPhone}
                  onChangeText={setContactPhone}
                  keyboardType="phone-pad"
                  editable={canUpdate}
                />
                <Button
                  loading={busy}
                  disabled={!canUpdate}
                  onPress={() => {
                    setBusy(true);
                    writes
                      .updatePandalProfile({ name, area, description, contactPhone })
                      .catch((caught) => {
                        logError("ganesh.admin.settings", caught);
                        toast.error(
                          friendlyErrorMessage(caught, "Could not save Pandal settings.")
                        );
                      })
                      .finally(() => setBusy(false));
                  }}
                >
                  Save Pandal
                </Button>
              </View>
            </Section>

            <Section
              title="Who can join"
              subtitle="Approval means you accept each request. Open lets anyone with the code join as a member."
            >
              <FilterChips
                value={joinMode}
                options={JOIN_OPTIONS}
                disabled={!canUpdate}
                onChange={(next) => void writes.updatePandalJoinMode(next)}
              />
            </Section>

            {admins.length > 0 ? (
              <Section
                title="Pandal admins"
                subtitle={`${admins.length} ${admins.length === 1 ? "person" : "people"} with full control`}
              >
                <View style={styles.adminList}>
                  {admins.map((admin) => (
                    <View key={admin.userId} style={styles.adminRow}>
                      <Avatar name={admin.displayName} seed={admin.userId} size={36} />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.adminName,
                          {
                            color: theme.colors.foreground,
                            fontFamily: theme.fontFamily.medium,
                          },
                        ]}
                      >
                        {admin.displayName}
                      </Text>
                    </View>
                  ))}
                </View>
              </Section>
            ) : null}

            <Section title="About this Pandal" plain>
              <MetaLabel>
                Code {formatPandalCode(pandal.code)}
                {pandal.createdAt ? ` · Created ${formatGaneshWhen(pandal.createdAt)}` : ""}
              </MetaLabel>
            </Section>

            <StatusStrip
              tone="muted"
              message="Contribution targets, festival defaults, and expense categories each have their own Admin screen."
            />
          </>
        ) : null}
      </AdminQueryState>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 12,
  },
  adminList: {
    gap: 10,
  },
  adminRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  adminName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
  },
});
