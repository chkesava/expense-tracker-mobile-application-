/**
 * Role from shared UserDoc listener (replaces Phase 2 one-shot getDoc).
 */

import { useUserDoc } from "@/providers/UserDocProvider";

export function useUserRole() {
  const { role, isAdmin, loading } = useUserDoc();
  return { role, isAdmin, loading };
}
