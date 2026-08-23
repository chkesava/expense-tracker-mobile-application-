import { where } from "firebase/firestore";

import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { useAuth } from "@/providers/AuthProvider";
import type { PandalJoinRequest } from "@/shared/types/ganesh";

export function useMyJoinRequests() {
  const { realUser } = useAuth();
  const uid = realUser?.uid ?? null;
  const { items, loading, error } = useGaneshCollection<PandalJoinRequest>(
    uid ? ["pandalJoinRequests"] : null,
    (id, data) => ({ id, ...(data as Omit<PandalJoinRequest, "id">) }),
    {
      extra: uid ? [where("userId", "==", uid)] : [],
      enabled: Boolean(uid),
    }
  );
  return {
    requests: items,
    pending: items.filter((request) => request.status === "pending"),
    rejected: items.filter((request) => request.status === "rejected"),
    loading,
    error,
  };
}
