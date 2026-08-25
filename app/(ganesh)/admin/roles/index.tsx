import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Plus, ShieldCheck } from "lucide-react-native";

import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  GaneshHeader,
  NavRow,
  Section,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePandalRoles } from "@/hooks/usePandalRoles";
import { logError } from "@/lib/errors";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function AdminRolesScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push, back } = useRouter();
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

  const builtin = useMemo(() => roles.filter((role) => role.type === "builtin"), [roles]);
  const custom = useMemo(() => roles.filter((role) => role.type !== "builtin"), [roles]);

  const roleMeta = (permissionCount: number, people: number) =>
    `${permissionCount} permission${permissionCount === 1 ? "" : "s"} · ${people} ${
      people === 1 ? "person" : "people"
    }`;

  return (
    <GaneshScreen safeTop>
      <GaneshHeader
        title="Roles"
        subtitle={`${roles.length} role${roles.length === 1 ? "" : "s"}`}
        icon={<ShieldCheck size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />

      <StatusStrip
        tone="info"
        message="Built-in roles keep the Pandal working. Custom roles are for this committee only."
      />

      {can("roles.create") ? (
        <Button onPress={() => push("/(ganesh)/admin/roles/new" as never)}>
          <View style={styles.ctaInner}>
            <Plus size={17} color={theme.colors.primaryForeground} strokeWidth={2.6} />
            <Text
              style={[
                styles.ctaLabel,
                { color: theme.colors.primaryForeground, fontFamily: theme.fontFamily.semibold },
              ]}
            >
              Create role
            </Text>
          </View>
        </Button>
      ) : null}

      <AdminQueryState
        loading={loading && roles.length === 0}
        error={error}
        onRetry={retry}
        empty={
          roles.length === 0
            ? {
                title: "No roles yet",
                description: "Create Treasurer, Collector, or a role of your own.",
              }
            : null
        }
      >
        {builtin.length > 0 ? (
          <Section title="Built-in" subtitle="Always available, editable but not deletable">
            {builtin.map((role, index) => (
              <NavRow
                key={role.id}
                title={role.name}
                meta={roleMeta(role.permissions.length, assignedCount(role.id))}
                divider={index < builtin.length - 1}
                onPress={() => push(`/(ganesh)/admin/roles/${role.id}` as never)}
              />
            ))}
          </Section>
        ) : null}

        {custom.length > 0 ? (
          <Section title="Custom" subtitle="Created by this committee">
            {custom.map((role, index) => (
              <NavRow
                key={role.id}
                title={role.name}
                meta={roleMeta(role.permissions.length, assignedCount(role.id))}
                divider={index < custom.length - 1}
                onPress={() => push(`/(ganesh)/admin/roles/${role.id}` as never)}
              />
            ))}
          </Section>
        ) : null}
      </AdminQueryState>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  ctaInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  ctaLabel: {
    fontSize: 14,
    letterSpacing: 0.2,
  },
});
