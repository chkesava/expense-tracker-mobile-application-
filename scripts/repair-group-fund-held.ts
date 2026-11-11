/**
 * SPENDLY-752: repairs group funds whose stored per-account held split
 * (`heldByAccount`) was left wrong by a payout paid from an account that held
 * less than it paid (see scripts/lib/groupFundHeldRepairCore.ts).
 *
 * DRY RUN by default: reads only and prints the report.
 *
 *   npx tsx scripts/repair-group-fund-held.ts [--uid=<uid>] [--out=report.md]
 *   npx tsx scripts/repair-group-fund-held.ts --apply [--uid=<uid>] [--out=report.md]
 *   npx tsx scripts/repair-group-fund-held.ts [--apply] --counts
 *
 * --counts prints one JSON line of counts and nothing else: no fund or account
 * names, ids or amounts. The GitHub workflow (repair-group-fund-held.yml) uses
 * it because the repository's Actions logs are public.
 *
 * --apply writes only `heldByAccount` (and `updatedAt`) on funds the dry run
 * classes as "repair", each in a transaction that first checks the fund's
 * `version` is the one just read (any money event since bumps it, and that
 * fund is skipped). The values are absolute, so a rerun finds nothing to do.
 * Events, account entries and balances are never written. Never run --apply
 * against production without a reviewed dry run and the owner's approval
 * (docs/AGENT_WORKFLOW.md §7).
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT. With
 * FIRESTORE_EMULATOR_HOST set it uses the local emulator (project
 * GCLOUD_PROJECT, default demo-spendly).
 *
 * The report never prints a uid: owners appear as a short hash.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { createServerPush } from "../netlify/functions/_readmodelServerPush";
import { serverPushPorts } from "../netlify/functions/readmodel-push";
import type { GroupFund, GroupFundEvent } from "../shared/types/groupFund";
import { isDuressUid } from "../shared/utils/duress";
import { groupFundEventFromDoc, groupFundFromDoc } from "../shared/utils/groupFundDocs";
import { heldRepairCounts, planHeldRepair, renderHeldRepairReport, type HeldRepairFund } from "./lib/groupFundHeldRepairCore";

function initApp() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" });
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) return initializeApp({ credential: cert(JSON.parse(raw)) });
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return initializeApp({ credential: applicationDefault() });
  }
  throw new Error(
    "Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path, or FIREBASE_SERVICE_ACCOUNT to its contents (or FIRESTORE_EMULATOR_HOST for the emulator)."
  );
}

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

const APPLY = process.argv.includes("--apply");
const ONLY_UID = arg("uid");
const OUT = arg("out");
const COUNTS_ONLY = process.argv.includes("--counts");

const ownerKey = (uid: string) => createHash("sha256").update(uid).digest("hex").slice(0, 8);

async function main() {
  const db = getFirestore(initApp());
  // In --counts mode nothing that names a fund, account or owner is printed.
  const log = (line: string) => {
    if (!COUNTS_ONLY) console.log(line);
  };

  const fundSnaps = ONLY_UID
    ? (await db.collection(`users/${ONLY_UID}/groupFunds`).get()).docs
    : (await db.collectionGroup("groupFunds").get()).docs;

  const plans: HeldRepairFund[] = [];
  const uidByKey = new Map<string, string>();
  const names = new Map<string, string>();
  for (const snap of fundSnaps) {
    const uid = snap.ref.parent.parent?.id;
    if (!uid || isDuressUid(uid)) continue;
    const fund = groupFundFromDoc(snap.id, snap.data()) as GroupFund | null;
    if (!fund) continue;
    const eventSnaps = await db.collection(`users/${uid}/groupFundEvents`).where("fundId", "==", fund.id).get();
    const events = eventSnaps.docs
      .map((d) => groupFundEventFromDoc(d.id, d.data()))
      .filter((e): e is GroupFundEvent => e !== null);
    const key = ownerKey(uid);
    uidByKey.set(key, uid);
    const plan = planHeldRepair(key, fund, events);
    plans.push(plan);
    if (plan.status === "repair") {
      for (const accountId of Object.keys(plan.proposed ?? {})) {
        if (names.has(`${key}/${accountId}`)) continue;
        const acc = await db.doc(`users/${uid}/accounts/${accountId}`).get();
        names.set(`${key}/${accountId}`, acc.exists ? String(acc.get("name") ?? accountId) : `${accountId} (deleted)`);
      }
    }
  }

  const applied = new Map<string, string>();
  if (APPLY) {
    const push = createServerPush(serverPushPorts(db, log));
    for (const plan of plans) {
      if (plan.status !== "repair" || !plan.proposed) continue;
      const uid = uidByKey.get(plan.ownerKey)!;
      const ref = db.doc(`users/${uid}/groupFunds/${plan.fundId}`);
      const outcome = await db.runTransaction(async (tx) => {
        const now = await tx.get(ref);
        if (!now.exists) return "skipped: fund gone";
        if ((now.get("version") ?? 0) !== plan.version) return "skipped: changed since the dry run, rerun";
        tx.update(ref, { heldByAccount: plan.proposed, updatedAt: FieldValue.serverTimestamp() });
        return "repaired";
      });
      applied.set(`${plan.ownerKey}/${plan.fundId}`, outcome);
      if (outcome === "repaired") push.note(uid, [ref.path]);
      log(`[repair] owner ${plan.ownerKey} fund ${plan.fundId}: ${outcome}`);
    }
    const pushed = await push.flush();
    log(`[repair] read model push: ${JSON.stringify(pushed)}`);
    if (COUNTS_ONLY) console.log(`readModelPush=${JSON.stringify(pushed)}`);
  }

  if (COUNTS_ONLY) {
    console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", ...heldRepairCounts(plans, applied) }));
    return;
  }

  const text = renderHeldRepairReport(plans, (key, id) => names.get(`${key}/${id}`) ?? id, {
    mode: APPLY ? "apply" : "dry-run",
    applied,
  });
  if (OUT) {
    writeFileSync(OUT, text, "utf8");
    log(`Report written to ${OUT}`);
  }
  console.log(text);
}

main().catch((err) => {
  // A Firestore error can quote a document path (with the uid): counts mode
  // prints only its code.
  if (COUNTS_ONLY) console.error(`repair failed: ${(err as { code?: unknown })?.code ?? "error"}`);
  else console.error(err);
  process.exit(1);
});
