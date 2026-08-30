import { useGaneshData } from "@/providers/GaneshDataProvider";
import { EMPTY_GANESH_SUMMARY } from "@/shared/types/ganesh";

/**
 * The festival summary document: the single source of truth for every displayed
 * balance, the God Fund spend guard and the settlement figure.
 */
export function useGaneshSummary(pandalId: string | null, festivalId: string | null) {
  const data = useGaneshData();
  const matches =
    Boolean(pandalId && festivalId) &&
    pandalId === data.sessionPandalId &&
    festivalId === data.sessionFestivalId;

  if (!matches) {
    return {
      summary: EMPTY_GANESH_SUMMARY,
      loading: false,
      pendingWrite: false,
      error: null,
      retry: () => undefined,
    };
  }

  return {
    summary: data.summary,
    loading: data.summaryLoading,
    pendingWrite: data.summaryPendingWrite,
    error: data.summaryError,
    retry: data.retrySummary,
  };
}
