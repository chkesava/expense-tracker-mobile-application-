import type { SupabaseClient } from "@supabase/supabase-js";
import type { Firestore, QueryDocumentSnapshot } from "firebase/firestore";

import { logWarning } from "@/lib/errors";
import { connectReadModel, type ReadModelUser } from "@/lib/readModelClient";
import { configuredReadModelMode, effectiveReadModelMode, type ReadModelMode } from "@/shared/utils/readModelMode";

import { firestoreJournalPage, supabaseJournalPage, type SupabaseCursor } from "./journalHistorySource";
import { firestoreJournalMonth, supabaseJournalMonth, type JournalCollection } from "./journalMonthSource";
import { compareLedgerRows, createReadPath, type ReadPath } from "./readPath";

/**
 * SPENDLY-511/512 — the Journal's history reads (month loads and older
 * pages) through the read path, under `system_settings/global.readModel.journal`.
 *
 * With the setting unset or `firestore` (the default) only the Firestore
 * sources run, which are the provider's previous queries moved unchanged,
 * and no read-model connection is attempted.
 */
export const JOURNAL_READ_TIMEOUT_MS = 4000;

let journalPath: ReadPath = createReadPath({
  timeoutMs: JOURNAL_READ_TIMEOUT_MS,
  log: (event, detail) => logWarning(event, detail),
});

/** Tests only. */
export function setJournalReadPathForTests(path: ReadPath): void {
  journalPath = path;
}

export type JournalConditions = { setting: unknown; online: boolean; duress: boolean };
type User = (ReadModelUser & { uid: string }) | null;

/** The mode this read runs in, and the read-model client when it may use one. */
export async function resolveJournalSource(input: {
  user: User;
  conditions: JournalConditions;
  connect?: typeof connectReadModel;
}): Promise<{ mode: ReadModelMode; client: SupabaseClient | null }> {
  const configured = configuredReadModelMode(input.conditions.setting, "journal");
  if (configured === "firestore") return { mode: "firestore", client: null };
  let client: SupabaseClient | null = null;
  if (input.conditions.online && !input.conditions.duress) {
    try {
      client = (await (input.connect ?? connectReadModel)(input.user)).client;
    } catch (error) {
      logWarning("readModel.connect", error);
    }
  }
  const mode = effectiveReadModelMode({
    configured,
    online: input.conditions.online,
    duress: input.conditions.duress,
    available: !!client,
    fellBack: journalPath.fellBack("journal"),
  });
  return { mode, client: mode === "firestore" ? null : client };
}

const withoutRemoved = <T extends { id?: string }>(rows: T[], removed: Set<string>) =>
  rows.filter((row) => !row.id || !removed.has(row.id));

export async function readJournalMonth<T extends { id?: string }>(input: {
  db: Firestore;
  user: User;
  collectionName: JournalCollection;
  monthKey: string;
  conditions: JournalConditions;
  locallyRemovedIds: Set<string>;
  connect?: typeof connectReadModel;
}): Promise<T[]> {
  const uid = input.user?.uid ?? "";
  const firestore = () => firestoreJournalMonth<T>(input.db, uid, input.collectionName, input.monthKey);
  const { mode, client } = await resolveJournalSource(input);
  if (mode === "firestore") return firestore();
  const { value, servedBy } = await journalPath.read<T[]>("journal", mode, {
    firestore,
    supabase: client ? () => supabaseJournalMonth<T>(client, input.collectionName, input.monthKey) : null,
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
export async function readJournalPage<T extends { id?: string }>(input: {
  db: Firestore;
  user: User;
  collectionName: JournalCollection;
  firestoreCursor: QueryDocumentSnapshot | null;
  supabaseCursor: SupabaseCursor;
  conditions: JournalConditions;
  locallyRemovedIds: Set<string>;
  connect?: typeof connectReadModel;
}): Promise<JournalPageResult<T> | null> {
  const uid = input.user?.uid ?? "";
  const firestore = async (): Promise<JournalPageResult<T> | null> => {
    if (!input.firestoreCursor) return null;
    return { servedBy: "firestore", ...(await firestoreJournalPage<T>(input.db, uid, input.collectionName, input.firestoreCursor)) };
  };
  const { mode, client } = await resolveJournalSource(input);
  // Shadow compares whole histories (shadowCompareJournalHistory), not pages:
  // the two sources page in different orders.
  if (mode !== "supabase" || !client) return firestore();

  const { value } = await journalPath.read<JournalPageResult<T> | null>("journal", "supabase", {
    firestore,
    supabase: async () => {
      const page = await supabaseJournalPage<T>(client, input.collectionName, input.supabaseCursor);
      return { servedBy: "supabase", ...page, items: withoutRemoved(page.items, input.locallyRemovedIds) };
    },
  });
  return value;
}

/**
 * Shadow mode, once Firestore has loaded a collection's whole history: read
 * the same history from the read model in the background and log any
 * difference (ids, amounts, dates). Never affects what is shown.
 */
export async function shadowCompareJournalHistory<T extends { id?: string; amount?: unknown; date?: unknown }>(input: {
  user: User;
  collectionName: JournalCollection;
  loaded: T[];
  conditions: JournalConditions;
  connect?: typeof connectReadModel;
  log?: (event: string, detail: unknown) => void;
}): Promise<string[] | null> {
  const { mode, client } = await resolveJournalSource(input);
  if (mode !== "shadow" || !client) return null;
  const log = input.log ?? logWarning;
  try {
    const remote: T[] = [];
    let cursor: SupabaseCursor = null;
    for (let guard = 0; guard < 1000; guard++) {
      const page: { items: T[]; next: SupabaseCursor; exhausted: boolean } = await supabaseJournalPage<T>(client, input.collectionName, cursor, 1000);
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
