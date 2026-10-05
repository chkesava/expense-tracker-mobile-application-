import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import type { WhatIfBaselineReference } from "@/shared/types/whatIf";
import {
  archiveWhatIfScenarioDoc,
  duplicateWhatIfScenarioDoc,
  editWhatIfScenarioDoc,
  markWhatIfScenarioCalculated,
  rebaseWhatIfScenarioDoc,
  renameWhatIfScenarioDoc,
  sortWhatIfScenarios,
  validateWhatIfScenarioDoc,
  whatIfScenarioDoc,
  whatIfScenarioFromSnapshot,
  type WhatIfBaselineMode,
  type WhatIfScenario,
  type WhatIfScenarioDefinition,
  type WhatIfScenarioDoc,
} from "@/shared/utils/whatIfScenarios";

/**
 * Saved What-If scenarios (SPENDLY-202) at users/{uid}/whatIfScenarios.
 * Every write touches only the scenario document — never a transaction,
 * account, goal or investment — and goes through the offline outbox.
 * The document id is the scenario's identity; the body never stores one.
 */
export const WHAT_IF_SCENARIOS_COLLECTION = "whatIfScenarios";

function scenariosCollection(uid: string) {
  const db = getFirestoreDb();
  return db ? collection(db, "users", uid, WHAT_IF_SCENARIOS_COLLECTION) : null;
}

function assertValid(data: WhatIfScenarioDoc): void {
  const issues = validateWhatIfScenarioDoc(data);
  if (issues.length) throw new Error(issues.join("; "));
}

export async function listWhatIfScenarios(uid: string): Promise<WhatIfScenario[]> {
  const col = scenariosCollection(uid);
  if (!col) return [];
  const snap = await getDocs(query(col, orderBy("updatedAtMs", "desc")));
  return sortWhatIfScenarios(snap.docs.map((item) => whatIfScenarioFromSnapshot(item.id, item.data())));
}

export async function getWhatIfScenario(uid: string, id: string): Promise<WhatIfScenario | null> {
  const col = scenariosCollection(uid);
  if (!col) return null;
  const snap = await getDoc(doc(col, id));
  return snap.exists() ? whatIfScenarioFromSnapshot(snap.id, snap.data()) : null;
}

/** Create (no id) or replace (with id) one scenario body. Calculated output is never accepted. */
export async function saveWhatIfScenario(uid: string, data: WhatIfScenarioDoc, id?: string): Promise<{ id: string; outcome: WriteOutcome } | null> {
  const col = scenariosCollection(uid);
  if (!col) return null;
  assertValid(data);
  const ref = id ? doc(col, id) : doc(col);
  const outcome = await commitMutations(uid, [{ op: "set", ref, data }], { label: "what-if scenario" });
  return { id: ref.id, outcome };
}

/** Replace a scenario with a builder result; a null result means "no change" and writes nothing. */
async function replace(uid: string, id: string, next: WhatIfScenarioDoc | null): Promise<WriteOutcome | null> {
  if (!next) return null;
  const saved = await saveWhatIfScenario(uid, next, id);
  return saved?.outcome ?? null;
}

export async function createWhatIfScenario(
  uid: string,
  scenario: Omit<WhatIfScenarioDefinition, "id">,
  nowMs = Date.now()
): Promise<{ id: string; outcome: WriteOutcome } | null> {
  return saveWhatIfScenario(uid, whatIfScenarioDoc({ scenario, nowMs }));
}

export async function updateWhatIfScenario(
  uid: string,
  existing: WhatIfScenario,
  next: Omit<WhatIfScenarioDefinition, "id">,
  nowMs = Date.now()
): Promise<WriteOutcome | null> {
  return replace(uid, existing.id, editWhatIfScenarioDoc(existing, next, nowMs));
}

export async function renameWhatIfScenario(uid: string, existing: WhatIfScenario, name: string, nowMs = Date.now()): Promise<WriteOutcome | null> {
  return replace(uid, existing.id, renameWhatIfScenarioDoc(existing, name, nowMs));
}

export async function setWhatIfScenarioArchived(uid: string, existing: WhatIfScenario, archived: boolean, nowMs = Date.now()): Promise<WriteOutcome | null> {
  return replace(uid, existing.id, archiveWhatIfScenarioDoc(existing, archived, nowMs));
}

/** Copy into a brand-new document; the source is untouched. */
export async function duplicateWhatIfScenario(uid: string, source: WhatIfScenario, name: string, nowMs = Date.now()): Promise<{ id: string; outcome: WriteOutcome } | null> {
  return saveWhatIfScenario(uid, duplicateWhatIfScenarioDoc(source, name, nowMs));
}

/** Move the scenario onto today's reference (the explicit "current baseline" choice). */
export async function rebaseWhatIfScenario(uid: string, existing: WhatIfScenario, current: WhatIfBaselineReference, nowMs = Date.now()): Promise<WriteOutcome | null> {
  return replace(uid, existing.id, rebaseWhatIfScenarioDoc(existing, current, nowMs));
}

/** Stamp when and how the scenario was last calculated. No projection output is stored. */
export async function recordWhatIfScenarioCalculation(
  uid: string,
  existing: WhatIfScenario,
  run: { mode: WhatIfBaselineMode; asOfDate: string },
  nowMs = Date.now()
): Promise<WriteOutcome | null> {
  return replace(uid, existing.id, markWhatIfScenarioCalculated(existing, run, nowMs));
}

/** Delete only the saved scenario document; canonical financial records are untouched. */
export async function deleteWhatIfScenario(uid: string, id: string): Promise<WriteOutcome | null> {
  const col = scenariosCollection(uid);
  if (!col) return null;
  return commitMutations(uid, [{ op: "delete", ref: doc(col, id) }], { label: "what-if scenario" });
}
