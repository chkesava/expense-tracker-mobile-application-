import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Phone, UserPlus } from "lucide-react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import {
  Avatar,
  FilterChips,
  GaneshHeader,
  MetaLabel,
  StatusStrip,
  useGaneshTokens,
  GaneshEmptyState,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { SkeletonList } from "@/components/common/Skeleton";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useJoinRequests } from "@/hooks/useJoinRequests";
import { usePandalRoles } from "@/hooks/usePandalRoles";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function JoinRequestsScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { pandalId } = useGaneshSession();
  const { requests, loading } = useJoinRequests(pandalId);
  const { roles } = usePandalRoles(pandalId);
  const writes = useGaneshWrites();
  const { can, isAdmin } = useGaneshPermissions();

  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const assignable = roles.filter((role) => role.id !== "admin");
  const defaultRoleId =
    assignable.find((role) => role.id === "member")?.id ?? assignable[0]?.id ?? "member";
  const roleOptions = (assignable.length > 0 ? assignable : [{ id: "member", name: "Member" }]).map(
    (role) => ({ id: role.id, label: role.name })
  );

  useEffect(() => {
    if (!isAdmin) return;
    void writes.ensurePandalRoles().catch((caught) => {
      logError("ganesh.join.ensureRoles", caught);
    });
  }, [isAdmin, pandalId]);

  const decide = async (
    requestId: string,
    decision: "approved" | "rejected",
    roleId: string
  ) => {
    if (busyId) return;
    setBusyId(requestId);
    try {
      await writes.decideJoinRequest(
        requestId,
        decision,
        decision === "approved" ? { roleId } : undefined
      );
    } catch (caught) {
      logError(decision === "approved" ? "ganesh.join.approve" : "ganesh.join.reject", caught);
      toast.error(
        friendlyErrorMessage(
          caught,
          decision === "approved"
            ? "Could not approve this person."
            : "Could not reject this request."
        )
      );
    } finally {
      setBusyId(null);
    }
  };

  if (!can("members.approve")) {
    return <GaneshWriteLock message="Only a Pandal Admin can approve join requests." />;
  }

  return (
    <GaneshScreen safeTop>
      <GaneshHeader
        title="Join requests"
        subtitle={
          requests.length > 0
            ? `${requests.length} waiting`
            : "Nobody waiting"
        }
        icon={<UserPlus size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />

      <StatusStrip
        tone="info"
        message="Choose a committee role before approving. Admin is not self-serve — promote from the member screen."
      />

      {loading && requests.length === 0 ? (
        <SkeletonList count={3} />
      ) : requests.length === 0 ? (
        <GaneshEmptyState
          icon={<UserPlus size={22} color={g.saffron} strokeWidth={2.2} />}
          title="No pending requests"
          description="Share the Pandal code from the Pandal tab so people can ask to join."
        />
      ) : (
        <View style={styles.list}>
          {requests.map((request) => {
            const roleId = selected[request.id] ?? defaultRoleId;
            const busy = busyId === request.id;

            return (
              <View
                key={request.id}
                style={[
                  styles.card,
                  { backgroundColor: theme.colors.card, borderColor: g.divider },
                ]}
              >
                <View style={styles.cardTop}>
                  <Avatar name={request.displayName} seed={request.id} size={44} />
                  <View style={styles.cardCopy}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.name,
                        { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
                      ]}
                    >
                      {request.displayName}
                    </Text>
                    {request.phone ? (
                      <View style={styles.phoneRow}>
                        <Phone size={12} color={theme.colors.mutedForeground} strokeWidth={2.2} />
                        <Text
                          style={[
                            styles.phone,
                            {
                              color: theme.colors.mutedForeground,
                              fontFamily: theme.fontFamily.regular,
                            },
                          ]}
                        >
                          {request.phone}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={styles.roleBlock}>
                  <MetaLabel>Approve as</MetaLabel>
                  <FilterChips
                    value={roleId}
                    options={roleOptions}
                    disabled={busy}
                    onChange={(next) =>
                      setSelected((prev) => ({ ...prev, [request.id]: next }))
                    }
                  />
                </View>

                <View style={styles.actions}>
                  <Button
                    style={styles.actionButton}
                    loading={busy}
                    onPress={() => void decide(request.id, "approved", roleId)}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    style={styles.actionButton}
                    disabled={Boolean(busyId)}
                    onPress={() => void decide(request.id, "rejected", roleId)}
                  >
                    Reject
                  </Button>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
  },
  card: {
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 14,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  name: {
    fontSize: 16,
    letterSpacing: -0.2,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  phone: {
    fontSize: 12.5,
  },
  roleBlock: {
    gap: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
  },
});
