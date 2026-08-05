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
import { privacySession } from "@/lib/privacySession";

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
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function authErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: string }).message || fallback);
  }
  return fallback;
}

function createDuressUser(real: User): User {
  const duressUser = Object.create(real) as User;
  Object.defineProperty(duressUser, "uid", {
    get: () => `${real.uid}_duress`,
    enumerable: true,
  });
  return duressUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [realUser, setRealUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDuress, setIsDuress] = useState(() => privacySession.isDuress());

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

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser && db) {
        try {
          await ensureCategoryHierarchy(db, currentUser.uid);
        } catch (error) {
          console.error("Error ensuring category hierarchy on login:", error);
        }
      }
      if (!currentUser) {
        privacySession.clearAll();
      }
      setRealUser(currentUser);
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
      privacySession.clearAll();
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
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
