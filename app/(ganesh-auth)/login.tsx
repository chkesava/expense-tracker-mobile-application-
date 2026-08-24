import { useRef, useState } from "react";
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
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { Lock, Mail, Smartphone, User } from "lucide-react-native";

import { SocialLoginButton } from "@/components/auth/SocialLoginButton";
import { GaneshAuthBackground, GaneshMark, useGaneshTokens } from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ganeshPhoneCredential, requestGaneshPhoneVerification } from "@/lib/ganeshPhoneAuth";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { getFirebaseAuth, getFirestoreDb } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { upsertGaneshProfile } from "@/services/ganesh/ganeshProfile";
import { useTheme } from "@/theme/ThemeProvider";

export default function GaneshLoginScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const {
    user,
    loading,
    loginWithEmail,
    signUpWithEmail,
    loginWithGoogleIdToken,
    loginWithPhoneCredential,
  } = useAuth();
  const { setActiveWorkspace } = useWorkspace();
  const { replace } = useRouter();
  const webVerifier = useRef<undefined>(undefined);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [showPhone, setShowPhone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (user) {
    return <Redirect href={"/(ganesh)" as never} />;
  }

  const iconColor = theme.colors.mutedForeground;

  const finish = async () => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    const current = auth?.currentUser;
    if (db && current) {
      await upsertGaneshProfile(db, current);
    }
    await setActiveWorkspace("ganesh");
    replace("/(ganesh)" as never);
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
      await finish();
      toast.success("Welcome to Ganesh Seva");
    } catch (error) {
      logError("ganesh.login.google", error);
      let message = friendlyErrorMessage(error, "Google sign-in failed.");
      try {
        const { isErrorWithCode, statusCodes } = await import("@react-native-google-signin/google-signin");
        if (isErrorWithCode(error)) {
          if (error.code === statusCodes.SIGN_IN_CANCELLED) return;
          if (error.code === statusCodes.IN_PROGRESS) message = "Google sign-in is already in progress.";
          else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            message = "Google Play Services is not available on this device.";
          }
        }
      } catch {
        /* ignore */
      }
      if (!/cancelled/i.test(message)) toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const onEmail = async () => {
    setSubmitting(true);
    try {
      if (mode === "signup") {
        if (!displayName.trim()) throw new Error("Enter your name.");
        await signUpWithEmail(email, password, displayName);
      } else {
        await loginWithEmail(email, password);
      }
      await finish();
      toast.success("Welcome to Ganesh Seva");
    } catch (error) {
      logError("ganesh.login.email", error);
      toast.error(friendlyErrorMessage(error, "Could not sign in with email."));
    } finally {
      setSubmitting(false);
    }
  };

  const sendOtp = async () => {
    setSubmitting(true);
    try {
      const result = await requestGaneshPhoneVerification(phone, webVerifier.current);
      setVerificationId(result.verificationId);
      toast.success("OTP sent");
    } catch (error) {
      logError("ganesh.login.sendOtp", error);
      toast.error(friendlyErrorMessage(error, "Could not send OTP."));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmOtp = async () => {
    if (!verificationId) return;
    setSubmitting(true);
    try {
      await loginWithPhoneCredential(ganeshPhoneCredential(verificationId, otp), displayName);
      await finish();
    } catch (error) {
      logError("ganesh.login.confirmOtp", error);
      toast.error(friendlyErrorMessage(error, "Could not verify OTP."));
    } finally {
      setSubmitting(false);
    }
  };

  const emailDisabled = submitting || !email.trim() || !password;

  return (
    <SafeAreaView style={styles.fill} edges={["top", "bottom"]}>
      <GaneshAuthBackground />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInDown.duration(600).springify()} style={styles.header}>
            <GaneshMark size={84} />
            <View style={styles.headerText}>
              <Text
                style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}
              >
                Ganesh Seva
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
                ]}
              >
                Manage your Pandal&apos;s collections, contributions and expenses together.
              </Text>
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeInUp.duration(700).delay(100).springify()}
            style={[
              styles.surface,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.outlineVariant ?? theme.colors.border,
              },
              theme.elevation[2],
            ]}
          >
            <SocialLoginButton
              onPress={() => void onGoogle()}
              disabled={submitting}
              loading={submitting}
            />

            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: g.divider }]} />
              <Text
                style={[
                  styles.dividerText,
                  { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
                ]}
              >
                or continue with
              </Text>
              <View style={[styles.dividerLine, { backgroundColor: g.divider }]} />
            </View>

            {mode === "signup" ? (
              <Input
                label="Your name"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Ravi Kumar"
                autoCapitalize="words"
                leadingIcon={<User size={20} color={iconColor} />}
              />
            ) : null}

            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="you@example.com"
              leadingIcon={<Mail size={20} color={iconColor} />}
            />

            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              autoComplete={mode === "signup" ? "password-new" : "password"}
              leadingIcon={<Lock size={20} color={iconColor} />}
            />

            <Button
              loading={submitting}
              disabled={emailDisabled}
              size="lg"
              onPress={() => void onEmail()}
              style={{ backgroundColor: g.saffron }}
            >
              {mode === "signup" ? "Create account" : "Sign in"}
            </Button>

            <Pressable
              onPress={() => setMode((prev) => (prev === "signin" ? "signup" : "signin"))}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text
                style={[styles.link, { color: g.saffron, fontFamily: theme.fontFamily.semibold }]}
              >
                {mode === "signup"
                  ? "Already have an account? Sign in"
                  : "New here? Create an account"}
              </Text>
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(700).delay(200)} style={styles.phoneBlock}>
            {!showPhone ? (
              <Pressable onPress={() => setShowPhone(true)} hitSlop={8} accessibilityRole="button">
                <View style={styles.phoneToggle}>
                  <Smartphone size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />
                  <Text
                    style={[
                      styles.mutedLink,
                      { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium },
                    ]}
                  >
                    Continue with mobile OTP
                  </Text>
                </View>
              </Pressable>
            ) : (
              <View
                style={[
                  styles.surface,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.outlineVariant ?? theme.colors.border,
                  },
                ]}
              >
                {!verificationId ? (
                  <Input
                    label="Mobile number"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    placeholder="98765 43210"
                    leadingIcon={<Smartphone size={20} color={iconColor} />}
                  />
                ) : (
                  <>
                    <Input
                      label="Your name"
                      value={displayName}
                      onChangeText={setDisplayName}
                      placeholder="Ravi Kumar"
                      autoCapitalize="words"
                      leadingIcon={<User size={20} color={iconColor} />}
                    />
                    <Input
                      label="OTP"
                      value={otp}
                      onChangeText={setOtp}
                      keyboardType="number-pad"
                      placeholder="6-digit code"
                    />
                  </>
                )}

                <Button
                  loading={submitting}
                  variant="outline"
                  onPress={() => {
                    if (verificationId) void confirmOtp();
                    else void sendOtp();
                  }}
                >
                  {verificationId ? "Verify and continue" : "Send OTP"}
                </Button>

                {verificationId ? (
                  <Pressable onPress={() => setVerificationId(null)} hitSlop={8}>
                    <Text
                      style={[styles.link, { color: g.saffron, fontFamily: theme.fontFamily.semibold }]}
                    >
                      Use a different number
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )}

            <Pressable onPress={() => replace("/welcome" as never)} hitSlop={8}>
              <Text
                style={[
                  styles.mutedLink,
                  { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
                ]}
              >
                Choose Expense Tracker or Ganesh Seva
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
    gap: 28,
  },
  header: {
    alignItems: "center",
  },
  headerText: {
    marginTop: 16,
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 28,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 300,
  },
  surface: {
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 16,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: 13,
  },
  link: {
    fontSize: 14,
    textAlign: "center",
  },
  phoneBlock: {
    gap: 16,
  },
  phoneToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
  },
  mutedLink: {
    fontSize: 13.5,
    textAlign: "center",
  },
});
