import { useEffect, useRef } from "react";
import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { PrivacyLock } from "@/components/PrivacyLock";
import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import { GaneshSessionProvider } from "@/providers/GaneshSessionProvider";
import { GaneshThemeProvider } from "@/providers/GaneshThemeProvider";
import { upsertGaneshProfile } from "@/services/ganesh/ganeshProfile";
import { claimOwnPandalMembership } from "@/services/ganesh/ganeshMembershipIndex";
import { useMyJoinRequests } from "@/hooks/useMyJoinRequests";
import { useTheme } from "@/theme/ThemeProvider";

function GaneshGate({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const { user, loading } = useAuth();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!user || !db) return;
    void upsertGaneshProfile(db, user);
  }, [user]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href={"/(ganesh-auth)/login" as never} />;
  }

  return (
    <>
      <ClaimApprovedMemberships />
      {children}
    </>
  );
}

function ClaimApprovedMemberships() {
  const { realUser } = useAuth();
  const { requests } = useMyJoinRequests();
  const claimed = useRef(new Set<string>());

  useEffect(() => {
    const db = getFirestoreDb();
    const uid = realUser?.uid;
    if (!db || !uid) return;
    for (const request of requests) {
      if (request.status !== "approved" || !request.pandalId) continue;
      const key = `${uid}:${request.pandalId}`;
      if (claimed.current.has(key)) continue;
      claimed.current.add(key);
      void claimOwnPandalMembership(db, uid, request.pandalId).catch((error) => {
        claimed.current.delete(key);
        logError("ganesh.claimMembership", error);
      });
    }
  }, [realUser?.uid, requests]);

  return null;
}

function GaneshStack() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: theme.colors.foreground,
        headerStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="setup" options={{ title: "Ganesh Seva" }} />
      <Stack.Screen name="add-collection" options={{ title: "Add collection" }} />
      <Stack.Screen name="add-expense" options={{ title: "Add expense" }} />
      <Stack.Screen name="expense/[id]" options={{ title: "Expense" }} />
      <Stack.Screen name="add-contribution" options={{ title: "Add contribution" }} />
      <Stack.Screen name="contribution/[id]" options={{ title: "Contribution" }} />
      <Stack.Screen name="add-opening-fund" options={{ title: "Opening fund" }} />
      <Stack.Screen name="add-member-payment" options={{ title: "Member payment" }} />
      <Stack.Screen name="add-reimbursement" options={{ title: "Reimburse" }} />
      <Stack.Screen name="member/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="household/[id]" options={{ title: "Household" }} />
      <Stack.Screen name="report" options={{ title: "Festival report" }} />
      <Stack.Screen name="close-festival" options={{ title: "Close festival" }} />
      {/* Redesigned screens draw their own GaneshHeader, matching the Expense
          Tracker's in-content PageHeader. The rest keep the native bar until
          they are converted. */}
      <Stack.Screen name="join-requests" options={{ headerShown: false }} />
      <Stack.Screen name="members" options={{ headerShown: false }} />
      <Stack.Screen name="permanent-fund" options={{ headerShown: false }} />
      <Stack.Screen name="add-permanent-fund" options={{ title: "Add Permanent Fund" }} />
      <Stack.Screen name="assets" options={{ headerShown: false }} />
      <Stack.Screen name="add-asset" options={{ title: "Add asset" }} />
      <Stack.Screen name="asset/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="sponsors" options={{ headerShown: false }} />
      <Stack.Screen name="add-sponsor" options={{ title: "Add sponsor" }} />
      <Stack.Screen name="sponsor/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="create-festival" options={{ title: "Create festival" }} />
    </Stack>
  );
}

export default function GaneshLayout() {
  // Outermost, so the loading spinners and the privacy lock are already wearing
  // the festival palette on the very first frame.
  return (
    <GaneshThemeProvider>
      <PrivacyLock>
        <GaneshSessionProvider>
          <GaneshGate>
            <GaneshStack />
          </GaneshGate>
        </GaneshSessionProvider>
      </PrivacyLock>
    </GaneshThemeProvider>
  );
}
