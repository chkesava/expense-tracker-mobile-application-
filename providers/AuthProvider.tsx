/**
 * Auth provider — Firebase email/password + Google credential.
 * Duress mode is deferred to Phase 4 (realUser === user for now).
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
  getAdditionalUserInfo,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
  type UserCredential,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { ensureCategoryHierarchy } from "@/lib/ensureCategoryHierarchy";
import { getFirebaseAuth, getFirestoreDb } from "@/lib/firebase";

type AuthContextType = {
  user: User | null;
  realUser: User | null;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** Sign in with a Google ID token from expo-auth-session. */
  loginWithGoogleIdToken: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function authErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: string }).message || fallback);
  }
  return fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser && db) {
        try {
          await ensureCategoryHierarchy(db, currentUser.uid);
        } catch (error) {
          console.error("Error ensuring category hierarchy on login:", error);
        }
      }
      setUser(currentUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase Auth is not configured.");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      console.error("Email login failed", error);
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
        console.error("Email signup failed", error);
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
      console.error("Password reset failed", error);
      throw new Error(authErrorMessage(error, "Password reset failed"));
    }
  }, []);

  const loginWithGoogleIdToken = useCallback(async (idToken: string) => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    if (!auth) throw new Error("Firebase Auth is not configured.");
    if (!idToken) throw new Error("Missing Google ID token.");

    try {
      const credential = GoogleAuthProvider.credential(idToken);
      const result: UserCredential = await signInWithCredential(auth, credential);
      const additionalInfo = getAdditionalUserInfo(result);

      if (additionalInfo?.isNewUser && db) {
        const settingsSnap = await getDoc(doc(db, "system_settings", "global"));
        if (settingsSnap.exists() && settingsSnap.data().disableSignups) {
          await result.user.delete();
          throw new Error(
            "New registrations are temporarily disabled by the administrator."
          );
        }
      }
    } catch (error) {
      console.error("Google login failed", error);
      throw new Error(authErrorMessage(error, "Google sign-in failed"));
    }
  }, []);

  const logout = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
      throw new Error(authErrorMessage(error, "Logout failed"));
    }
  }, []);

  // Phase 4 will introduce duress; for Phase 2 effective user === real user.
  const value = useMemo<AuthContextType>(
    () => ({
      user,
      realUser: user,
      loading,
      loginWithEmail,
      signUpWithEmail,
      resetPassword,
      loginWithGoogleIdToken,
      logout,
    }),
    [
      user,
      loading,
      loginWithEmail,
      signUpWithEmail,
      resetPassword,
      loginWithGoogleIdToken,
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
