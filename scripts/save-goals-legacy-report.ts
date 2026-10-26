/**
 * SPENDLY-615 — Save Goals legacy dry-run report. READ-ONLY.
 *
 * For every user: how many goals are legacy (no audit log yet) vs upgraded,
 * goals whose names collide after normalization (their upgrade will ask for a
 * rename), amounts the v2 rules would refuse, and — for upgraded goals —
 * whether opening amount + history equals the saved amount.
 *
 * It only ever calls `.get()`. It writes nothing to Firestore or anywhere else
 * except stdout, prints hashed uids and goal ids only (no names, amounts or
 * notes), and needs no backfill afterwards: legacy goals upgrade lazily on
 * their first Save Goals write.
 *
 *   # emulator
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-spendly npx tsx scripts/save-goals-legacy-report.ts
 *   # production (read-only; run it yourself with your service account)
 *   FIREBASE_SERVICE_ACCOUNT='{…}' npx tsx scripts/save-goals-legacy-report.ts [--with-history]
 *
 * `--with-history` also reads each upgraded goal's events to reconcile it
 * (costs one read per event).
 */
import { createHash } from "node:crypto";

import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import type { FinancialGoal } from "../shared/types/expense";
import type { GoalEvent } from "../shared/types/goal";
import { auditGoals, summarizeAudits, type GoalAuditReport } from "../shared/utils/goalAudit";
import { isLegacyGoal } from "../shared/utils/goalModel";

const hashUid = (uid: string) => `u#${createHash("sha256").update(uid).digest("hex").slice(0, 10)}`;

async function main() {
  const withHistory = process.argv.includes("--with-history");
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
  const db = getFirestore(app);

  const reports: { user: string; report: GoalAuditReport }[] = [];
  for (const userRef of await db.collection("users").listDocuments()) {
    if (userRef.id.endsWith("_duress")) continue;
    const snap = await userRef.collection("financialGoals").get();
    if (snap.empty) continue;
    const goals = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FinancialGoal);
    let events: Map<string, GoalEvent[]> | undefined;
    if (withHistory) {
      const entries: [string, GoalEvent[]][] = [];
      for (const goal of goals.filter((x) => !isLegacyGoal(x))) {
        const ev = await userRef.collection("goalEvents").where("goalId", "==", goal.id).get();
        entries.push([goal.id, ev.docs.map((d) => ({ id: d.id, ...d.data() }) as GoalEvent)]);
      }
      events = new Map(entries);
    }
    reports.push({ user: hashUid(userRef.id), report: auditGoals(goals, events) });
  }

  const summary = summarizeAudits(reports.map((r) => r.report));
  console.log("Save Goals legacy report (read-only)");
  console.log(JSON.stringify({ summary, users: reports.filter((r) => r.report.duplicateNameGroups.length || r.report.invalidAmounts.length || r.report.reconcileMismatches.length) }, null, 2));
  console.log(withHistory ? "History reconciled for upgraded goals." : "Run with --with-history to reconcile upgraded goals against their events.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
