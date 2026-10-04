import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import {
  duplicateWhatIfScenarioDoc,
  editWhatIfScenarioDoc,
  sortWhatIfScenarios,
  validateWhatIfScenarioDoc,
  whatIfScenarioDoc,
  type WhatIfScenario,
  type WhatIfScenarioDefinition,
  type WhatIfScenarioDoc,
} from "@/shared/utils/whatIfScenarios";

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
  return sortWhatIfScenarios(snap.docs.map((item) => ({ id: item.id, ...item.data() } as WhatIfScenario)));
}

export async function getWhatIfScenario(uid: string, id: string): Promise<WhatIfScenario | null> {
  const col = scenariosCollection(uid);
  if (!col) return null;
  const snap = await getDoc(doc(col, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as WhatIfScenario) : null;
}

/** Create or replace one scenario document; calculated output is never accepted. */
export async function saveWhatIfScenario(uid: string, data: WhatIfScenarioDoc, id?: string): Promise<{ id: string; outcome: WriteOutcome } | null> {
  const col = scenariosCollection(uid);
  if (!col) return null;
  assertValid(data);
  const ref = id ? doc(col, id) : doc(col);
  const outcome = await commitMutations(uid, [{ op: "set", ref, data }], { label: "what-if scenario" });
  return { id: ref.id, outcome };
}

export async function createWhatIfScenario(uid: string, scenario: WhatIfScenarioDefinition, nowMs = Date.now()): Promise<{ id: string; outcome: WriteOutcome } | null> {
  const data = whatIfScenarioDoc({ scenario, nowMs });
  return saveWhatIfScenario(uid, data);
}

export async function updateWhatIfScenario(uid: string, existing: WhatIfScenarioDoc, next: WhatIfScenarioDefinition, nowMs = Date.now()): Promise<WriteOutcome | null> {
  const col = scenariosCollection(uid);
  if (!col) return null;
  const data = editWhatIfScenarioDoc(existing, next, nowMs);
  return commitMutations(uid, [{ op: "set", ref: doc(col, existing.id), data }], { label: "what-if scenario" });
}

export async function renameWhatIfScenario(uid: string, existing: WhatIfScenarioDoc, name: string, nowMs = Date.now()): Promise<WriteOutcome | null> {
  return updateWhatIfScenario(uid, existing, { ...existing, name, version: existing.version }, nowMs);
}

export async function setWhatIfScenarioArchived(uid: string, existing: WhatIfScenarioDoc, archived: boolean, nowMs = Date.now()): Promise<WriteOutcome | null> {
  const col = scenariosCollection(uid);
  if (!col) return null;
  const data = { ...existing, archived, updatedAtMs: nowMs, version: existing.version + 1 };
  assertValid(data);
  return commitMutations(uid, [{ op: "set", ref: doc(col, existing.id), data }], { label: "what-if scenario" });
}

export async function duplicateWhatIfScenario(uid: string, source: WhatIfScenarioDoc, name: string, nowMs = Date.now()): Promise<{ id: string; outcome: WriteOutcome } | null> {
  return saveWhatIfScenario(uid, duplicateWhatIfScenarioDoc(source, name, nowMs));
}

/** Delete only the saved scenario document; canonical financial records are untouched. */
export async function deleteWhatIfScenario(uid: string, id: string): Promise<WriteOutcome | null> {
  const col = scenariosCollection(uid);
  if (!col) return null;
  return commitMutations(uid, [{ op: "delete", ref: doc(col, id) }], { label: "what-if scenario" });
}
