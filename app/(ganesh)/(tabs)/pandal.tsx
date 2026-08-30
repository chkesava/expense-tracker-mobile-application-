import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { AdminGlyph } from "@/components/ganesh/admin/adminArt";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import { PandalAccountBar } from "@/components/ganesh/pandal/PandalAccountBar";
import { PandalIdentityCard } from "@/components/ganesh/pandal/PandalIdentityCard";
import { PandalSectionCard } from "@/components/ganesh/pandal/PandalSectionCard";
import { PandalTabHero } from "@/components/ganesh/pandal/PandalTabHero";
import { MetaLabel, NavRow, SectionPair, useGaneshTokens } from "@/components/ganesh/ui";
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
import { formatInr } from "@/shared/utils/ganeshMoney";
import { ganeshRoleLabel } from "@/shared/utils/ganeshPermissions";

const ROLE_ORDER: Record<string, number> = {
  admin: 0,
  treasurer: 1,
  member: 2,
  collector: 3,
  viewer: 4,
};

/**
 * Pandal identity and administration. Money lives on Funds; people live on
 * People. This tab answers who we are, what we own, and who can change it.
 */
export default function PandalScreen() {
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
  const showProperty = can("assets.read") || can("sponsors.read") || can("permanentFund.read");
  const assetMeta = "Chairs, speakers, and other items that stay with the Pandal";

  const peopleCard = (
    <PandalSectionCard
      title="People"
      subtitle={
        committee.length === 1 ? "1 on the committee" : `${committee.length} on the committee`
      }
    >
      <NavRow
        title="Committee tracker"
        meta="Who paid their share, who still owes"
        icon={<AdminGlyph name="iconCommittee" />}
        chevronColor={g.saffron}
        divider={can("members.read")}
        onPress={() => push("/(ganesh)/committee" as never)}
      />
      {can("members.read") ? (
        <NavRow
          title="Members and roles"
          meta="Who holds which role in the Pandal"
          icon={<AdminGlyph name="iconMembers" />}
          chevronColor={g.saffron}
          onPress={() => push("/(ganesh)/members" as never)}
        />
      ) : null}
    </PandalSectionCard>
  );

  const adminCard = isAdmin ? (
    <PandalSectionCard title="Administration">
      <NavRow
        title="Admin dashboard"
        meta="Members, festival, funds, and Pandal settings"
        icon={<AdminGlyph name="shield" size={36} />}
        chevronColor={g.saffron}
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
    </PandalSectionCard>
  ) : null;

  return (
    <GaneshScreen withTabBar contentContainerStyle={styles.bleed}>
      <PandalTabHero festivalName={festival?.name} rightAccessory={<GaneshSyncChip onDark />} />

      <View style={styles.body}>
        <PandalIdentityCard
          pandalName={pandal?.name}
          code={pandal?.code ? formatPandalCode(pandal.code) : undefined}
          festivalName={festival?.name}
          festival={festival}
          committeeSize={committee.length}
          roleLabel={role ? ganeshRoleLabel(role) : undefined}
        />

        {showProperty ? (
          <PandalSectionCard title="Pandal Property" subtitle="Manage Pandal resources">
            {can("assets.read") ? (
              <NavRow
                title="Assets"
                meta={assetMeta}
                icon={<AdminGlyph name="iconAssets" />}
                chevronColor={g.saffron}
                divider={can("sponsors.read") || can("permanentFund.read")}
                onPress={() => push("/(ganesh)/assets" as never)}
              />
            ) : null}
            {can("sponsors.read") ? (
              <NavRow
                title="Sponsors"
                meta="Who is supporting this festival. Promised deals are not cash."
                icon={<AdminGlyph name="iconSponsors" />}
                chevronColor={g.saffron}
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
                icon={<AdminGlyph name="iconFund" />}
                chevronColor={g.saffron}
                onPress={() => push("/(ganesh)/permanent-fund" as never)}
              />
            ) : null}
          </PandalSectionCard>
        ) : null}

        {adminCard ? <SectionPair>{peopleCard}{adminCard}</SectionPair> : peopleCard}

        {showTreasurerTools ? (
          <PandalSectionCard title="Treasurer">
            <View style={styles.form}>
              <MetaLabel>
                Set this festival's contribution targets. A Pandal Admin handles roles and the Permanent Fund.
              </MetaLabel>
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
                  icon={<AdminGlyph name="iconFestival" />}
                  chevronColor={g.saffron}
                  onPress={() => push("/(ganesh)/close-festival" as never)}
                />
              ) : null}
            </View>
          </PandalSectionCard>
        ) : null}

        <PandalSectionCard title="This Festival">
          <NavRow
            title="Festival report"
            meta="Full money summary for this Ganesh Utsav"
            icon={<AdminGlyph name="iconReports" />}
            chevronColor={g.saffron}
            divider
            onPress={() => push("/(ganesh)/report" as never)}
          />
          <NavRow
            title="Switch Pandal or festival"
            meta={festival?.name}
            icon={<AdminGlyph name="iconFestival" />}
            chevronColor={g.saffron}
            onPress={() => push("/(ganesh)/setup" as never)}
          />
        </PandalSectionCard>

        <PandalAccountBar
          onSwitchApp={() => {
            void setActiveWorkspace("expense");
          }}
          onLogout={() => {
            void logout();
          }}
        />
      </View>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  bleed: {
    paddingHorizontal: 0,
    paddingTop: 0,
    gap: 0,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 0,
    marginTop: 8,
    gap: 12,
  },
  form: {
    gap: 12,
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
});
