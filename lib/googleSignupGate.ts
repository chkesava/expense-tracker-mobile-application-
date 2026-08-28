/**
 * Shared "disable signups" enforcement for Google sign-in, so the admin
 * kill-switch (system_settings/global.disableSignups) applies identically
 * whether a new Firebase user was created via the native ID-token exchange
 * (providers/AuthProvider.tsx's loginWithGoogleIdToken) or the web
 * signInWithPopup flow (lib/googleSignIn.web.ts).
 */
import { getAdditionalUserInfo, type UserCredential } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";

export async function enforceGoogleSignupGate(result: UserCredential): Promise<void> {
  const db = getFirestoreDb();
  const additionalInfo = getAdditionalUserInfo(result);
  if (additionalInfo?.isNewUser && db) {
    const settingsSnap = await getDoc(doc(db, "system_settings", "global"));
    if (settingsSnap.exists() && settingsSnap.data().disableSignups) {
      await result.user.delete();
      throw new Error("New registrations are temporarily disabled by the administrator.");
    }
  }
}
