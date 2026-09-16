import { useMemo } from "react";

import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import type {
  TokenDrawResult,
  TokenDrawSession,
  TokenLadduConfig,
  TokenLadduRegistration,
  TokenLadduToken,
} from "@/shared/types/ganeshTokenLaddu";
import { EMPTY_TOKEN_LADDU_CONFIG } from "@/shared/types/ganeshTokenLaddu";
import { festivalCol } from "@/shared/utils/ganeshPaths";
import { readTokenCapacity } from "@/shared/utils/ganeshTokenLaddu";

/**
 * Token Laddu reads (KAN-125).
 *
 * Local listeners rather than slices on `GaneshDataProvider`: this screen is
 * reached from the Pandal menu, not from a tab, so the provider would hold four
 * extra subscriptions open for every session that never opens it. Same choice
 * `useCollectionSessions` made, for the same reason.
 *
 * Every listener is bounded, per GS-065. The caps below are an upper bound on a
 * runaway query rather than a page size — a pandal's pot is hundreds of laddus,
 * and the screen filters in memory so no composite index is needed (the
 * indexes file is a strict subset of the live project, so adding one is a
 * deploy hazard rather than a free action).
 */

/** The per-festival singleton. Read through the collection primitive so the config arrives on the same subscription machinery as everything else. */
export function useTokenLadduConfig(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error, retry } = useGaneshCollection<TokenLadduConfig & { id: string }>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "tokenLadduConfig") : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as TokenLadduConfig),
      pendingWrite,
    }),
    // One document by construction; the cap is belt and braces.
    { limitTo: 2 }
  );

  const config = items.find((item) => item.id === "current") ?? null;
  const capacity = useMemo(() => readTokenCapacity(config), [config]);

  return {
    /** Never null, so a screen can render zeros before anything is configured. */
    config: config ?? EMPTY_TOKEN_LADDU_CONFIG,
    /** False until someone has set the number of laddus. */
    configured: Boolean(config && config.totalTokens > 0),
    capacity,
    loading,
    error,
    retry,
  };
}

export function useTokenLadduTokens(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error, retry, pendingCount } = useGaneshCollection<TokenLadduToken>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "tokenLadduTokens") : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<TokenLadduToken, "id">),
      pendingWrite,
    }),
    // Ordered by the number rather than createdAt so the list, the draw and the
    // PDF all agree on one deterministic order.
    { orderByField: "tokenNumber", orderDirection: "asc", limitTo: 2000 }
  );
  return { tokens: items, loading, error, retry, pendingCount };
}

export function useTokenLadduRegistrations(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error, retry } = useGaneshCollection<TokenLadduRegistration>(
    pandalId && festivalId
      ? festivalCol(pandalId, festivalId, "tokenLadduRegistrations")
      : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<TokenLadduRegistration, "id">),
      pendingWrite,
    }),
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 500 }
  );
  return { registrations: items, loading, error, retry };
}

export function useTokenDrawSessions(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error, retry } = useGaneshCollection<TokenDrawSession>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "tokenDrawSessions") : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<TokenDrawSession, "id">),
      pendingWrite,
    }),
    // A festival runs one draw, occasionally a second after a correction.
    { orderByField: "startedAt", orderDirection: "desc", limitTo: 20 }
  );

  const openSession = items.find((session) => session.status === "open") ?? null;
  return { sessions: items, openSession, loading, error, retry };
}

export function useTokenDrawResults(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error, retry } = useGaneshCollection<TokenDrawResult>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "tokenDrawResults") : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<TokenDrawResult, "id">),
      pendingWrite,
    }),
    // Draw order is the sequence, not the write time — a result committed after
    // a retry must still read in the order it was announced.
    { orderByField: "sequence", orderDirection: "asc", limitTo: 2000 }
  );
  return { results: items, loading, error, retry };
}
