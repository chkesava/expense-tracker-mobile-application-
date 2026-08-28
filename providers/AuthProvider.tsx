/**
 * Auth provider — Firebase email/password + Google credential.
 * Phase 4: `user` may be a duress proxy (`uid + "_duress"`); `realUser` is always Firebase user.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type AuthCredential,
  type User,
  type UserCredential,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Platform } from "react-native";
import { GoogleSignin } from "@react-native-google-signin/google-signin";

import { clearSavedRoute } from "@/hooks/useNavigationStateRestoration";
import { logError } from "@/lib/errors";
import { ensureCategoryHierarchy } from "@/lib/ensureCategoryHierarchy";
import { env } from "@/lib/env";
import { getFirebaseAuth, getFirestoreDb } from "@/lib/firebase";
import { enforceGoogleSignupGate } from "@/lib/googleSignupGate";
import { perfMark } from "@/lib/perf";
import { privacySession } from "@/lib/privacySession";
import { authErrorMessage, createDuressUser } from "@/lib/authHelpers";
import { scheduleIdleWork } from "@/shared/utils/scheduleIdle";

const GOOGLE_WEB_CLIENT_ID =
  env.googleWebClientId ||
  "246872619658-5dm89l8189ql00m4ab84no0onon4osbk.apps.googleusercontent.com";

type AuthContextType = {
  user: User | null;
  realUser: User | null;
  loading: boolean;
  isDuress: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  loginWithGoogleIdToken: (idToken: string) => Promise<void>;
  loginWithPhoneCredential: (credential: AuthCredential, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [realUser, setRealUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDuress, setIsDuress] = useState(() => privacySession.isDuress());

  useEffect(() => {
    // Native sign-in only. On web every GoogleSignin method is a stub that
    // logs a sponsorship notice, and the public /split/:slug page renders
    // inside this provider — so an anonymous visitor would get that warning
    // in their console for a flow they can never reach.
    if (Platform.OS === "web") return;
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      offlineAccess: false,
    });
  }, []);

  useEffect(() => {
    return privacySession.subscribe(() => {
      setIsDuress(privacySession.isDuress());
    });
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    if (!auth) {
      setLoading(false);
      return;
    }

    let cancelHierarchy: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        privacySession.clearAll();
      }

      // Unblock first paint immediately; seed categories after interactions.
      setRealUser(currentUser);
      setLoading(false);
      perfMark("auth_ready");

      cancelHierarchy?.();
      cancelHierarchy = undefined;

      if (currentUser && db) {
        cancelHierarchy = scheduleIdleWork(
          () => {
            void ensureCategoryHierarchy(db, currentUser.uid).catch((error) => {
              logError("authProvider.ensuringCategoryHierarchyLogin", error);
            });
          },
          { fallbackDelayMs: 600, timeoutMs: 2500 }
        );
      }
    });

    return () => {
      cancelHierarchy?.();
      unsubscribe();
    };
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase Auth is not configured.");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      logError("authProvider.emailLogin", error);
      throw new Error(authErrorMessage(error, "Email login failed"));
    }
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName: string) => {
      const auth = getFirebaseAuth();
      const db = getFirestoreDb();
      if (!auth) throw new Error("Firebase Auth is not configured.");

      if (db) {
        const settingsSnap = await getDoc(doc(db, "system_settings", "global"));
        if (settingsSnap.exists() && settingsSnap.data().disableSignups) {
          throw new Error(
            "New registrations are temporarily disabled by the administrator."
          );
        }
      }

      try {
        const cred = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
        await updateProfile(cred.user, { displayName: displayName.trim() });
      } catch (error) {
        logError("authProvider.emailSignup", error);
        throw new Error(authErrorMessage(error, "Email signup failed"));
      }
    },
    []
  );

  const resetPassword = useCallback(async (email: string) => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase Auth is not configured.");
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (error) {
      logError("authProvider.passwordReset", error);
      throw new Error(authErrorMessage(error, "Password reset failed"));
    }
  }, []);

  const loginWithGoogleIdToken = useCallback(async (idToken: string) => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase Auth is not configured.");
    if (!idToken) throw new Error("Missing Google ID token.");

    try {
      const credential = GoogleAuthProvider.credential(idToken);
      const result: UserCredential = await signInWithCredential(auth, credential);
      await enforceGoogleSignupGate(result);
    } catch (error) {
      logError("authProvider.googleLogin", error);
      throw new Error(authErrorMessage(error, "Google sign-in failed"));
    }
  }, []);

  const loginWithPhoneCredential = useCallback(
    async (credential: AuthCredential, displayName?: string) => {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error("Firebase Auth is not configured.");
      try {
        const result = await signInWithCredential(auth, credential);
        const name = displayName?.trim();
        if (name && !result.user.displayName) {
          await updateProfile(result.user, { displayName: name });
        }
      } catch (error) {
        logError("authProvider.phoneLogin", error);
        throw new Error(authErrorMessage(error, "Phone sign-in failed"));
      }
    },
    []
  );

  const logout = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    const signedOutUid = auth.currentUser?.uid;
    try {
      privacySession.clearAll();
      // Otherwise the next account signing in on this device resumes into the
      // previous user's last screen — including their account detail routes.
      if (signedOutUid) await clearSavedRoute(signedOutUid);
      await GoogleSignin.signOut().catch(() => {});
      await signOut(auth);
    } catch (error) {
      logError("authProvider.logout", error);
      throw new Error(authErrorMessage(error, "Logout failed"));
    }
  }, []);

  const effectiveUser = useMemo(() => {
    if (!realUser) return null;
    if (isDuress) return createDuressUser(realUser);
    return realUser;
  }, [realUser, isDuress]);

  const value = useMemo<AuthContextType>(
    () => ({
      user: effectiveUser,
      realUser,
      loading,
      isDuress,
      loginWithEmail,
      signUpWithEmail,
      resetPassword,
      loginWithGoogleIdToken,
      loginWithPhoneCredential,
      logout,
    }),
    [
      effectiveUser,
      realUser,
      loading,
      isDuress,
      loginWithEmail,
      signUpWithEmail,
      resetPassword,
      loginWithGoogleIdToken,
      loginWithPhoneCredential,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
