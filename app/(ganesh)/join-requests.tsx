import { Text, View } from "react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useJoinRequests } from "@/hooks/useJoinRequests";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function JoinRequestsScreen() {
  const { theme } = useTheme();
  const { pandalId } = useGaneshSession();
  const { requests } = useJoinRequests(pandalId);
  const writes = useGaneshWrites();

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.mutedForeground }}>
        Approve people before they can see this Pandal's shared ledger.
      </Text>
      {requests.length === 0 ? (
        <EmptyState title="No pending requests" description="Share the Pandal code from the Pandal tab." />
      ) : (
        requests.map((request) => (
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
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button
                style={{ flex: 1 }}
                onPress={() => void writes.decideJoinRequest(request.id, "approved")}
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
        ))
      )}
    </GaneshScreen>
  );
}
