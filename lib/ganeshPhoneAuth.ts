import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import {
  PhoneAuthProvider,
  RecaptchaVerifier,
  type ApplicationVerifier,
} from "firebase/auth";

import { env } from "@/lib/env";
import { getFirebaseAuth } from "@/lib/firebase";
import { indianPhoneToE164 } from "@/shared/utils/ganeshIdentity";

WebBrowser.maybeCompleteAuthSession();

export function extractVerificationIdFromUrl(url: string): string | null {
  try {
    const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
    if (hash) {
      const fromHash = new URLSearchParams(hash).get("verificationId");
      if (fromHash) return fromHash;
    }
    const queryStart = url.indexOf("?");
    if (queryStart >= 0) {
      const fromQuery = new URLSearchParams(url.slice(queryStart + 1)).get("verificationId");
      if (fromQuery) return fromQuery;
    }
  } catch {
    // Fall through.
  }
  return null;
}

export async function requestGaneshPhoneVerification(
  rawPhone: string,
  webVerifier?: ApplicationVerifier | RecaptchaVerifier
): Promise<{ verificationId: string; phoneNumber: string }> {
  const phoneNumber = indianPhoneToE164(rawPhone);
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase Auth is not configured.");

  if (Platform.OS === "web" && webVerifier) {
    const provider = new PhoneAuthProvider(auth);
    const verificationId = await provider.verifyPhoneNumber(phoneNumber, webVerifier);
    return { verificationId, phoneNumber };
  }

  const base = env.publicAppUrl.replace(/\/$/, "");
  if (!base) {
    throw new Error(
      "Phone sign-in on this device needs EXPO_PUBLIC_APP_URL so reCAPTCHA can run in a browser."
    );
  }

  const redirectUri = Linking.createURL("ganesh-phone-auth");
  const authUrl = `${base}/ganesh-phone-auth?phone=${encodeURIComponent(phoneNumber)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
  if (result.type === "cancel" || result.type === "dismiss") {
    throw new Error("Phone verification was cancelled.");
  }
  if (result.type !== "success" || !("url" in result) || !result.url) {
    throw new Error("Phone verification did not complete.");
  }
  const verificationId = extractVerificationIdFromUrl(result.url);
  if (!verificationId) {
    throw new Error("Phone verification did not return a code challenge.");
  }
  return { verificationId, phoneNumber };
}

export function ganeshPhoneCredential(verificationId: string, otp: string) {
  return PhoneAuthProvider.credential(verificationId, otp.trim());
}
