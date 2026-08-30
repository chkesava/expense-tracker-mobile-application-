import { Pressable, StyleSheet, Text, View } from "react-native";
import { HandCoins, HandHeart, User, Users } from "lucide-react-native";

import { Avatar, GaneshEmptyState, useGaneshTokens } from "@/components/ganesh/ui";
import { GANESH_RADIUS } from "@/components/ganesh/ui/surfaces";
import { PeopleGoldDivider } from "@/components/ganesh/people/PeopleGoldDivider";
import { SkeletonList } from "@/components/common/Skeleton";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

export type CommitteeMemberPreview = {
  id: string;
  userId: string;
  displayName: string;
};

function contributedPct(paid: number, total: number): number {
  if (!(total > 0)) return 0;
  const pct = (paid / total) * 100;
  return Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.round(pct))) : 0;
}

/**
 * Live committee snapshot. Counts come from the People screen — this only
 * presents them. Avatars are the first eight active members.
 */
export function CommitteeOverview({
  memberCount,
  paidCount,
  festivalMemberCount,
  onDutyToday,
  members,
  loading,
  onMemberPress,
}: {
  memberCount: number;
  paidCount: number;
  festivalMemberCount: number;
  onDutyToday: number;
  members: CommitteeMemberPreview[];
  loading?: boolean;
  onMemberPress?: (userId: string) => void;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const sevaTint = g.isDark ? "#C4B5FD" : "#6D5BBE";
  const pct = contributedPct(paidCount, festivalMemberCount);
  const subtitle =
    memberCount === 1 ? "1 active member" : `${memberCount} active members`;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: g.divider }]}>
      <View style={styles.heading}>
        <View style={[styles.headingGlyph, { backgroundColor: g.wash(g.saffron) }]}>
          <Users size={16} color={g.saffron} strokeWidth={2.2} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
            Committee
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            {subtitle}
          </Text>
        </View>
      </View>
      <PeopleGoldDivider maxWidth={188} />

      <View style={styles.metrics}>
        <View
          style={[styles.metric, { backgroundColor: g.wash(g.godFund) }]}
          accessibilityLabel={`${memberCount} members`}
        >
          <View style={[styles.metricGlyph, { backgroundColor: g.wash(g.godFund) }]}>
            <User size={14} color={g.godFund} strokeWidth={2.2} />
          </View>
          <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
            Members
          </Text>
          <Text
            style={[styles.metricValue, { color: g.godFund, fontFamily: theme.fontFamily.semibold }]}
          >
            {memberCount}
          </Text>
        </View>

        <View
          style={[styles.metric, { backgroundColor: g.wash(g.saffron) }]}
          accessibilityLabel={`${paidCount} of ${festivalMemberCount} contributed, ${pct} percent`}
        >
          <View style={[styles.metricGlyph, { backgroundColor: g.wash(g.saffron) }]}>
            <HandCoins size={14} color={g.saffron} strokeWidth={2.2} />
          </View>
          <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
            Contributed
          </Text>
          <Text style={[styles.metricValue, { color: g.saffron, fontFamily: theme.fontFamily.semibold }]}>
            {paidCount}
            <Text style={[styles.metricDenom, { color: theme.colors.mutedForeground }]}>
              {" / "}
              {festivalMemberCount}
            </Text>
          </Text>
          <Text style={[styles.metricMeta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            {pct}% completed
          </Text>
        </View>

        <View
          style={[styles.metric, { backgroundColor: g.wash(sevaTint) }]}
          accessibilityLabel={`${onDutyToday} on seva today`}
        >
          <View style={[styles.metricGlyph, { backgroundColor: g.wash(sevaTint) }]}>
            <HandHeart size={14} color={sevaTint} strokeWidth={2.2} />
          </View>
          <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
            On seva today
          </Text>
          <Text style={[styles.metricValue, { color: sevaTint, fontFamily: theme.fontFamily.semibold }]}>
            {onDutyToday}
          </Text>
        </View>
      </View>

      {loading && members.length === 0 ? (
        <SkeletonList count={3} />
      ) : members.length === 0 ? (
        <GaneshEmptyState
          compact
          icon={<Users size={20} color={g.saffron} strokeWidth={1.9} />}
          title="No committee members yet"
          description="Share your Pandal code so people can join."
        />
      ) : (
        <View style={styles.avatars}>
          {members.slice(0, 8).map((member) => {
            const first = member.displayName.trim().split(/\s+/)[0] || member.displayName;
            const body = (
              <>
                <Avatar name={member.displayName} seed={member.userId} size={40} />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.avatarName,
                    { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium },
                  ]}
                >
                  {first}
                </Text>
              </>
            );

            if (!onMemberPress) {
              return (
                <View key={member.id} style={styles.avatarItem}>
                  {body}
                </View>
              );
            }

            return (
              <Pressable
                key={member.id}
                onPress={() => {
                  void haptic.selection();
                  onMemberPress(member.userId);
                }}
                accessibilityRole="button"
                accessibilityLabel={member.displayName}
                style={({ pressed }) => [styles.avatarItem, pressed ? { opacity: 0.75 } : null]}
              >
                {body}
              </Pressable>
            );
          })}
          {members.length > 8 ? (
            <View style={styles.avatarItem}>
              <View style={[styles.more, { backgroundColor: g.wash(g.saffron) }]}>
                <Text style={[styles.moreText, { color: g.saffron, fontFamily: theme.fontFamily.semibold }]}>
                  +{members.length - 8}
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: GANESH_RADIUS.section,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    boxShadow: "0 6px 18px rgba(122, 24, 54, 0.08)",
  },
  metricGlyph: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headingGlyph: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  headingCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontSize: 16,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
  },
  metrics: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    marginBottom: 12,
  },
  metric: {
    flex: 1,
    minWidth: 0,
    borderRadius: GANESH_RADIUS.tile,
    borderCurve: "continuous",
    padding: 8,
    gap: 4,
  },
  metricLabel: {
    fontSize: 11,
  },
  metricValue: {
    fontSize: 18,
    letterSpacing: -0.3,
    fontVariant: ["tabular-nums"],
  },
  metricDenom: {
    fontSize: 13,
    letterSpacing: 0,
  },
  metricMeta: {
    fontSize: 10.5,
    lineHeight: 13,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: {
    fontSize: 12.5,
  },
});
