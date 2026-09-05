import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect, usePathname } from "expo-router";

import { useAuth } from "@/providers/AuthProvider";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { isActiveMembershipIndexStatus } from "@/shared/utils/ganeshAuthorization";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * KAN-10: keep stack screens (report, add-expense, members, …) from mounting
 * protected work against a stale or inactive session. Tabs already redirected
 * to setup; this covers the rest of the ganesh stack.
 *
 * Firestore Rules remain the security boundary. This only decides what the
 * client asks for.
 */
export function GaneshMembershipGate({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const pathname = usePathname();
  const { realUser } = useAuth();
  const { ready, pandalId, festivalId, clearSession } = useGaneshSession();
  const { members, membershipsReady, sessionMembershipActive } = useGaneshData();

  const isSetup = /(^|\/)setup$/.test(pathname) && !pathname.includes("/admin");
  const me = members.items.find((member) => member.userId === realUser?.uid);
  const liveRevoked = Boolean(me && !isActiveMembershipIndexStatus(me.status));
  const allowed = sessionMembershipActive && !liveRevoked;

  useEffect(() => {
    if (!ready || !membershipsReady || isSetup) return;
    if (pandalId && !allowed) {
      void clearSession();
    }
  }, [allowed, clearSession, isSetup, membershipsReady, pandalId, ready]);

  if (isSetup) {
    return <>{children}</>;
  }

  if (!ready || !membershipsReady) {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!pandalId || !festivalId || !allowed) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        {children}
        <Redirect href={"/(ganesh)/setup"} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center" },
});
