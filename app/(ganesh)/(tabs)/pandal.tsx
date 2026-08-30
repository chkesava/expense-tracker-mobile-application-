import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Building2,
  ClipboardList,
  FileBarChart,
  Landmark,
  LogOut,
  Package,
  Repeat,
  ShieldCheck,
  Users,
} from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { GaneshAppVersion } from "@/components/ganesh/GaneshAppVersion";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import {
  GaneshHeader,
  MetaLabel,
  NavRow,
  PandalIdentity,
  Section,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useJoinRequests } from "@/hooks/useJoinRequests";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePandals } from "@/hooks/usePandals";
import { usePermanentFund } from "@/hooks/usePermanentFund";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { formatPandalCode } from "@/shared/utils/ganeshIdentity";
import { ganeshRoleLabel } from "@/shared/utils/ganeshPermissions";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

const ROLE_ORDER: Record<string, number> = {
  admin: 0,
  treasurer: 1,
  member: 2,
  collector: 3,
  viewer: 4,
};

export default function PandalScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push } = useRouter();
  const { logout } = useAuth();
  const { setActiveWorkspace } = useWorkspace();
  const { pandalId, festivalId } = useGaneshSession();
  const { pandals } = usePandals();
  const { festivals } = useFestivals(pandalId);
  const { members: pandalMembers } = usePandalMembers(pandalId);
  const { requests } = useJoinRequests(pandalId);
  const { fund } = usePermanentFund(pandalId);
  const { can, isAdmin, role } = useGaneshPermissions();
  const writes = useGaneshWrites();

  const pandal = pandals.find((item) => item.id === pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const [memberTarget, setMemberTarget] = useState(
    String(festival?.contributionTargetAmount ?? 0)
  );
  const [houseTarget, setHouseTarget] = useState(String(festival?.householdTargetAmount ?? 0));

  const committee = pandalMembers
    .filter((member) => member.status === "active" || member.status == null)
    .slice()
    .sort((a, b) => {
      const roleDiff = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
      if (roleDiff !== 0) return roleDiff;
      return a.displayName.localeCompare(b.displayName);
    });

  const showTreasurerTools = !isAdmin && can("festival.update");
  const glyph = (Icon: typeof Users, tint?: string) => (
    <Icon size={17} color={tint ?? theme.colors.mutedForeground} strokeWidth={2.2} />
  );

  const assetMeta = "Chairs, speakers, and other items that stay with the Pandal";

  return (
    <GaneshScreen safeTop withTabBar>
      <GaneshHeader
        title="Pandal"
        subtitle={festival?.name}
        icon={<Landmark size={22} color={g.saffron} strokeWidth={2.2} />}
        rightElement={<GaneshSyncChip />}
      />

      <PandalIdentity
        pandalName={pandal?.name}
        code={pandal?.code ? formatPandalCode(pandal.code) : undefined}
        festivalName={festival?.name}
        festival={festival}
        committeeSize={committee.length}
        roleLabel={role ? ganeshRoleLabel(role) : undefined}
      />

      {can("assets.read") || can("sponsors.read") || can("permanentFund.read") ? (
        <Section title="Pandal property">
          {can("assets.read") ? (
            <NavRow
              title="Assets"
              meta={assetMeta}
              icon={glyph(Package)}
              divider={can("sponsors.read") || can("permanentFund.read")}
              onPress={() => push("/(ganesh)/assets" as never)}
            />
          ) : null}
          {can("sponsors.read") ? (
            <NavRow
              title="Sponsors"
              meta="Who is supporting this festival. Promised deals are not cash."
              icon={glyph(Building2)}
              divider={can("permanentFund.read")}
              onPress={() => push("/(ganesh)/sponsors" as never)}
            />
          ) : null}
          {can("permanentFund.read") ? (
            <NavRow
              title="Permanent Fund"
              meta={
                fund.total > 0
                  ? `${formatInr(fund.total)} · standing corpus, kept between festivals`
                  : "The Pandal's standing corpus, kept between festivals"
              }
              icon={glyph(Landmark, g.maroon)}
              iconTint={g.wash(g.maroon)}
              onPress={() => push("/(ganesh)/permanent-fund" as never)}
            />
          ) : null}
        </Section>
      ) : null}

      <Section title="People" subtitle={`${committee.length} on the committee`}>
        <NavRow
          title="Committee tracker"
          meta="Who paid their share, who still owes"
          icon={glyph(ClipboardList)}
          divider={can("members.read")}
          onPress={() => push("/(ganesh)/committee" as never)}
        />
        {can("members.read") ? (
          <NavRow
            title="Members and roles"
            meta="Who holds which role in the Pandal"
            icon={glyph(Users)}
            onPress={() => push("/(ganesh)/members" as never)}
          />
        ) : null}
      </Section>

      {isAdmin ? (
        <Section title="Administration">
          <NavRow
            title="Admin dashboard"
            meta="Members, festival, funds, and Pandal settings"
            icon={glyph(ShieldCheck, g.saffron)}
            iconTint={g.wash(g.saffron)}
            badge={
              requests.length > 0
                ? {
                    kind: "overdue",
                    label: `${requests.length} request${requests.length === 1 ? "" : "s"}`,
                  }
                : undefined
            }
            onPress={() => push("/(ganesh)/admin" as never)}
          />
        </Section>
      ) : null}

      {showTreasurerTools ? (
        <Section
          title="Treasurer"
          subtitle="Set this festival's contribution targets. A Pandal Admin handles roles and the Permanent Fund."
        >
          <View style={styles.form}>
            <Input
              label="Member contribution target"
              value={memberTarget}
              onChangeText={setMemberTarget}
              keyboardType="numeric"
            />
            <Input
              label="Household chanda target"
              value={houseTarget}
              onChangeText={setHouseTarget}
              keyboardType="numeric"
            />
            <Button
              variant="outline"
              onPress={() =>
                void writes.updateFestivalTargets({
                  contributionMode: "same",
                  contributionTargetAmount: Number(memberTarget),
                  householdTargetAmount: Number(houseTarget),
                })
              }
            >
              Save targets
            </Button>
            {can("festival.close") && festival?.status === "open" ? (
              <NavRow
                title="Close festival"
                meta="Lock the ledger and settle up"
                icon={glyph(Repeat)}
                onPress={() => push("/(ganesh)/close-festival" as never)}
              />
            ) : null}
          </View>
        </Section>
      ) : null}

      <Section title="This festival">
        <NavRow
          title="Festival report"
          meta="Full money summary for this Ganesh Utsav"
          icon={glyph(FileBarChart)}
          divider
          onPress={() => push("/(ganesh)/report" as never)}
        />
        <NavRow
          title="Switch Pandal or festival"
          meta={festival?.name}
          icon={glyph(Repeat)}
          onPress={() => push("/(ganesh)/setup" as never)}
        />
      </Section>

      <Section title="Account" plain>
        <View style={styles.accountRow}>
          <Button
            variant="outline"
            style={styles.accountButton}
            onPress={() => {
              void setActiveWorkspace("expense");
            }}
          >
            Switch app
          </Button>
          <Button variant="ghost" style={styles.accountButton} onPress={() => void logout()}>
            <View style={styles.logoutInner}>
              <LogOut size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />
              <Text
                style={[
                  styles.logoutLabel,
                  { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold },
                ]}
              >
                Log out
              </Text>
            </View>
          </Button>
        </View>
        <MetaLabel>
          Switching apps keeps you signed in. Ganesh Seva and Expense Tracker never share data.
        </MetaLabel>
        <GaneshAppVersion />
      </Section>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 12,
  },
  accountRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  accountButton: {
    flex: 1,
  },
  logoutInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  logoutLabel: {
    fontSize: 14,
    letterSpacing: 0.2,
  },
});
