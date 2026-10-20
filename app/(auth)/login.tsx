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
import { Redirect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Mail, Lock, Eye, EyeOff } from "lucide-react-native";
import Animated, { FadeInUp, FadeInDown } from "react-native-reanimated";

import { Input } from "@/components/ui/Input";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { describeGoogleSignInError, signInWithGoogle } from "@/lib/googleSignIn";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { ACTIVE_PRODUCT, activeProductRootRoute } from "@/lib/activeProduct";
import { authPalette, usesExpenseLook } from "@/lib/authLook";

import { SpendlyLogo } from "@/components/auth/SpendlyLogo";
import { AuthBackground } from "@/components/auth/AuthBackground";
import { SocialLoginButton } from "@/components/auth/SocialLoginButton";
import { SpendlyUIScope } from "@/components/layout/SpendlyUIScope";

type AuthMode = "login" | "signup" | "forgot";

export default function AuthScreen() {
  const { theme } = useTheme();
  const { replace } = useRouter();
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
    return <Redirect href={activeProductRootRoute() as never} />;
  }

  // SPENDLY-556: Expense follows the theme (Midnight Emerald); Nutrition, which
  // shares this screen, keeps its exact previous colours.
  const expenseLook = usesExpenseLook(ACTIVE_PRODUCT);
  const p = authPalette(theme, expenseLook);
  const iconColor = p.icon;

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
      const outcome = await signInWithGoogle();
      if (outcome.status === "cancelled") return;
      if (outcome.status === "id-token") await loginWithGoogleIdToken(outcome.idToken);
      // "signed-in": web's signInWithPopup already established the Firebase
      // session; AuthProvider's onAuthStateChanged listener picks it up.
      toast.success("Welcome!");
    } catch (error) {
      logError("auth.google", error);
      const specific = await describeGoogleSignInError(error);
      if (specific === "cancelled") return;
      toast.error(specific ?? friendlyErrorMessage(error, "Google sign-in failed."));
    } finally {
      setSubmitting(false);
    }
  };

  const ctaDisabled = submitting || !email.trim() || (mode !== "forgot" && !password) || (mode === "signup" && settings.disableSignups);

  const screen = (
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
              <Text style={[styles.title, { color: p.title, fontFamily: theme.fontFamily.bold }]}>
                {mode === "login" ? "Welcome back" : mode === "signup" ? "Create an account" : "Reset Password"}
              </Text>
              <Text style={[styles.subtitle, { color: p.muted, fontFamily: theme.fontFamily.regular }]}>
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
                backgroundColor: p.surface,
                shadowColor: p.surfaceShadow,
                borderColor: p.surfaceBorder,
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
                  <Text style={[styles.label, { color: p.title, fontFamily: theme.fontFamily.medium }]}>
                    Password
                  </Text>
                  {mode === "login" && (
                    <Pressable onPress={() => setMode("forgot")} hitSlop={8}>
                      <Text style={[styles.forgotText, { color: p.link, fontFamily: theme.fontFamily.medium }]}>
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
                    colors={p.cta}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.ctaGradient}
                  >
                    {submitting ? (
                      <ActivityIndicator color={p.ctaText} />
                    ) : (
                      <Text style={[styles.ctaText, { color: p.ctaText, fontFamily: theme.fontFamily.semibold }]}>
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
                  <View style={[styles.dividerLine, { backgroundColor: p.divider }]} />
                  <Text style={[styles.dividerText, { color: p.dividerText }]}>or continue with</Text>
                  <View style={[styles.dividerLine, { backgroundColor: p.divider }]} />
                </View>
                <SocialLoginButton onPress={onGoogle} loading={submitting} disabled={submitting} />
              </>
            )}
          </Animated.View>

          {/* Footer toggle */}
          {mode !== "login" ? (
            <Animated.View entering={FadeInUp.duration(700).delay(300)} style={styles.footer}>
              <Text style={{ color: p.muted, fontSize: 15 }}>Remembered your password?</Text>
              <Pressable onPress={() => setMode("login")} hitSlop={8}>
                <Text style={{ color: p.link, fontSize: 15, fontFamily: theme.fontFamily.semibold, marginLeft: 4 }}>Sign in</Text>
              </Pressable>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInUp.duration(700).delay(300)} style={styles.footer}>
              <Text style={{ color: p.muted, fontSize: 15 }}>Don't have an account?</Text>
              <Pressable onPress={() => setMode("signup")} disabled={settings.disableSignups} hitSlop={8}>
                <Text style={{ color: settings.disableSignups ? p.linkDisabled : p.link, fontSize: 15, fontFamily: theme.fontFamily.semibold, marginLeft: 4 }}>
                  Create account
                </Text>
              </Pressable>
            </Animated.View>
          )}
          <Pressable onPress={() => replace("/welcome" as never)} hitSlop={8}>
            <Text style={{ color: p.muted, textAlign: "center", fontSize: 14 }}>
              Choose Expense Tracker or Ganesh Seva
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  // This screen sits outside the (app) SpendlyUIScope, so the shared Input
  // fell back to the default Gluestack palette (dark labels on Midnight
  // Emerald). Expense gets the theme scope; Nutrition keeps what it had.
  return expenseLook ? <SpendlyUIScope>{screen}</SpendlyUIScope> : screen;
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
