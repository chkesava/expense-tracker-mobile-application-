import type { Firestore } from "firebase/firestore";

import { logWarning } from "@/lib/errors";
import { connectReadModel, type ReadModelUser } from "@/lib/readModelClient";
import { configuredReadModelMode, effectiveReadModelMode } from "@/shared/utils/readModelMode";

import { firestoreJournalMonth, supabaseJournalMonth, type JournalCollection } from "./journalMonthSource";
import { compareLedgerRows, createReadPath, type ReadPath } from "./readPath";

/**
 * SPENDLY-511 — the Journal's month loads, through the read path.
 *
 * With `readModel.journal` unset or `firestore` (the default), this calls
 * `firestoreJournalMonth`, the provider's previous query unchanged, and
 * nothing else: no read-model connection is even attempted.
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

export async function readJournalMonth<T extends { id?: string }>(input: {
  db: Firestore;
  user: (ReadModelUser & { uid: string }) | null;
  collectionName: JournalCollection;
  monthKey: string;
  conditions: { setting: unknown; online: boolean; duress: boolean };
  locallyRemovedIds: Set<string>;
  connect?: typeof connectReadModel;
}): Promise<T[]> {
  const uid = input.user?.uid ?? "";
  const firestore = () => firestoreJournalMonth<T>(input.db, uid, input.collectionName, input.monthKey);
  const configured = configuredReadModelMode(input.conditions.setting, "journal");
  if (configured === "firestore") return firestore();

  let client = null;
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
  const { value, servedBy } = await journalPath.read<T[]>("journal", mode, {
    firestore,
    supabase: client ? () => supabaseJournalMonth<T>(client!, input.collectionName, input.monthKey) : null,
    compare: (a, b) => compareLedgerRows(a as never, b as never),
  });
  // The read model may still hold a row this device just removed.
  return servedBy === "supabase" ? value.filter((row) => !row.id || !input.locallyRemovedIds.has(row.id)) : value;
}
