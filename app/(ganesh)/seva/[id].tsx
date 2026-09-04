import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, MapPin, Play, Trash2, UserPlus, X } from "lucide-react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  Avatar,
  GaneshEmptyState,
  GaneshHeader,
  GANESH_RADIUS,
  MetaLabel,
  Section,
  StatTile,
  StatusBadge,
  useGaneshTokens,
  useSurfaces,
} from "@/components/ganesh/ui";
import { SevaGlyph, sevaKindLabel } from "@/components/ganesh/ui/SevaGlyph";
import { Dialog } from "@/components/common/Dialog";
import { SkeletonList } from "@/components/common/Skeleton";
import { Button } from "@/components/ui/Button";
import { useSeva, useSevaDuties } from "@/hooks/useFestivalSeva";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import {
  dutyCounts,
  dutyStatusLabel,
  dutyStatusOf,
  formatSevaDate,
  formatSevaTime,
  sevaStatusLabel,
  sevaStatusOf,
} from "@/shared/utils/ganeshSeva";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * One seva: what it is, when, and who is doing it.
 *
 * The duty roster is the point of the screen. A coordinator staffs it; a
 * volunteer marks themselves on duty and done — the latter needs no permission,
 * because the rules allow the assignee to change their own duty status.
 */
export default function SevaDetailScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const surfaces = useSurfaces();
  const { back, push } = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pandalId, festivalId, actor } = useGaneshSession();
  const { seva, loading } = useSeva(pandalId, festivalId, id ?? null);
  const { duties, loading: dutiesLoading } = useSevaDuties(pandalId, festivalId, id ?? null);
  const { members } = usePandalMembers(pandalId);
  const { can } = useGaneshPermissions();
  const writes = useGaneshWrites();

  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const canAssign = can("seva.assign");
  const canPlan = can("seva.write");

  const counts = useMemo(() => dutyCounts(duties), [duties]);
  const status = sevaStatusOf(seva);

  const assignedIds = useMemo(() => new Set(duties.map((d) => d.userId)), [duties]);
  const available = useMemo(
    () =>
      members.filter(
        (m) => (m.status === "active" || m.status == null) && !assignedIds.has(m.userId)
      ),
    [members, assignedIds]
  );

  const guard = useCallback(
    async (label: string, work: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await work();
      } catch (error) {
        logError(`ganesh.seva.${label}`, error);
        toast.error(friendlyErrorMessage(error, "Could not update this seva."));
      } finally {
        setBusy(false);
      }
    },
    []
  );

  if (loading && !seva) {
    return (
      <GaneshScreen safeTop>
        <SkeletonList count={4} />
      </GaneshScreen>
    );
  }

  if (!seva) {
    return (
      <GaneshScreen safeTop>
        <GaneshHeader title="Seva" onBack={back} />
        <GaneshEmptyState
          icon={<MapPin size={24} color={g.saffron} strokeWidth={1.9} />}
          title="This seva is no longer here"
          description="It may have been removed from the schedule."
          action={{ label: "Back to schedule", onPress: () => push("/(ganesh)/(tabs)/seva") }}
        />
      </GaneshScreen>
    );
  }

  const tint = g.sevaColor(seva.kind);
  const when = [formatSevaDate(seva.date, true), formatSevaTime(seva.startTime)]
    .filter(Boolean)
    .join(" · ");

  return (
    <GaneshScreen safeTop>
      <GaneshHeader
        title={seva.name}
        subtitle={sevaKindLabel(seva.kind)}
        icon={<SevaGlyph kind={seva.kind} size={22} color={tint} />}
        onBack={back}
      />

      <Section title="When">
        <View style={styles.whenRow}>
          <Text
            style={[styles.when, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
          >
            {when}
            {seva.endTime ? (
              <Text style={{ color: theme.colors.mutedForeground }}>
                {" "}
                – {formatSevaTime(seva.endTime)}
              </Text>
            ) : null}
          </Text>
          <StatusBadge
            kind={
              status === "completed"
                ? "received"
                : status === "cancelled"
                  ? "cancelled"
                  : status === "in_progress"
                    ? "partial"
                    : "pending"
            }
            label={sevaStatusLabel(status)}
          />
        </View>

        {seva.location ? (
          <View style={styles.locationRow}>
            <MapPin size={13} color={theme.colors.mutedForeground} strokeWidth={2.2} />
            <Text
              style={[
                styles.location,
                { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
              ]}
            >
              {seva.location}
            </Text>
          </View>
        ) : null}

        {seva.notes ? <MetaLabel numberOfLines={4}>{seva.notes}</MetaLabel> : null}

        {canPlan && status !== "completed" && status !== "cancelled" ? (
          <View style={styles.actions}>
            {status === "scheduled" ? (
              <Button
                variant="outline"
                style={styles.actionButton}
                disabled={busy}
                onPress={() => void guard("start", () => writes.setSevaStatus(seva.id, "in_progress"))}
              >
                <View style={styles.actionInner}>
                  <Play size={15} color={g.saffron} strokeWidth={2.4} />
                  <Text style={[styles.actionLabel, { color: g.saffron, fontFamily: theme.fontFamily.semibold }]}>
                    Start
                  </Text>
                </View>
              </Button>
            ) : null}
            <Button
              style={styles.actionButton}
              disabled={busy}
              onPress={() => void guard("complete", () => writes.setSevaStatus(seva.id, "completed"))}
            >
              Mark done
            </Button>
          </View>
        ) : null}
      </Section>

      <Section
        title="Volunteers"
        subtitle={counts.total > 0 ? `${counts.committed} expected` : undefined}
        action={
          canAssign && available.length > 0 ? (
            <Pressable
              onPress={() => setPicking(true)}
              accessibilityRole="button"
              accessibilityLabel="Assign a volunteer"
              hitSlop={8}
              style={({ pressed }) => [
                styles.addButton,
                { backgroundColor: g.wash(g.saffron) },
                pressed && { opacity: 0.8 },
              ]}
            >
              <UserPlus size={16} color={g.saffron} strokeWidth={2.4} />
            </Pressable>
          ) : undefined
        }
      >
        {counts.total > 0 ? (
          <View style={styles.statRow}>
            <StatTile label="Assigned">
              <Text style={[styles.count, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
                {counts.assigned}
              </Text>
            </StatTile>
            <StatTile label="On duty">
              <Text style={[styles.count, { color: g.saffron, fontFamily: theme.fontFamily.semibold }]}>
                {counts.onDuty}
              </Text>
            </StatTile>
            <StatTile label="Done">
              <Text style={[styles.count, { color: g.godFund, fontFamily: theme.fontFamily.semibold }]}>
                {counts.completed}
              </Text>
            </StatTile>
          </View>
        ) : null}

        {dutiesLoading && duties.length === 0 ? (
          <SkeletonList count={2} />
        ) : duties.length === 0 ? (
          <GaneshEmptyState
            compact
            icon={<UserPlus size={20} color={g.saffron} strokeWidth={1.9} />}
            title="Nobody assigned yet"
            description={
              canAssign
                ? "Add the volunteers who will run this seva."
                : "A coordinator has not assigned anyone yet."
            }
            action={canAssign ? { label: "Assign a volunteer", onPress: () => setPicking(true) } : undefined}
          />
        ) : (
          duties.map((duty, index) => {
            const dutyStatus = dutyStatusOf(duty);
            const isOwn = duty.userId === actor?.uid;
            const canTouch = canAssign || isOwn;
            const done = dutyStatus === "completed";

            return (
              <View
                key={duty.id}
                style={[
                  styles.duty,
                  index < duties.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: surfaces.divider,
                  },
                ]}
              >
                <Avatar name={duty.displayName} seed={duty.userId} size={36} />

                <View style={styles.dutyText}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.dutyName,
                      { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
                    ]}
                  >
                    {duty.displayName}
                    {isOwn ? (
                      <Text style={{ color: theme.colors.mutedForeground }}> · you</Text>
                    ) : null}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.dutyMeta,
                      {
                        color:
                          dutyStatus === "declined"
                            ? theme.colors.warning
                            : done
                              ? g.godFund
                              : theme.colors.mutedForeground,
                        fontFamily: theme.fontFamily.regular,
                      },
                    ]}
                  >
                    {[duty.roleLabel, dutyStatusLabel(dutyStatus)].filter(Boolean).join(" · ")}
                  </Text>
                </View>

                {canTouch && !done ? (
                  <View style={styles.dutyActions}>
                    {dutyStatus !== "on_duty" ? (
                      <DutyAction
                        label="On duty"
                        icon={<Play size={14} color={g.saffron} strokeWidth={2.4} />}
                        tint={g.wash(g.saffron)}
                        disabled={busy}
                        onPress={() =>
                          void guard("onDuty", () =>
                            writes.setSevaDutyStatus(seva.id, duty.id, "on_duty", isOwn)
                          )
                        }
                      />
                    ) : null}
                    <DutyAction
                      label="Done"
                      icon={<Check size={14} color={g.godFund} strokeWidth={2.6} />}
                      tint={g.wash(g.godFund)}
                      disabled={busy}
                      onPress={() =>
                        void guard("dutyDone", () =>
                          writes.setSevaDutyStatus(seva.id, duty.id, "completed", isOwn)
                        )
                      }
                    />
                    {canAssign ? (
                      <DutyAction
                        label="Remove"
                        icon={<Trash2 size={14} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
                        tint={surfaces.tile}
                        disabled={busy}
                        onPress={() =>
                          void guard("removeDuty", () => writes.removeSevaDuty(seva.id, duty.id))
                        }
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </Section>

      {canPlan && status !== "cancelled" ? (
        <Button
          variant="ghost"
          disabled={busy}
          onPress={() => void guard("cancel", () => writes.setSevaStatus(seva.id, "cancelled"))}
        >
          <View style={styles.actionInner}>
            <X size={15} color={theme.colors.destructive} strokeWidth={2.4} />
            <Text
              style={[styles.actionLabel, { color: theme.colors.destructive, fontFamily: theme.fontFamily.semibold }]}
            >
              Cancel this seva
            </Text>
          </View>
        </Button>
      ) : null}

      <Dialog
        isOpen={picking}
        title="Assign a volunteer"
        onClose={() => setPicking(false)}
      >
        <View style={styles.picker}>
          {available.length === 0 ? (
            <MetaLabel>Every active committee member is already on this seva.</MetaLabel>
          ) : (
            available.slice(0, 30).map((member) => (
              <Pressable
                key={member.id}
                disabled={busy}
                onPress={() => {
                  setPicking(false);
                  void guard("assign", () =>
                    writes.assignSevaDuty(seva.id, {
                      userId: member.userId,
                      displayName: member.displayName,
                    })
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel={`Assign ${member.displayName}`}
                android_ripple={{ color: g.ripple, borderless: false }}
                style={({ pressed }) => [styles.pickRow, pressed && { opacity: 0.85 }]}
              >
                <Avatar name={member.displayName} seed={member.userId} size={32} />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.pickName,
                    { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
                  ]}
                >
                  {member.displayName}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      </Dialog>
    </GaneshScreen>
  );
}

function DutyAction({
  label,
  icon,
  tint,
  disabled,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  tint: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.dutyAction,
        { backgroundColor: tint },
        (pressed || disabled) && { opacity: 0.7 },
      ]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  whenRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  when: {
    flex: 1,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
  },
  location: {
    fontSize: 12.5,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  actionButton: {
    flex: 1,
  },
  actionInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionLabel: {
    fontSize: 14,
  },
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
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  duty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    minHeight: 52,
  },
  dutyText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  dutyName: {
    fontSize: 14.5,
  },
  dutyMeta: {
    fontSize: 11.5,
  },
  dutyActions: {
    flexDirection: "row",
    gap: 6,
  },
  dutyAction: {
    width: 30,
    height: 30,
    borderRadius: GANESH_RADIUS.glyph,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  picker: {
    gap: 2,
    maxHeight: 380,
  },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    minHeight: 48,
  },
  pickName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14.5,
  },
});
