import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ClipboardList, Home, UserPlus, Users } from "lucide-react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import {
  Avatar,
  GaneshEmptyState,
  GaneshHeader,
  MetaLabel,
  NavRow,
  Section,
  StatTile,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { SkeletonList } from "@/components/common/Skeleton";
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

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
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

  return (
    <GaneshScreen safeTop withTabBar refreshing={refreshing} onRefresh={handleRefresh}>
      <GaneshHeader
        title="People"
        subtitle={festival?.name}
        icon={<Users size={22} color={g.saffron} strokeWidth={2.2} />}
        rightElement={<GaneshSyncChip />}
      />

      <Section title="Committee" subtitle={`${active.length} active`}>
        <View style={styles.statRow}>
          <StatTile label="Members">
            <Text style={[styles.count, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
              {active.length}
            </Text>
          </StatTile>
          <StatTile label="Contributed">
            <Text style={[styles.count, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
              {paidCount}
              <Text style={{ color: theme.colors.mutedForeground }}> / {festivalMembers.length}</Text>
            </Text>
          </StatTile>
          <StatTile label="On seva today">
            <Text style={[styles.count, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
              {onDutyToday}
            </Text>
          </StatTile>
        </View>

        {membersLoading && active.length === 0 ? (
          <SkeletonList count={3} />
        ) : active.length === 0 ? (
          <GaneshEmptyState
            compact
            icon={<Users size={20} color={g.saffron} strokeWidth={1.9} />}
            title="No committee members yet"
            description="Share your Pandal code so people can join."
          />
        ) : (
          <View style={styles.avatars}>
            {active.slice(0, 8).map((member) => (
              <View key={member.id} style={styles.avatarItem}>
                <Avatar name={member.displayName} size={38} />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.avatarName,
                    { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium },
                  ]}
                >
                  {member.displayName.split(" ")[0]}
                </Text>
              </View>
            ))}
            {active.length > 8 ? (
              <View style={styles.avatarItem}>
                <View style={[styles.more, { backgroundColor: g.wash(g.saffron) }]}>
                  <Text
                    style={[styles.moreText, { color: g.saffron, fontFamily: theme.fontFamily.semibold }]}
                  >
                    +{active.length - 8}
                  </Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.avatarName,
                    { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium },
                  ]}
                >
                  more
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </Section>

      <Section title="Manage">
        {isAdmin && requests.length > 0 ? (
          <NavRow
            title="Join requests"
            meta="People asking to join this Pandal"
            icon={<UserPlus size={17} color={g.saffron} strokeWidth={2.2} />}
            iconTint={g.wash(g.saffron)}
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
          icon={<ClipboardList size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
          divider={can("members.read") || can("collections.read")}
          onPress={() => push("/(ganesh)/(tabs)/committee" as never)}
        />

        {can("members.read") ? (
          <NavRow
            title="Members and roles"
            meta="Who holds which role in the Pandal"
            icon={<Users size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
            divider={can("collections.read")}
            onPress={() => push("/(ganesh)/members" as never)}
          />
        ) : null}

        {can("collections.read") ? (
          <NavRow
            title="Households"
            meta="Door-to-door chanda rounds"
            icon={<Home size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
            value={
              households.length > 0 ? (
                <Text
                  style={[
                    styles.count,
                    { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: 15 },
                  ]}
                >
                  {households.length}
                </Text>
              ) : undefined
            }
            onPress={() => push("/(ganesh)/(tabs)/collections" as never)}
          />
        ) : null}
      </Section>

      <MetaLabel>
        {festival?.name
          ? `Roles apply to the whole Pandal. Contribution targets are set per festival — currently ${festival.name}.`
          : "Roles apply to the whole Pandal."}
      </MetaLabel>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  statRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  count: {
    fontSize: 17,
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"],
  },
  avatars: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  avatarItem: {
    alignItems: "center",
    width: 52,
    gap: 4,
  },
  avatarName: {
    fontSize: 10.5,
    textAlign: "center",
  },
  more: {
    width: 38,
    height: 38,
    borderRadius: 13,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: {
    fontSize: 12.5,
  },
});
