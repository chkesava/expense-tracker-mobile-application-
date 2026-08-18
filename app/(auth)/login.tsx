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
import { LinearGradient } from "expo-linear-gradient";
import { Mail, Lock, Eye, EyeOff } from "lucide-react-native";
import Animated, { FadeInUp, FadeInDown } from "react-native-reanimated";

import { Input } from "@/components/ui/Input";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { useTheme } from "@/theme/ThemeProvider";

import { SpendlyLogo } from "@/components/auth/SpendlyLogo";
import { AuthBackground } from "@/components/auth/AuthBackground";
import { SocialLoginButton } from "@/components/auth/SocialLoginButton";

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
  const [secureText, setSecureText] = useState(true);

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

  const isDark = theme.colors.background === "#020817" || theme.colors.background === "#000000";
  const iconColor = isDark ? "#94A3B8" : "#64748B";

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      if (mode === "login") {
        await loginWithEmail(email, password);
        toast.success("Welcome back!");
      } else if (mode === "signup") {
        if (settings.disableSignups) {
          throw new Error("New registrations are temporarily disabled by the administrator.");
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
      logError("auth.submit", error, { mode });
      toast.error(friendlyErrorMessage(error, "Sign-in failed. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogle = async () => {
    setSubmitting(true);
    try {
      const { GoogleSignin, isSuccessResponse } = await import("@react-native-google-signin/google-signin");

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();

      if (!isSuccessResponse(result)) return;

      const idToken = result.data.idToken;
      if (!idToken) {
        throw new Error("Google did not return an ID token. Check that the Web client ID is configured.");
      }

      await loginWithGoogleIdToken(idToken);
      toast.success("Welcome!");
    } catch (error) {
      logError("auth.google", error);
      let message = friendlyErrorMessage(error, "Google sign-in failed.");

      try {
        const { isErrorWithCode, statusCodes } = await import("@react-native-google-signin/google-signin");
        if (isErrorWithCode(error)) {
          if (error.code === statusCodes.SIGN_IN_CANCELLED) return;
          if (error.code === statusCodes.IN_PROGRESS) message = "Google sign-in is already in progress.";
          else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) message = "Google Play Services is not available on this device.";
          else if (String(error.code) === "10") message = "Google Sign-In configuration error. Add the release signing SHA-1 in Firebase.";
        }
      } catch {}

      if (!/cancelled/i.test(message)) toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const ctaDisabled = submitting || !email.trim() || (mode !== "forgot" && !password) || (mode === "signup" && settings.disableSignups);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <AuthBackground />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header & Logo Area */}
          <Animated.View entering={FadeInDown.duration(600).springify()} style={styles.headerArea}>
            <SpendlyLogo size={88} />
            <View style={{ marginTop: 24, alignItems: "center" }}>
              <Text style={[styles.title, { color: isDark ? "#F8FAFC" : "#0B172A", fontFamily: theme.fontFamily.bold }]}>
                {mode === "login" ? "Welcome back" : mode === "signup" ? "Create an account" : "Reset Password"}
              </Text>
              <Text style={[styles.subtitle, { color: isDark ? "#94A3B8" : "#64748B", fontFamily: theme.fontFamily.regular }]}>
                {mode === "login"
                  ? "Sign in to access your vault"
                  : mode === "signup"
                  ? "Join Spendly to organize your finances"
                  : "We'll send recovery instructions"}
              </Text>
            </View>
          </Animated.View>

          {/* Form Surface */}
          <Animated.View 
            entering={FadeInUp.duration(700).delay(100).springify()}
            style={[
              styles.formSurface,
              { 
                backgroundColor: isDark ? "#1E293B" : "#FFFFFF",
                shadowColor: isDark ? "#000" : "#0875D1",
                borderColor: isDark ? "#334155" : "#F1F5F9",
              }
            ]}
          >
            {mode === "signup" && (
              <Input
                label="Full name"
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                placeholder="Your name"
                leadingIcon={<View style={styles.iconBox}><Mail color={iconColor} size={20} /></View>}
              />
            )}

            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              autoComplete="email"
              leadingIcon={<View style={styles.iconBox}><Mail color={iconColor} size={20} /></View>}
            />

            {mode !== "forgot" && (
              <View>
                <View style={styles.passwordHeader}>
                  <Text style={[styles.label, { color: isDark ? "#F8FAFC" : "#0B172A", fontFamily: theme.fontFamily.medium }]}>
                    Password
                  </Text>
                  {mode === "login" && (
                    <Pressable onPress={() => setMode("forgot")} hitSlop={8}>
                      <Text style={[styles.forgotText, { color: "#19C79A", fontFamily: theme.fontFamily.medium }]}>
                        Forgot password?
                      </Text>
                    </Pressable>
                  )}
                </View>
                <Input
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={secureText}
                  placeholder="••••••••"
                  autoComplete={mode === "login" ? "password" : "password-new"}
                  leadingIcon={<View style={styles.iconBox}><Lock color={iconColor} size={20} /></View>}
                  trailingIcon={
                    <Pressable onPress={() => setSecureText(!secureText)} hitSlop={12} style={styles.iconBox}>
                      {secureText ? <EyeOff color={iconColor} size={20} /> : <Eye color={iconColor} size={20} />}
                    </Pressable>
                  }
                />
              </View>
            )}

            {/* Primary Gradient Button */}
            <Pressable onPress={onSubmit} disabled={ctaDisabled} style={{ marginTop: 8 }}>
              {({ pressed }) => (
                <View style={[styles.ctaWrapper, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }, ctaDisabled && { opacity: 0.5 }]}>
                  <LinearGradient
                    colors={["#0875D1", "#19C79A"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.ctaGradient}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={[styles.ctaText, { fontFamily: theme.fontFamily.semibold }]}>
                        {mode === "login" ? "Sign in" : mode === "signup" ? (settings.disableSignups ? "Signups disabled" : "Create account") : "Send Reset Link"}
                      </Text>
                    )}
                  </LinearGradient>
                </View>
              )}
            </Pressable>

            {mode === "login" && (
              <>
                <View style={styles.dividerBox}>
                  <View style={[styles.dividerLine, { backgroundColor: isDark ? "#334155" : "#E2E8F0" }]} />
                  <Text style={[styles.dividerText, { color: isDark ? "#64748B" : "#94A3B8" }]}>or continue with</Text>
                  <View style={[styles.dividerLine, { backgroundColor: isDark ? "#334155" : "#E2E8F0" }]} />
                </View>
                <SocialLoginButton onPress={onGoogle} loading={submitting} disabled={submitting} />
              </>
            )}
          </Animated.View>

          {/* Footer toggle */}
          {mode !== "login" ? (
            <Animated.View entering={FadeInUp.duration(700).delay(300)} style={styles.footer}>
              <Text style={{ color: isDark ? "#94A3B8" : "#64748B", fontSize: 15 }}>Remembered your password?</Text>
              <Pressable onPress={() => setMode("login")} hitSlop={8}>
                <Text style={{ color: "#19C79A", fontSize: 15, fontFamily: theme.fontFamily.semibold, marginLeft: 4 }}>Sign in</Text>
              </Pressable>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInUp.duration(700).delay(300)} style={styles.footer}>
              <Text style={{ color: isDark ? "#94A3B8" : "#64748B", fontSize: 15 }}>Don't have an account?</Text>
              <Pressable onPress={() => setMode("signup")} disabled={settings.disableSignups} hitSlop={8}>
                <Text style={{ color: settings.disableSignups ? "#94A3B8" : "#19C79A", fontSize: 15, fontFamily: theme.fontFamily.semibold, marginLeft: 4 }}>
                  Create account
                </Text>
              </Pressable>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
    gap: 32,
  },
  headerArea: {
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
  },
  formSurface: {
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 4,
    gap: 20,
  },
  iconBox: {
    width: 24,
    alignItems: "center",
  },
  passwordHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
  forgotText: {
    fontSize: 13,
  },
  ctaWrapper: {
    borderRadius: 16,
    overflow: "hidden",
  },
  ctaGradient: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 17,
    letterSpacing: 0.2,
  },
  dividerBox: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 14,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  }
});
