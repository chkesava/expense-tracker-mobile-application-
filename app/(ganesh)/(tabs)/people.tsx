import { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AdminGlyph } from "@/components/ganesh/admin/adminArt";
import { CollectionIcon } from "@/components/ganesh/art/icons";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import { CommitteeOverview } from "@/components/ganesh/people/CommitteeOverview";
import { ManageSection } from "@/components/ganesh/people/ManageSection";
import { PandalInfoNotice } from "@/components/ganesh/people/PandalInfoNotice";
import { PeopleHero } from "@/components/ganesh/people/PeopleHero";
import { NavRow, useGaneshTokens } from "@/components/ganesh/ui";
import { useFestivals } from "@/hooks/useFestivals";
import { useFestivalMembers } from "@/hooks/useFestivalMembers";
import { useFestivalSeva } from "@/hooks/useFestivalSeva";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useHouseholds } from "@/hooks/useHouseholds";
import { useJoinRequests } from "@/hooks/useJoinRequests";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import { todaySeva } from "@/shared/utils/ganeshSeva";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * The people who run the Pandal.
 *
 * Committee, volunteers on duty today, households and join requests in one
 * place. Previously "Committee" was a hidden tab reachable only through the
 * Pandal menu, which buried the half of the product that is not money.
 */
export default function PeopleScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const { members, loading: membersLoading } = usePandalMembers(pandalId);
  const { members: festivalMembers } = useFestivalMembers(pandalId, festivalId);
  const { households } = useHouseholds(pandalId, festivalId);
  const { requests } = useJoinRequests(pandalId);
  const { seva } = useFestivalSeva(pandalId, festivalId);
  const { can, isAdmin } = useGaneshPermissions();

  const handleRefresh = useCallback(() => {
    // Live listeners already hold the truth.
  }, []);

  const festival = festivals.find((item) => item.id === festivalId);
  const today = todayDateInput();

  const active = useMemo(
    () => members.filter((m) => m.status === "active" || m.status == null),
    [members]
  );

  /** How many volunteer slots today's programme has filled. */
  const onDutyToday = useMemo(
    () => todaySeva(seva, today).reduce((sum, item) => sum + (item.dutyCount ?? 0), 0),
    [seva, today]
  );

  const paidCount = festivalMembers.filter((m) => m.contributionPaid > 0).length;
  const canOpenMember = can("members.read");
  const showJoinRequests = isAdmin && requests.length > 0;
  const showMembers = can("members.read");
  const showHouseholds = can("collections.read");

  return (
    <GaneshScreen
      withTabBar
      onRefresh={handleRefresh}
      contentContainerStyle={styles.bleed}
    >
      <PeopleHero festivalName={festival?.name} rightAccessory={<GaneshSyncChip onDark />} />

      <View style={styles.body}>
        <CommitteeOverview
          memberCount={active.length}
          paidCount={paidCount}
          festivalMemberCount={festivalMembers.length}
          onDutyToday={onDutyToday}
          members={active}
          loading={membersLoading}
          onMemberPress={
            canOpenMember ? (userId) => push(`/(ganesh)/member/${userId}` as never) : undefined
          }
        />

        <ManageSection>
          {showJoinRequests ? (
            <NavRow
              title="Join requests"
              meta="People asking to join this Pandal"
              icon={<AdminGlyph name="iconJoin" />}
              chevronColor={g.saffron}
              badge={{
                kind: "overdue",
                label: `${requests.length} waiting`,
              }}
              divider
              onPress={() => push("/(ganesh)/join-requests" as never)}
            />
          ) : null}

          <NavRow
            title="Committee tracker"
            meta="Who has paid their share, who still owes"
            icon={<AdminGlyph name="iconCommittee" />}
            chevronColor={g.saffron}
            divider={showMembers || showHouseholds}
            onPress={() => push("/(ganesh)/(tabs)/committee" as never)}
          />

          {showMembers ? (
            <NavRow
              title="Members and roles"
              meta="Who holds which role in the Pandal"
              icon={<AdminGlyph name="iconMembers" />}
              chevronColor={g.saffron}
              divider={showHouseholds}
              onPress={() => push("/(ganesh)/members" as never)}
            />
          ) : null}

          {showHouseholds ? (
            <NavRow
              title="Households"
              meta="Door-to-door chanda rounds"
              icon={<CollectionIcon size={36} framed={false} />}
              chevronColor={g.saffron}
              value={
                households.length > 0 ? (
                  <Text
                    style={[
                      styles.householdCount,
                      { color: g.godFund, fontFamily: theme.fontFamily.semibold },
                    ]}
                  >
                    {households.length}
                  </Text>
                ) : undefined
              }
              onPress={() => push("/(ganesh)/(tabs)/collections" as never)}
            />
          ) : null}
        </ManageSection>

        <PandalInfoNotice festivalName={festival?.name} />
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
    marginTop: -6,
    gap: 12,
  },
  householdCount: {
    fontSize: 15,
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"],
  },
});
