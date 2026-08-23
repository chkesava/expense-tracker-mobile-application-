import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { PhoneAuthProvider, RecaptchaVerifier } from "firebase/auth";

import { getFirebaseAuth } from "@/lib/firebase";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Web-only reCAPTCHA bridge used by native Ganesh phone login.
 * Native opens this page, which returns `verificationId` on the redirect URI.
 */
export default function GaneshPhoneAuthBridge() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ phone?: string; redirect_uri?: string }>();
  const [message, setMessage] = useState("Preparing phone verification…");
  const started = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "web" || started.current) return;
    started.current = true;
    const auth = getFirebaseAuth();
    const phone = String(params.phone ?? "");
    const redirect = String(params.redirect_uri ?? "");
    if (!auth || !phone || !redirect) {
      setMessage("Missing phone number or redirect.");
      return;
    }

    let verifier: RecaptchaVerifier | null = null;
    const run = async () => {
      try {
        const host = document.getElementById("ganesh-recaptcha");
        if (!host) throw new Error("reCAPTCHA container missing.");
        verifier = new RecaptchaVerifier(auth, host, { size: "invisible" });
        const provider = new PhoneAuthProvider(auth);
        const verificationId = await provider.verifyPhoneNumber(phone, verifier);
        const joiner = redirect.includes("#") ? "&" : "#";
        window.location.assign(`${redirect}${joiner}verificationId=${encodeURIComponent(verificationId)}`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Phone verification failed.");
      }
    };
    void run();
    return () => {
      verifier?.clear();
    };
  }, [params.phone, params.redirect_uri]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.colors.background,
        padding: 24,
        gap: 12,
      }}
    >
      <ActivityIndicator color={theme.colors.primary} />
      <Text style={{ color: theme.colors.foreground, textAlign: "center" }}>{message}</Text>
      {Platform.OS === "web"
        ? // Web-only reCAPTCHA host. Native never renders this route in-app.
          (require("react") as typeof import("react")).createElement("div", {
            id: "ganesh-recaptcha",
          })
        : null}
    </View>
  );
}
