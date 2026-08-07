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
      const { GoogleSignin, isSuccessResponse } = await import(
        "@react-native-google-signin/google-signin"
      );

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();

      if (!isSuccessResponse(result)) {
        // User dismissed the account picker — not an error.
        return;
      }

      const idToken = result.data.idToken;
      if (!idToken) {
        throw new Error(
          "Google did not return an ID token. Check that the Web client ID is configured."
        );
      }

      await loginWithGoogleIdToken(idToken);
      toast.success("Welcome!");
    } catch (error) {
      let message =
        error instanceof Error ? error.message : "Google sign-in failed";

      try {
        const { isErrorWithCode, statusCodes } = await import(
          "@react-native-google-signin/google-signin"
        );
        if (isErrorWithCode(error)) {
          if (error.code === statusCodes.SIGN_IN_CANCELLED) {
            return;
          }
          if (error.code === statusCodes.IN_PROGRESS) {
            message = "Google sign-in is already in progress.";
          } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            message = "Google Play Services is not available on this device.";
          } else if (String(error.code) === "10") {
            message =
              "Google Sign-In configuration error (SHA-1 / package name). Add the release signing SHA-1 in Firebase.";
          }
        }
      } catch {
        // Module helpers unavailable — keep generic message.
      }

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
                  disabled={submitting}
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
