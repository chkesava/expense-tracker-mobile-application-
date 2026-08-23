import { useState } from "react";
import { Text, View } from "react-native";

import { RoleChips } from "@/components/ganesh/RoleChips";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useJoinRequests } from "@/hooks/useJoinRequests";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { GaneshRole } from "@/shared/types/ganesh";
import { JOIN_APPROVE_ROLES } from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

export default function JoinRequestsScreen() {
  const { theme } = useTheme();
  const { pandalId } = useGaneshSession();
  const { requests } = useJoinRequests(pandalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const [roles, setRoles] = useState<Record<string, GaneshRole>>({});

  if (!can("members.approve")) {
    return <GaneshWriteLock message="Only a Pandal Admin can approve join requests." />;
  }

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.mutedForeground }}>
        Choose Member, Collector, or Viewer before approving. Admin is not self-serve.
      </Text>
      {requests.length === 0 ? (
        <EmptyState title="No pending requests" description="Share the Pandal code from the Pandal tab." />
      ) : (
        requests.map((request) => {
          const role = roles[request.id] ?? "member";
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
              <RoleChips
                value={role}
                options={JOIN_APPROVE_ROLES}
                onChange={(next) => setRoles((prev) => ({ ...prev, [request.id]: next }))}
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button
                  style={{ flex: 1 }}
                  onPress={() => void writes.decideJoinRequest(request.id, "approved", role)}
                >
                  Approve
                </Button>
                <Button
                  variant="outline"
                  style={{ flex: 1 }}
                  onPress={() => void writes.decideJoinRequest(request.id, "rejected")}
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
