import type { Firestore } from "@/lib/firestore";

import type { connectReadModel } from "@/lib/readModelClient";
import type { GroupFundEvent } from "@/shared/types/groupFund";
import { configuredReadModelMode } from "@/shared/utils/readModelMode";

import { compareAuditIds } from "./analyticsReadPath";
import { groupFundCursorBelow, type GroupFundEventsCursor, type GroupFundEventsPage } from "./groupFundSources";
import { readModelPath, resolveReadModelBackend, type ReadModelReadConditions, type ReadModelReadUser } from "./screenReadPath";

/**
 * SPENDLY-685 — older Group Funds history pages through the read path, under
 * the `groupFundHistory` switch (`system_settings/global.readModel.groupFundHistory`):
 *
 * | mode        | older history pages     |
 * |-------------|-------------------------|
 * | `firestore` | Firestore cursor pages  |
 * | `shadow`    | Firestore cursor pages  |
 * | `supabase`  | read model pages        |
 *
 * The newest page always stays a Firestore listener (this device's own
 * writes appear at once, R4.3). A failure or timeout in `supabase` falls back
 * to Firestore for the session. A fund's held amount is never read from here.
 */
export async function readGroupFundHistoryPage(input: {
  db: Firestore;
  user: ReadModelReadUser;
  conditions: ReadModelReadConditions;
  connect?: typeof connectReadModel;
  fundId: string;
  cursor: GroupFundEventsCursor;
  pageSize: number;
}): Promise<GroupFundEventsPage | null> {
  // Only `supabase` pages from the read model; any other mode never connects.
  if (configuredReadModelMode(input.conditions.setting, "groupFundHistory") !== "supabase") return null;
  const { mode, backend } = await resolveReadModelBackend("groupFundHistory", input);
  if (mode !== "supabase" || !backend) return null;
  const { value } = await readModelPath().read<GroupFundEventsPage | null>("groupFundHistory", "supabase", {
    firestore: async () => null,
    supabase: () =>
      backend.groupFundEventsPage({ fundId: input.fundId, cursor: input.cursor, pageSize: input.pageSize }),
  });
  return value;
}

/**
 * SPENDLY-688: one fund's events for one month, for the month view, under the
 * same `groupFundHistory` switch. Null means "use the Firestore listener"
 * (any other mode, or a failure; after one, the screen stays on Firestore
 * this session). Rows only: who paid is worked out by the shared helpers.
 */
export async function readGroupFundMonth(input: {
  db: Firestore;
  user: ReadModelReadUser;
  conditions: ReadModelReadConditions;
  connect?: typeof connectReadModel;
  fundId: string;
  period: string;
}): Promise<GroupFundEvent[] | null> {
  if (configuredReadModelMode(input.conditions.setting, "groupFundHistory") !== "supabase") return null;
  const { mode, backend } = await resolveReadModelBackend("groupFundHistory", input);
  if (mode !== "supabase" || !backend) return null;
  const { value } = await readModelPath().read<GroupFundEvent[] | null>("groupFundHistory", "supabase", {
    firestore: async () => null,
    supabase: () => backend.groupFundMonthEvents(input.fundId, input.period),
  });
  return value;
}

type ShadowBase = {
  db: Firestore;
  user: ReadModelReadUser;
  conditions: ReadModelReadConditions;
  connect?: typeof connectReadModel;
  now?: () => number;
};

/** Event ids on one side only; events younger than the sync SLO are expected lag, not a difference. */
export function compareGroupFundEventIds(
  firestore: readonly GroupFundEvent[],
  readModel: readonly GroupFundEvent[],
  nowMs: number
): string[] {
  return compareAuditIds(
    firestore.map((e) => ({ id: e.id, createdAt: e.createdAtMs })),
    readModel.map((e) => ({ id: e.id })),
    nowMs
  );
}

/**
 * `shadow` only (CodeRabbit #263, the shadow gate): Firestore serves the
 * month; the read model's rows for the same fund and month are fetched in the
 * background and differences are logged. Returns false in any other mode.
 */
export async function shadowCompareGroupFundMonth(
  input: ShadowBase & { fundId: string; period: string; firestoreEvents: readonly GroupFundEvent[] }
): Promise<boolean> {
  if (configuredReadModelMode(input.conditions.setting, "groupFundHistory") !== "shadow") return false;
  const { mode, backend } = await resolveReadModelBackend("groupFundHistory", input);
  if (mode !== "shadow" || !backend) return false;
  const now = input.now ?? Date.now;
  await readModelPath().read<string[]>("groupFundHistory", "shadow", {
    firestore: async () => [],
    supabase: async () => compareGroupFundEventIds(input.firestoreEvents, await backend.groupFundMonthEvents(input.fundId, input.period), now()),
    compare: (_none, diffs) => diffs,
  });
  return true;
}

/**
 * `shadow` only: an older history page Firestore served, compared with the
 * read model over the same time span (the page's oldest to newest event), so
 * a different tie order between the two stores is never a difference.
 */
export async function shadowCompareGroupFundHistoryPage(
  input: ShadowBase & { fundId: string; aboveMs: number; firestoreItems: readonly GroupFundEvent[] }
): Promise<boolean> {
  if (input.firestoreItems.length === 0) return false;
  if (configuredReadModelMode(input.conditions.setting, "groupFundHistory") !== "shadow") return false;
  const { mode, backend } = await resolveReadModelBackend("groupFundHistory", input);
  if (mode !== "shadow" || !backend) return false;
  const now = input.now ?? Date.now;
  const oldest = Math.min(...input.firestoreItems.map((e) => e.createdAtMs));
  await readModelPath().read<string[]>("groupFundHistory", "shadow", {
    firestore: async () => [],
    supabase: async () => {
      const page = await backend.groupFundEventsPage({
        fundId: input.fundId,
        cursor: groupFundCursorBelow(input.aboveMs),
        pageSize: input.firestoreItems.length + 25,
      });
      const span = page.items.filter((e) => e.createdAtMs >= oldest && e.createdAtMs <= input.aboveMs);
      return compareGroupFundEventIds(input.firestoreItems, span, now());
    },
    compare: (_none, diffs) => diffs,
  });
  return true;
}
