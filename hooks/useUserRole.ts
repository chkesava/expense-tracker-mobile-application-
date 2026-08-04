/**
 * Minimal role reader for maintenance bypass (full UserDoc arrives in Phase 3).
 */

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import type { UserRole } from "@/shared/types/user";

export function useUserRole() {
  const { realUser } = useAuth();
  const [role, setRole] = useState<UserRole>("USER");
  const [loading, setLoading] = useState(Boolean(realUser));

  useEffect(() => {
    const db = getFirestoreDb();
    if (!realUser || !db) {
      setRole("USER");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getDoc(doc(db, "users", realUser.uid))
      .then((snap) => {
        if (cancelled) return;
        const next = snap.data()?.role;
        setRole(next === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER");
      })
      .catch((error) => {
        console.error("Error reading user role:", error);
        if (!cancelled) setRole("USER");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [realUser]);

  return {
    role,
    isAdmin: role === "SUPER_ADMIN",
    loading,
  };
}
