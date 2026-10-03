import { collection, doc } from "firebase/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import { duplicatePlanDoc, validatePlanName, type GoalFundingPlan, type GoalFundingPlanDoc } from "@/shared/utils/goalFundingPlans";

/**
 * Saved goal funding plans (SPENDLY-220) at users/{uid}/goalFundingPlans.
 * Every write touches only the plan document — never a goal, contribution,
 * account or transaction. Writes go through the offline outbox.
 */
export const GOAL_FUNDING_PLANS_COLLECTION = "goalFundingPlans";

function plansCollection(uid: string) {
  const db = getFirestoreDb();
  return db ? collection(db, "users", uid, GOAL_FUNDING_PLANS_COLLECTION) : null;
}

/** Create (no id) or replace (with id). Returns the plan id with the outcome. */
export async function saveGoalFundingPlan(uid: string, data: GoalFundingPlanDoc, id?: string): Promise<{ id: string; outcome: WriteOutcome } | null> {
  const col = plansCollection(uid);
  if (!col) return null;
  const issue = validatePlanName(data.name);
  if (issue) throw new Error(issue);
  const ref = id ? doc(col, id) : doc(col);
  const outcome = await commitMutations(uid, [{ op: "set", ref, data }], { label: "funding plan" });
  return { id: ref.id, outcome };
}

export async function renameGoalFundingPlan(uid: string, id: string, name: string): Promise<WriteOutcome | null> {
  const col = plansCollection(uid);
  if (!col) return null;
  const issue = validatePlanName(name);
  if (issue) throw new Error(issue);
  return commitMutations(uid, [{ op: "update", ref: doc(col, id), data: { name: name.trim(), updatedAtMs: Date.now() } }], { label: "funding plan" });
}

export async function setGoalFundingPlanArchived(uid: string, id: string, archived: boolean): Promise<WriteOutcome | null> {
  const col = plansCollection(uid);
  if (!col) return null;
  return commitMutations(uid, [{ op: "update", ref: doc(col, id), data: { archived, updatedAtMs: Date.now() } }], { label: "funding plan" });
}

export async function duplicateGoalFundingPlan(uid: string, plan: GoalFundingPlan, name: string): Promise<{ id: string; outcome: WriteOutcome } | null> {
  const { id: _id, ...data } = plan;
  void _id;
  return saveGoalFundingPlan(uid, duplicatePlanDoc(data, name, Date.now()));
}

/** Deletes the plan only. Goals and transactions are untouched. */
export async function deleteGoalFundingPlan(uid: string, id: string): Promise<WriteOutcome | null> {
  const col = plansCollection(uid);
  if (!col) return null;
  return commitMutations(uid, [{ op: "delete", ref: doc(col, id) }], { label: "funding plan" });
}
