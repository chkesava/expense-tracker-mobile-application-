import type { Firestore, QueryDocumentSnapshot } from "firebase/firestore";

import { logWarning } from "@/lib/errors";
import type { connectReadModel } from "@/lib/readModelClient";
import type { ReadModelMode } from "@/shared/utils/readModelMode";

import type { JournalMatch, ReadModelBackend } from "./backend";
import { firestoreJournalPage, type SupabaseCursor } from "./journalHistorySource";
import { firestoreJournalMonth, type JournalCollection } from "./journalMonthSource";
import { compareLedgerRows, type ReadPath } from "./readPath";
import {
  READ_MODEL_TIMEOUT_MS,
  readModelPath,
  resolveReadModelBackend,
  setReadModelPathForTests,
  type ReadModelReadConditions,
  type ReadModelReadUser,
} from "./screenReadPath";

/**
 * SPENDLY-511/512 — the Journal's history reads (month loads, older pages and
 * filter matches) through the read path, under
 * `system_settings/global.readModel.journal`.
 *
 * With the setting unset or `firestore` (the default) only the Firestore
 * sources run, which are the provider's previous queries moved unchanged,
 * and no read-model connection is attempted.
 *
 * The read model is Supabase in normal builds and the loopback (backend.ts)
 * in local test builds, so Spendly Test can exercise every mode on a phone.
 */
export const JOURNAL_READ_TIMEOUT_MS = READ_MODEL_TIMEOUT_MS;

/** Tests only. The read path is shared by every read-model screen (screenReadPath.ts). */
export function setJournalReadPathForTests(path: ReadPath): void {
  setReadModelPathForTests(path);
}

export type JournalConditions = ReadModelReadConditions;
type User = ReadModelReadUser;

/** The mode this read runs in, and the read model it may use. */
export function resolveJournalBackend(input: {
  db: Firestore;
  user: User;
  conditions: JournalConditions;
  connect?: typeof connectReadModel;
}): Promise<{ mode: ReadModelMode; backend: ReadModelBackend | null }> {
  return resolveReadModelBackend("journal", input);
}

const withoutRemoved = <T extends { id?: string }>(rows: T[], removed: Set<string>) =>
  rows.filter((row) => !row.id || !removed.has(row.id));

type BaseInput = {
  db: Firestore;
  user: User;
  collectionName: JournalCollection;
  conditions: JournalConditions;
  locallyRemovedIds: Set<string>;
  connect?: typeof connectReadModel;
};

export async function readJournalMonth<T extends { id?: string }>(input: BaseInput & { monthKey: string }): Promise<T[]> {
  const uid = input.user?.uid ?? "";
  const firestore = () => firestoreJournalMonth<T>(input.db, uid, input.collectionName, input.monthKey);
  const { mode, backend } = await resolveJournalBackend(input);
  if (mode === "firestore") return firestore();
  const { value, servedBy } = await readModelPath().read<T[]>("journal", mode, {
    firestore,
    supabase: backend ? () => backend.month<T>(input.collectionName, input.monthKey) : null,
    compare: (a, b) => compareLedgerRows(a as never, b as never),
  });
  // The read model may still hold a row this device just removed.
  return servedBy === "supabase" ? withoutRemoved(value, input.locallyRemovedIds) : value;
}

export type JournalPageResult<T> =
  | { servedBy: "firestore"; items: T[]; lastDoc: QueryDocumentSnapshot | null; exhausted: boolean }
  | { servedBy: "supabase"; items: T[]; next: SupabaseCursor; exhausted: boolean };

/**
 * One older page. Each source keeps its own cursor (the provider holds both);
 * a session that falls back mid-history continues on the Firestore cursor,
 * and rows already loaded are dropped by the provider's id merge.
 */
export async function readJournalPage<T extends { id?: string }>(
  input: BaseInput & { firestoreCursor: QueryDocumentSnapshot | null; supabaseCursor: SupabaseCursor }
): Promise<JournalPageResult<T> | null> {
  const uid = input.user?.uid ?? "";
  const firestore = async (): Promise<JournalPageResult<T> | null> => {
    if (!input.firestoreCursor) return null;
    return { servedBy: "firestore", ...(await firestoreJournalPage<T>(input.db, uid, input.collectionName, input.firestoreCursor)) };
  };
  const { mode, backend } = await resolveJournalBackend(input);
  // Shadow compares whole histories (shadowCompareJournalHistory), not pages:
  // the two sources page in different orders.
  if (mode !== "supabase" || !backend) return firestore();

  const { value } = await readModelPath().read<JournalPageResult<T> | null>("journal", "supabase", {
    firestore,
    supabase: async () => {
      const page = await backend.page<T>(input.collectionName, input.supabaseCursor);
      return { servedBy: "supabase", ...page, items: withoutRemoved(page.items, input.locallyRemovedIds) };
    },
  });
  return value;
}

/**
 * Every row matching the active filter's SQL-checkable conditions, so a
 * filtered Journal is complete without loading all history. `supabase` mode
 * only: in `firestore` (the default) and `shadow` modes this returns null and
 * the Journal behaves as before. On failure: null (the filter still works on
 * what is loaded, and history paging continues).
 */
export async function readJournalMatches<T extends { id?: string }>(
  input: BaseInput & { match: JournalMatch }
): Promise<T[] | null> {
  const { mode, backend } = await resolveJournalBackend(input);
  if (mode !== "supabase" || !backend) return null;
  try {
    return withoutRemoved(await backend.matching<T>(input.collectionName, input.match), input.locallyRemovedIds);
  } catch (error) {
    logWarning("readModel.journal.matches", error);
    return null;
  }
}

/**
 * Shadow mode, once Firestore has loaded a collection's whole history: read
 * the same history from the read model in the background and log any
 * difference (ids, amounts, dates). Never affects what is shown.
 */
export async function shadowCompareJournalHistory<T extends { id?: string; amount?: unknown; date?: unknown }>(input: {
  db: Firestore;
  user: User;
  collectionName: JournalCollection;
  loaded: T[];
  conditions: JournalConditions;
  connect?: typeof connectReadModel;
  log?: (event: string, detail: unknown) => void;
}): Promise<string[] | null> {
  const { mode, backend } = await resolveJournalBackend(input);
  if (mode !== "shadow" || !backend) return null;
  const log = input.log ?? logWarning;
  try {
    const remote: T[] = [];
    let cursor: SupabaseCursor = null;
    for (let guard = 0; guard < 1000; guard++) {
      const page: { items: T[]; next: SupabaseCursor; exhausted: boolean } = await backend.page<T>(input.collectionName, cursor, 1000);
      remote.push(...page.items);
      if (page.exhausted) break;
      cursor = page.next;
    }
    const diffs = compareLedgerRows(input.loaded as never, remote as never);
    if (diffs.length) log("readModel.shadow.journal.history", { collection: input.collectionName, differences: diffs.slice(0, 20), count: diffs.length });
    return diffs;
  } catch (error) {
    log("readModel.shadow.journal.history.error", error);
    return null;
  }
}
