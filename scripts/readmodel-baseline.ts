/**
 * SPENDLY-503 — read-only financial correctness baseline.
 *
 * For every user: per-collection counts (deleted/voided separately), amount
 * sums per month and account, stored vs recomputed balance for every account
 * (`recomputeFinancialState`, the SPENDLY-499 single reference), open card
 * bills, the EPF closing balance and `composeNetWorth` without quotes.
 *
 * READ-ONLY: this file never writes to Firestore (a test asserts it). There is
 * no --apply.
 *
 * Privacy: the repository is public, so the per-user report (account names and
 * amounts) goes to docs/private/ (git-ignored). Only an aggregate summary with
 * no names, amounts or uids is written for committing.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/readmodel-baseline.ts
 *   GOOGLE_APPLICATION_CREDENTIALS=<key> npx tsx scripts/readmodel-baseline.ts --production
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import {
  BASELINE_COLLECTIONS,
  buildUserBaseline,
  renderBaselineMarkdown,
  type BaselineRows,
  type UserBaseline,
} from "../shared/utils/financialBaseline";
import { todayDateKey } from "../shared/utils/dates";

/** A stable, non-reversible label for a uid in reports. */
export function hashUid(uid: string): string {
  return `u#${createHash("sha256").update(uid).digest("hex").slice(0, 10)}`;
}

export type BaselineSummary = {
  users: number;
  usersFailed: number;
  accounts: { total: number; match: number; variance: number; missing: number };
  documents: Record<string, number>;
};

/** Aggregates with no names, amounts or uids — safe to commit. Pure. */
export function summarizeBaselines(baselines: UserBaseline[], usersFailed: number): BaselineSummary {
  const documents: Record<string, number> = {};
  const accounts = { total: 0, match: 0, variance: 0, missing: 0 };
  for (const baseline of baselines) {
    for (const [col, count] of Object.entries(baseline.counts)) {
      documents[col] = (documents[col] ?? 0) + count.total;
    }
    for (const account of baseline.accounts) {
      accounts.total += 1;
      accounts[account.status] += 1;
    }
  }
  return { users: baselines.length, usersFailed, accounts, documents };
}

export function renderSummaryMarkdown(date: string, target: string, summary: BaselineSummary): string {
  const lines = [
    `# SPENDLY-503 baseline summary — ${date}`,
    "",
    `Target: ${target}. Read-only. Aggregates only: no uids, names or amounts (the repository is public; the per-user report is kept locally in docs/private/).`,
    "",
    `- Users: ${summary.users} (failed to read: ${summary.usersFailed})`,
    `- Accounts: ${summary.accounts.total} — match ${summary.accounts.match}, variance ${summary.accounts.variance}, nothing stored ${summary.accounts.missing}`,
    "",
    "| Collection | Documents |",
    "|---|---|",
    ...Object.entries(summary.documents)
      .filter(([, n]) => n > 0)
      .map(([col, n]) => `| ${col} | ${n} |`),
    "",
  ];
  return lines.join("\n");
}

async function loadRows(db: Firestore, uid: string): Promise<BaselineRows | null> {
  const rows = {} as BaselineRows;
  for (const col of BASELINE_COLLECTIONS) {
    try {
      const snap = await db.collection("users").doc(uid).collection(col).get();
      rows[col] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {
      return null;
    }
  }
  return rows;
}

async function main() {
  const argv = process.argv.slice(2);
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  const production = argv.includes("--production");
  if (!emulator && !production) {
    throw new Error("No FIRESTORE_EMULATOR_HOST: pass --production to read the live project.");
  }
  const app = emulator
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({
        credential: process.env.FIREBASE_SERVICE_ACCOUNT
          ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
          : applicationDefault(),
      });
  const db = getFirestore(app);
  const today = todayDateKey();
  const target = emulator ? "emulator" : "production";

  const refs = await db.collection("users").listDocuments();
  const baselines: UserBaseline[] = [];
  const sections: string[] = [];
  const json: Record<string, UserBaseline> = {};
  let failed = 0;
  for (const ref of refs) {
    const rows = await loadRows(db, ref.id);
    if (!rows) {
      failed += 1;
      continue;
    }
    const baseline = buildUserBaseline(rows, today);
    baselines.push(baseline);
    const label = hashUid(ref.id);
    json[label] = baseline;
    sections.push(renderBaselineMarkdown(label, baseline));
  }

  const summary = summarizeBaselines(baselines, failed);
  const root = path.resolve(__dirname, "..");
  const privateDir = path.join(root, "docs", "private");
  mkdirSync(privateDir, { recursive: true });
  writeFileSync(path.join(privateDir, `SPENDLY-503-baseline-${target}-${today}.json`), JSON.stringify(json, null, 2));
  writeFileSync(
    path.join(privateDir, `SPENDLY-503-baseline-${target}-${today}.md`),
    [`# SPENDLY-503 per-user baseline (${target}, ${today}) — PRIVATE, do not commit`, "", ...sections].join("\n")
  );
  const summaryMd = renderSummaryMarkdown(today, target, summary);
  writeFileSync(path.join(root, "docs", `SPENDLY-503-baseline-summary-${target}-${today}.md`), summaryMd);
  console.log(summaryMd);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
