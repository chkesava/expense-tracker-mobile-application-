import { useEffect } from "react";

import { setGlobalPendingSyncCount } from "@/lib/syncStatusStore";
import { useGaneshData } from "@/providers/GaneshDataProvider";

export function useGaneshSyncReporter() {
  const { collections, expenses, contributions, activity } = useGaneshData();

  useEffect(() => {
    setGlobalPendingSyncCount(
      collections.pendingCount +
        expenses.pendingCount +
        contributions.pendingCount +
        activity.pendingCount
    );
    return () => setGlobalPendingSyncCount(0);
  }, [
    activity.pendingCount,
    collections.pendingCount,
    contributions.pendingCount,
    expenses.pendingCount,
  ]);
}
