import type { Firestore } from "@/lib/firestore";

import type { connectReadModel } from "@/lib/readModelClient";
import { configuredReadModelMode } from "@/shared/utils/readModelMode";

import type { GroupFundEventsCursor, GroupFundEventsPage } from "./groupFundSources";
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
