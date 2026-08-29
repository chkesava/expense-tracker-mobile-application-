import { StyleSheet, Text, View } from "react-native";
import { Check, RefreshCw, WifiOff } from "lucide-react-native";

import { GANESH_RADIUS } from "@/components/ganesh/ui/surfaces";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { useGlobalPendingSyncCount } from "@/lib/syncStatusStore";
import { useNetwork } from "@/providers/NetworkProvider";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Sync status. Deliberately quiet: a washed tint rather than a filled pill, so
 * "Synced" — the state it is in 99% of the time — never competes with the
 * financial content beside it.
 */
export function GaneshSyncChip() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { isOnline } = useNetwork();
  const pending = useGlobalPendingSyncCount();

  const offline = !isOnline;
  const syncing = isOnline && pending > 0;

  const label = offline
    ? pending > 0
      ? `Offline · ${pending} pending`
      : "Offline"
    : syncing
      ? "Syncing…"
      : "Synced";

  const color = offline
    ? theme.colors.mutedForeground
    : syncing
      ? theme.colors.warning
      : theme.colors.success;

  const Icon = offline ? WifiOff : syncing ? RefreshCw : Check;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Sync status: ${label}`}
      style={[styles.chip, { backgroundColor: g.wash(color) }]}
    >
      <Icon size={12} color={color} strokeWidth={2.4} />
      <Text style={[styles.label, { color, fontFamily: theme.fontFamily.medium }]}>{label}</Text>
    </View>
  );
}

export function PendingHint({ pending }: { pending?: boolean }) {
  const { theme } = useTheme();
  if (!pending) return null;
  return (
    <View style={styles.hintRow}>
      <RefreshCw size={11} color={theme.colors.warning} strokeWidth={2.4} />
      <Text style={[styles.hintText, { color: theme.colors.warning, fontFamily: theme.fontFamily.medium }]}>
        Waiting to sync
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: GANESH_RADIUS.pill,
  },
  label: {
    fontSize: 11.5,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  hintText: {
    fontSize: 11,
  },
});
