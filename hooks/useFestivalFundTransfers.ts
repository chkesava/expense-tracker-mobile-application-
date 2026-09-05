import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import type { FestivalFundTransfer } from "@/shared/types/ganesh";
import { festivalCol } from "@/shared/utils/ganeshPaths";

/**
 * Money moved between this festival and the Permanent Fund (GS-079).
 *
 * Append-only by rule (GS-005), so these rows are the trail a transfer is
 * reconstructed from. Bounded per GS-065 — a festival has a handful of these,
 * so the cap is a guard against a runaway query rather than a page size.
 */
export function useFestivalFundTransfers(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error, retry } = useGaneshCollection<FestivalFundTransfer>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "fundTransfers") : null,
    (id, data) => ({ id, ...(data as Omit<FestivalFundTransfer, "id">) }),
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 200 }
  );
  return { transfers: items, loading, error, retry };
}
