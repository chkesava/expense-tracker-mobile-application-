import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import type { PandalJoinRequest } from "@/shared/types/ganesh";
import { where } from "firebase/firestore";

export function useJoinRequests(pandalId: string | null) {
  const { items, loading, error } = useGaneshCollection<PandalJoinRequest>(
    pandalId ? ["pandalJoinRequests"] : null,
    (id, data) => ({ id, ...(data as Omit<PandalJoinRequest, "id">) }),
    {
      extra: pandalId ? [where("pandalId", "==", pandalId)] : [],
    }
  );
  return {
    requests: items.filter((request) => request.status === "pending"),
    loading,
    error,
  };
}
