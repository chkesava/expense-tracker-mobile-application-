import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { SocialLoginButton } from "@/components/auth/SocialLoginButton";
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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (user) {
    return <Redirect href={"/(ganesh)" as never} />;
  }

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 16, flexGrow: 1, justifyContent: "center" }}>
          <Text style={{ fontSize: 18, textAlign: "center" }}>🙏</Text>
          <Text style={{ color: theme.colors.foreground, fontSize: 28, fontWeight: "800", textAlign: "center" }}>
            Ganesh Seva
          </Text>
          <Text style={{ color: theme.colors.mutedForeground, textAlign: "center", lineHeight: 22 }}>
            Shared Pandal hisab for Ganesh Utsav. Sign in with Google, email, or mobile. This never
            opens Expense Tracker.
          </Text>

          <SocialLoginButton onPress={() => void onGoogle()} disabled={submitting} loading={submitting} />

          {mode === "signup" ? (
            <Input label="Your name" value={displayName} onChangeText={setDisplayName} placeholder="Ravi Kumar" />
          ) : null}
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="you@example.com"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
          />
          <Button loading={submitting} onPress={() => void onEmail()}>
            {mode === "signup" ? "Create account" : "Continue with email"}
          </Button>
          <Pressable onPress={() => setMode((prev) => (prev === "signin" ? "signup" : "signin"))}>
            <Text style={{ color: theme.colors.primary, textAlign: "center", fontWeight: "600" }}>
              {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
            </Text>
          </Pressable>

          {!showPhone ? (
            <Pressable onPress={() => setShowPhone(true)}>
              <Text style={{ color: theme.colors.mutedForeground, textAlign: "center" }}>
                Or continue with mobile OTP
              </Text>
            </Pressable>
          ) : (
            <View style={{ gap: 12 }}>
              {!verificationId ? (
                <Input
                  label="Mobile number"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="98765 43210"
                />
              ) : (
                <>
                  <Input
                    label="Your name"
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Ravi Kumar"
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
                <Pressable onPress={() => setVerificationId(null)}>
                  <Text style={{ color: theme.colors.primary, textAlign: "center", fontWeight: "600" }}>
                    Use a different number
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}

          <Pressable onPress={() => replace("/welcome" as never)}>
            <Text style={{ color: theme.colors.mutedForeground, textAlign: "center" }}>
              Choose Expense Tracker or Ganesh Seva
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
