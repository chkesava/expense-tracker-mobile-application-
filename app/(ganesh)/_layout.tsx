import { useEffect, useRef } from "react";
import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { PrivacyLock } from "@/components/PrivacyLock";
import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import { GaneshDataProvider } from "@/providers/GaneshDataProvider";
import { GaneshSessionProvider } from "@/providers/GaneshSessionProvider";
import { GaneshThemeProvider } from "@/providers/GaneshThemeProvider";
import { upsertGaneshProfile } from "@/services/ganesh/ganeshProfile";
import { claimOwnPandalMembership } from "@/services/ganesh/ganeshMembershipIndex";
import { useMyJoinRequests } from "@/hooks/useMyJoinRequests";
import { useTheme } from "@/theme/ThemeProvider";

function GaneshGate({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  // `realUser`, not `user` (GS-045). Under duress mode `useAuth().user` is the
  // decoy proxy whose uid is `<real uid>_duress`, so profiling it wrote the
  // person's real display name, email and phone into the decoy tree — the one
  // place that must look plausible without exposing them. Duress exists to be
  // shown under coercion; filling it with real PII defeats the feature.
  //
  // Every other Ganesh consumer already uses realUser: GaneshSessionProvider,
  // usePandals, useMyJoinRequests. This gate was the one holdout.
  const { realUser, user, loading } = useAuth();
  const uid = realUser?.uid;

  useEffect(() => {
    const db = getFirestoreDb();
    if (!realUser || !db) return;
    void upsertGaneshProfile(db, realUser);
  }, [uid]);

  if (!user) {
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
    return <Redirect href={"/(ganesh-auth)/login"} />;
  }

  return (
    <GaneshDataProvider>
      <ClaimApprovedMemberships />
      {children}
      {loading ? (
        <View
          pointerEvents="auto"
          style={[
            StyleSheet.absoluteFill,
            {
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.background,
              zIndex: 20,
            },
          ]}
        >
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : null}
    </GaneshDataProvider>
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
      void claimOwnPandalMembership(db, uid, request.pandalId, request.pandalName).catch((error) => {
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
      <Stack.Screen name="setup" options={{ headerShown: false }} />
      <Stack.Screen name="add-collection" options={{ headerShown: false }} />
      <Stack.Screen name="add-expense" options={{ headerShown: false }} />
      <Stack.Screen name="expense/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="add-contribution" options={{ headerShown: false }} />
      <Stack.Screen name="contribution/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="add-opening-fund" options={{ headerShown: false }} />
      <Stack.Screen name="add-member-payment" options={{ headerShown: false }} />
      <Stack.Screen name="add-reimbursement" options={{ headerShown: false }} />
      <Stack.Screen name="member/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="household/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="report" options={{ headerShown: false }} />
      <Stack.Screen name="close-festival" options={{ headerShown: false }} />
      <Stack.Screen name="join-requests" options={{ headerShown: false }} />
      <Stack.Screen name="members" options={{ headerShown: false }} />
      <Stack.Screen name="permanent-fund" options={{ headerShown: false }} />
      <Stack.Screen name="pandal-custody" options={{ headerShown: false }} />
      <Stack.Screen name="add-permanent-fund" options={{ headerShown: false }} />
      <Stack.Screen name="assets" options={{ headerShown: false }} />
      <Stack.Screen name="add-asset" options={{ headerShown: false }} />
      <Stack.Screen name="asset/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="sponsors" options={{ headerShown: false }} />
      <Stack.Screen name="add-sponsor" options={{ headerShown: false }} />
      <Stack.Screen name="sponsor/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="create-festival" options={{ headerShown: false }} />
      <Stack.Screen name="add-seva" options={{ headerShown: false }} />
      <Stack.Screen name="seva/[id]" options={{ headerShown: false }} />
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
