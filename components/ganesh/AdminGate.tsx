import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { Button } from "@/components/ui/Button";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * The gate on the admin stack (GS-054).
 *
 * It used to render `children` unconditionally and paint the loading spinner
 * and the denial screen as `absoluteFill` siblings on top. Coverage was never
 * the problem — this wraps the whole admin `Stack`, deep links included — but
 * covering something is not the same as not mounting it:
 *
 * - A non-admin deep-linking to `/(ganesh)/admin/audit` mounted the entire
 *   admin subtree for the 1600 ms before the redirect fired, so
 *   `useFestivalAuditLogs`, `useMemberAudits`, `usePandalRoles` and
 *   `useJoinRequests` all opened live listeners that the rules then rejected —
 *   wasted round trips and permission-denied noise in the logs, for a user who
 *   was never going to be allowed.
 * - The covering `View` carried no `accessibilityViewIsModal` or
 *   `importantForAccessibility="no-hide-descendants"`, so a screen reader
 *   walked straight past the denial screen into the admin content behind it.
 *
 * Now each state returns instead of overlaying. The accessibility problem goes
 * away by construction rather than by adding a prop that has to be remembered:
 * there is nothing behind the denial screen to reach.
 *
 * The server rules remain the real boundary — this was always defence in depth,
 * and the fix does not change that. It changes what the client asks for.
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const { replace } = useRouter();
  const { isAdmin, loading } = useGaneshPermissions();

  // Declared before any early return so the hook order stays stable across
  // the loading -> allowed/denied transition.
  useEffect(() => {
    if (loading || isAdmin) return;
    const timer = setTimeout(() => replace("/(ganesh)/(tabs)"), 1600);
    return () => clearTimeout(timer);
  }, [isAdmin, loading, replace]);

  if (loading) {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <GaneshScreen>
          <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
            Access denied
          </Text>
          <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
            Only a Pandal Admin can open the Admin Dashboard.
          </Text>
          <Button onPress={() => replace("/(ganesh)/(tabs)")}>Back to Ganesh Seva</Button>
        </GaneshScreen>
      </View>
    );
  }

  return <View style={styles.root}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center" },
});
