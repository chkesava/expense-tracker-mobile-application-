import { useEffect } from "react";

import { setGlobalPendingSyncCount } from "@/lib/syncStatusStore";
import { useCollections } from "@/hooks/useCollections";
import { useContributions } from "@/hooks/useContributions";
import { useGaneshActivity } from "@/hooks/useGaneshActivity";
import { useGaneshExpenses } from "@/hooks/useGaneshExpenses";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";

export function useGaneshSyncReporter() {
  const { pandalId, festivalId } = useGaneshSession();
  const { pendingCount: collections } = useCollections(pandalId, festivalId);
  const { pendingCount: expenses } = useGaneshExpenses(pandalId, festivalId);
  const { pendingCount: contributions } = useContributions(pandalId, festivalId);
  const { pendingCount: activity } = useGaneshActivity(pandalId, festivalId);

  useEffect(() => {
    setGlobalPendingSyncCount(collections + expenses + contributions + activity);
    return () => setGlobalPendingSyncCount(0);
  }, [activity, collections, contributions, expenses]);
}
