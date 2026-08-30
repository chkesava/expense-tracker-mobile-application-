import { useGaneshData } from "@/providers/GaneshDataProvider";

export function useMyJoinRequests() {
  const { myJoinRequests } = useGaneshData();
  return {
    requests: myJoinRequests.items,
    pending: myJoinRequests.items.filter((request) => request.status === "pending"),
    rejected: myJoinRequests.items.filter((request) => request.status === "rejected"),
    loading: myJoinRequests.loading,
    error: myJoinRequests.error,
  };
}
