/**
 * Account deletion — SPENDLY-7 (AUTH-06).
 *
 * A **root-level** route on purpose, not a settings sub-screen. Navigating here
 * unmounts `(app)`, `(ganesh)` and `(nutrition)`, and with them every
 * `onSnapshot` they hold. Otherwise the moment deletion starts, dozens of live
 * listeners begin firing `permission-denied` into `logError` while the user
 * watches half-empty screens repaint. One route also serves all three products,
 * which is what Play requires — each ships as its own listing.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Redirect, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { logError } from "@/lib/errors";
import { clearAllPins } from "@/lib/pinVault";
import { forgetPrivacyLockout } from "@/lib/privacyLockout";
import { privacySession } from "@/lib/privacySession";
import {
  currentReauthMethod,
  reauthenticate,
  type ReauthMethod,
} from "@/lib/reauthenticate";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import {
  ReauthRequiredError,
  runAccountDeletion,
} from "@/services/deleteAccountClient";
import { deletePhaseLabel, DELETE_CONFIRM_TOKEN } from "@/shared/utils/deleteAccountRemote";
import { useTheme } from "@/theme/ThemeProvider";

type Step = "confirm" | "reauth" | "running" | "failed";

export default function DeleteAccountScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { realUser, isDuress, logout } = useAuth();

  const [step, setStep] = useState<Step>("confirm");
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [method, setMethod] = useState<ReauthMethod>("none");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void currentReauthMethod().then(setMethod);
  }, []);

  // Hiding the entry points is not the guard that matters; this is. A coercer
  // in duress mode must not be able to reach account deletion by any route.
  if (isDuress || !realUser) return <Redirect href="/" />;

  const confirmed = typed.trim() === DELETE_CONFIRM_TOKEN;

  const finishLocally = useCallback(async () => {
    const uid = realUser.uid;
    // The SecureStore keys `logout()` deliberately leaves behind (SPENDLY-22 —
    // the PIN should survive re-login on the same device). Deletion is a
    // different event: there is no account left to protect, and stale secret
    // material on a shared device is worth nothing to anyone.
    await clearAllPins(uid).catch(() => undefined);
    await forgetPrivacyLockout(uid).catch(() => undefined);
    privacySession.clearAll();
    try {
      await logout();
    } catch {
      // The session may already be invalid — the account is gone either way.
    }
    if (Platform.OS === "web" && typeof location !== "undefined") {
      location.replace("/");
    } else {
      router.replace("/");
    }
  }, [realUser, logout]);

  const runDeletion = useCallback(async () => {
    setStep("running");
    setError("");
    try {
      await runAccountDeletion((progress) => {
        setStatus(deletePhaseLabel(progress.phase));
      });
      toast.success("Your account has been deleted.");
      await finishLocally();
    } catch (e) {
      if (e instanceof ReauthRequiredError) {
        // The login went stale mid-run. Only the user can fix it.
        setStep("reauth");
        setError("Confirm it is you and we will pick up where we left off.");
        return;
      }
      logError("deleteAccount.run", e);
      // Never claim success on a partial run, and never sign the user out on
      // failure — they need the session to retry.
      setError(e instanceof Error ? e.message : "Deletion failed.");
      setStep("failed");
    }
  }, [finishLocally]);

  const onReauth = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await reauthenticate({ method, password });
      setPassword("");
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await runDeletion();
    } finally {
      setBusy(false);
    }
  }, [method, password, runDeletion]);

  const body = useMemo(
    () => ({
      color: theme.colors.foreground,
      fontSize: theme.typography.sm,
      lineHeight: 20,
    }),
    [theme],
  );
  const muted = useMemo(
    () => ({
      color: theme.colors.mutedForeground,
      fontSize: theme.typography.sm,
      lineHeight: 20,
    }),
    [theme],
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{
        padding: theme.space.lg,
        paddingTop: insets.top + theme.space.lg,
        paddingBottom: insets.bottom + theme.space.xl,
        gap: theme.space.md,
      }}
    >
      <Text
        style={{
          color: theme.colors.foreground,
          fontSize: theme.typography.xl,
          fontWeight: "900",
        }}
      >
        Delete your account
      </Text>

      {step === "confirm" ? (
        <>
          <Text style={body}>
            This deletes one account that all three apps share. Everything below
            goes permanently and cannot be restored.
          </Text>
          <Text style={muted}>
            <Text style={{ fontWeight: "800" }}>Spendly</Text> — every
            transaction, account, budget, goal, investment, EPF record, vault
            and its expenses, and every split, payment request and share link
            you created. People you split with will lose those splits too.
          </Text>
          <Text style={muted}>
            <Text style={{ fontWeight: "800" }}>Nutrition</Text> — every food
            log, weight entry, goal and nutrition profile.
          </Text>
          <Text style={muted}>
            <Text style={{ fontWeight: "800" }}>Ganesh Seva</Text> — you are
            removed from every Pandal you belong to. The Pandal's own records
            and audit history stay with the Pandal, including your name on
            entries you recorded.
          </Text>
          <Text style={{ ...body, fontWeight: "700" }}>
            Type {DELETE_CONFIRM_TOKEN} to continue.
          </Text>
          <Input
            label=""
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={DELETE_CONFIRM_TOKEN}
          />
          <Button
            variant="destructive"
            disabled={!confirmed}
            onPress={() => setStep("reauth")}
          >
            Continue
          </Button>
          <Button variant="outline" onPress={() => router.back()}>
            Keep my account
          </Button>
        </>
      ) : null}

      {step === "reauth" ? (
        <>
          <Text style={body}>
            {method === "password"
              ? "Enter your password to confirm it is you."
              : method === "google"
                ? "Confirm with Google to continue."
                : "Sign out, sign back in, then come back here."}
          </Text>
          {method === "password" ? (
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Your password"
            />
          ) : null}
          {error ? (
            <Text style={{ color: theme.colors.destructive, fontSize: theme.typography.sm }}>
              {error}
            </Text>
          ) : null}
          {method === "password" || method === "google" ? (
            <Button variant="destructive" loading={busy} onPress={() => void onReauth()}>
              Confirm and delete
            </Button>
          ) : null}
          <Button variant="outline" onPress={() => router.back()}>
            Keep my account
          </Button>
        </>
      ) : null}

      {step === "running" ? (
        <View style={{ gap: theme.space.md, paddingVertical: theme.space.lg }}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={body}>{status || "Starting…"}</Text>
          <Text style={muted}>
            This can take a minute. Please keep the app open.
          </Text>
        </View>
      ) : null}

      {step === "failed" ? (
        <>
          <Text style={{ color: theme.colors.destructive, fontSize: theme.typography.sm }}>
            {error}
          </Text>
          <Button variant="destructive" onPress={() => void runDeletion()}>
            Try again
          </Button>
          <Button variant="outline" onPress={() => router.back()}>
            Back
          </Button>
        </>
      ) : null}
    </ScrollView>
  );
}
