import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  isGoogleBridgeConfigured,
  signInWithGoogleViaWebBridge,
} from "@/lib/googleAuthBridge";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { useTheme } from "@/theme/ThemeProvider";

type AuthMode = "login" | "signup" | "forgot";

export default function AuthScreen() {
  const { theme } = useTheme();
  const { user, loading: authLoading, loginWithEmail, signUpWithEmail, resetPassword, loginWithGoogleIdToken } =
    useAuth();
  const { settings } = useSystemSettings();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const googleConfigured = isGoogleBridgeConfigured();

  if (authLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(app)" />;
  }

  const title =
    mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Reset password";
  const subtitle =
    mode === "login"
      ? "Enter your credentials to access your vault."
      : mode === "signup"
        ? "Create an account to start tracking your money."
        : "We'll send recovery instructions to your inbox.";

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      if (mode === "login") {
        await loginWithEmail(email, password);
        toast.success("Welcome back!");
      } else if (mode === "signup") {
        if (settings.disableSignups) {
          throw new Error(
            "New registrations are temporarily disabled by the administrator."
          );
        }
        if (!displayName.trim()) throw new Error("Please enter your name");
        await signUpWithEmail(email, password, displayName);
        toast.success("Account created successfully!");
      } else {
        await resetPassword(email);
        toast.success("Password reset email sent!");
        setMode("login");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogle = async () => {
    setSubmitting(true);
    try {
      let idToken: string | null = null;
      try {
        const { GoogleSignin } = require("@react-native-google-signin/google-signin");
        const hasPlayServices = await GoogleSignin.hasPlayServices();
        if (hasPlayServices) {
          const res = await GoogleSignin.signIn();
          idToken = res.data?.idToken ?? null;
        }
      } catch (nativeError) {
        console.log("Native Google Sign-In failed or not supported in this environment, attempting web bridge fallback", nativeError);
      }

      if (!idToken) {
        if (!googleConfigured) {
          toast.error("Set EXPO_PUBLIC_APP_URL to your deployed web app URL.");
          return;
        }
        idToken = await signInWithGoogleViaWebBridge();
      }

      if (idToken) {
        await loginWithGoogleIdToken(idToken);
        toast.success("Welcome!");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Google sign-in failed";
      if (!/cancelled/i.test(message)) {
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: theme.space.lg,
            gap: theme.space.lg,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: "center", gap: theme.space.xs }}>
            <Text
              style={{
                color: theme.colors.foreground,
                fontSize: theme.typography.xxl,
                fontWeight: "900",
              }}
            >
              Vault
            </Text>
            <Text
              style={{
                color: theme.colors.mutedForeground,
                fontSize: theme.typography.xs,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Personal finance, calmly organized
            </Text>
          </View>

          <Card title={title} subtitle={subtitle}>
            <View style={{ gap: theme.space.md }}>
              {mode === "signup" ? (
                <Input
                  label="Full name"
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                  placeholder="Your name"
                />
              ) : null}

              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
                autoComplete="email"
              />

              {mode !== "forgot" ? (
                <Input
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="••••••••"
                  autoComplete={mode === "login" ? "password" : "password-new"}
                />
              ) : null}

              <Button
                loading={submitting}
                onPress={onSubmit}
                disabled={
                  submitting ||
                  !email.trim() ||
                  (mode !== "forgot" && !password) ||
                  (mode === "signup" && settings.disableSignups)
                }
              >
                {mode === "login"
                  ? "Sign in"
                  : mode === "signup"
                    ? settings.disableSignups
                      ? "Signups disabled"
                      : "Create account"
                    : "Send reset email"}
              </Button>

              {mode === "login" ? (
                <Button
                  variant="outline"
                  loading={submitting}
                  disabled={submitting || !googleConfigured}
                  onPress={onGoogle}
                >
                  Continue with Google
                </Button>
              ) : null}

              <View style={{ gap: theme.space.sm, marginTop: theme.space.sm }}>
                {mode !== "login" ? (
                  <ModeLink label="Back to sign in" onPress={() => setMode("login")} />
                ) : null}
                {mode === "login" ? (
                  <>
                    <ModeLink
                      label="Create an account"
                      onPress={() => setMode("signup")}
                      disabled={settings.disableSignups}
                    />
                    <ModeLink
                      label="Forgot password?"
                      onPress={() => setMode("forgot")}
                    />
                  </>
                ) : null}
              </View>
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ModeLink({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button">
      <Text
        style={{
          color: disabled ? theme.colors.mutedForeground : theme.colors.primary,
          textAlign: "center",
          fontWeight: "600",
          fontSize: theme.typography.sm,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
