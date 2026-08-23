import { Text, View } from "react-native";
import { Check, RefreshCw, WifiOff } from "lucide-react-native";

import { useGlobalPendingSyncCount } from "@/lib/syncStatusStore";
import { useNetwork } from "@/providers/NetworkProvider";
import { useTheme } from "@/theme/ThemeProvider";

export function GaneshSyncChip() {
  const { theme } = useTheme();
  const { isOnline } = useNetwork();
  const pending = useGlobalPendingSyncCount();

  const offline = !isOnline;
  const syncing = isOnline && pending > 0;
  const label = offline
    ? pending > 0
      ? `Offline · ${pending} waiting`
      : "Offline"
    : syncing
      ? "Syncing…"
      : "Synced";
  const color = offline
    ? theme.colors.destructive
    : syncing
      ? theme.colors.warning
      : theme.colors.success;
  const Icon = offline ? WifiOff : syncing ? RefreshCw : Check;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: theme.colors.muted,
      }}
    >
      <Icon size={12} color={color} />
      <Text style={{ color, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

export function PendingHint({ pending }: { pending?: boolean }) {
  const { theme } = useTheme();
  if (!pending) return null;
  return (
    <Text style={{ color: theme.colors.warning, fontSize: 11, fontWeight: "600" }}>
      Waiting to sync
    </Text>
  );
}
