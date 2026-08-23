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

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ganeshPhoneCredential, requestGaneshPhoneVerification } from "@/lib/ganeshPhoneAuth";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function GaneshLoginScreen() {
  const { theme } = useTheme();
  const { user, loading, loginWithPhoneCredential } = useAuth();
  const { setActiveWorkspace } = useWorkspace();
  const { replace } = useRouter();
  const webVerifier = useRef<undefined>(undefined);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [verificationId, setVerificationId] = useState<string | null>(null);
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
      await setActiveWorkspace("ganesh");
      replace("/(ganesh)" as never);
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
            Shared Pandal hisab for Ganesh Utsav. Continue with your mobile number.
          </Text>
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
            onPress={() => {
              if (verificationId) void confirmOtp();
              else void sendOtp();
            }}
          >
            {verificationId ? "Verify and continue" : "Continue with Mobile"}
          </Button>
          {verificationId ? (
            <Pressable onPress={() => setVerificationId(null)}>
              <Text style={{ color: theme.colors.primary, textAlign: "center", fontWeight: "600" }}>
                Use a different number
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              void setActiveWorkspace("expense");
            }}
          >
            <Text style={{ color: theme.colors.mutedForeground, textAlign: "center" }}>
              Back to Expense Tracker
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
