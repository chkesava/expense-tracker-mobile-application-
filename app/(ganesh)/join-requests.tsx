import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/common/EmptyState";
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
  const { pandalId } = useGaneshSession();
  const { requests } = useJoinRequests(pandalId);
  const { roles } = usePandalRoles(pandalId);
  const writes = useGaneshWrites();
  const { can, isAdmin } = useGaneshPermissions();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const assignable = roles.filter((role) => role.id !== "admin");
  const defaultRoleId =
    assignable.find((role) => role.id === "member")?.id ?? assignable[0]?.id ?? "member";

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
    <GaneshScreen>
      <Text style={{ color: theme.colors.mutedForeground }}>
        Choose a committee role before approving. Admin is not self-serve — promote from the
        member screen.
      </Text>
      {requests.length === 0 ? (
        <EmptyState title="No pending requests" description="Share the Pandal code from the Pandal tab." />
      ) : (
        requests.map((request) => {
          const roleId = selected[request.id] ?? defaultRoleId;
          const busy = busyId === request.id;
          return (
            <View
              key={request.id}
              style={{
                backgroundColor: theme.colors.card,
                borderRadius: 16,
                padding: 14,
                gap: 10,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
                {request.displayName}
              </Text>
              {request.phone ? (
                <Text style={{ color: theme.colors.mutedForeground }}>{request.phone}</Text>
              ) : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {(assignable.length > 0 ? assignable : [{ id: "member", name: "Member" }]).map(
                  (role) => {
                    const on = roleId === role.id;
                    return (
                      <Pressable
                        key={role.id}
                        onPress={() =>
                          setSelected((prev) => ({ ...prev, [request.id]: role.id }))
                        }
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          minHeight: 40,
                          borderRadius: 999,
                          backgroundColor: on ? theme.colors.primary : theme.colors.muted,
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: on ? theme.colors.primaryForeground : theme.colors.foreground,
                            fontWeight: "700",
                          }}
                        >
                          {role.name}
                        </Text>
                      </Pressable>
                    );
                  }
                )}
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button
                  style={{ flex: 1 }}
                  loading={busy}
                  onPress={() => void decide(request.id, "approved", roleId)}
                >
                  Approve
                </Button>
                <Button
                  variant="outline"
                  style={{ flex: 1 }}
                  disabled={Boolean(busyId)}
                  onPress={() => void decide(request.id, "rejected", roleId)}
                >
                  Reject
                </Button>
              </View>
            </View>
          );
        })
      )}
    </GaneshScreen>
  );
}
