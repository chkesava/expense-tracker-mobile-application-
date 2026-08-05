/**
 * Google sign-in via the hosted web bridge (`/mobile-google-auth`).
 * Avoids Google OAuth rejecting Expo Go's `exp://` redirect URI.
 */
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { env } from "@/lib/env";

WebBrowser.maybeCompleteAuthSession();

export function isGoogleBridgeConfigured(): boolean {
  return Boolean(env.publicAppUrl);
}

export function extractIdTokenFromAuthUrl(url: string): string | null {
  try {
    const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
    if (hash) {
      const fromHash = new URLSearchParams(hash).get("id_token");
      if (fromHash) return fromHash;
    }

    const queryStart = url.indexOf("?");
    const queryEnd = url.indexOf("#");
    if (queryStart >= 0) {
      const query =
        queryEnd > queryStart
          ? url.slice(queryStart + 1, queryEnd)
          : url.slice(queryStart + 1);
      const fromQuery = new URLSearchParams(query).get("id_token");
      if (fromQuery) return fromQuery;
    }
  } catch {
    // Fall through.
  }
  return null;
}

/**
 * Opens the web Google bridge and returns a Firebase Google ID token.
 */
export async function signInWithGoogleViaWebBridge(): Promise<string> {
  const base = env.publicAppUrl.replace(/\/$/, "");
  if (!base) {
    throw new Error(
      "Set EXPO_PUBLIC_APP_URL to your web app URL (e.g. https://kesavaexpensetracker.netlify.app)."
    );
  }

  const redirectUri = Linking.createURL("google-auth");
  const authUrl = `${base}/mobile-google-auth?redirect_uri=${encodeURIComponent(redirectUri)}`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

  if (result.type === "cancel" || result.type === "dismiss") {
    throw new Error("Google sign-in was cancelled.");
  }

  if (result.type !== "success" || !("url" in result) || !result.url) {
    throw new Error("Google sign-in did not complete.");
  }

  const idToken = extractIdTokenFromAuthUrl(result.url);
  if (!idToken) {
    throw new Error("Google sign-in did not return an ID token.");
  }

  return idToken;
}
