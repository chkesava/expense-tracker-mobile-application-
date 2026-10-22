/**
 * SPENDLY-511 — flip a screen's read source: `system_settings/global.readModel.<screen>`.
 *
 *   npx tsx scripts/readmodel-set-mode.ts --screen=journal --mode=shadow           (dry run)
 *   npx tsx scripts/readmodel-set-mode.ts --screen=journal --mode=supabase --apply
 *   npx tsx scripts/readmodel-set-mode.ts --screen=journal --mode=firestore --apply   (kill switch)
 *
 * Clients can only read this document (firestore.rules: `write: if false`).
 * The app picks the change up live (SystemSettingsProvider listens) and
 * applies it from the next load; no release. Writes only that one field.
 *
 * Gate (docs/READMODEL_RUNBOOK.md): `shadow` any time; `supabase` only after
 * the SPENDLY-510 14-day parity report is signed off.
 */
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { READ_MODEL_MODES, READ_MODEL_SCREENS, type ReadModelMode, type ReadModelScreen } from "../shared/utils/readModelMode";

export function parseSetModeArgs(argv: string[]): { screen: ReadModelScreen; mode: ReadModelMode; apply: boolean } {
  const value = (flag: string) => argv.find((a) => a.startsWith(`--${flag}=`))?.split("=")[1];
  const screen = value("screen");
  const mode = value("mode");
  if (!(READ_MODEL_SCREENS as readonly string[]).includes(screen ?? "")) {
    throw new Error(`--screen must be one of: ${READ_MODEL_SCREENS.join(", ")}`);
  }
  if (!(READ_MODEL_MODES as readonly string[]).includes(mode ?? "")) {
    throw new Error(`--mode must be one of: ${READ_MODEL_MODES.join(", ")}`);
  }
  return { screen: screen as ReadModelScreen, mode: mode as ReadModelMode, apply: argv.includes("--apply") };
}

/** The merge write: only `readModel.<screen>` changes. */
export function setModePatch(screen: ReadModelScreen, mode: ReadModelMode) {
  return { readModel: { [screen]: mode } };
}

async function main() {
  const { screen, mode, apply } = parseSetModeArgs(process.argv.slice(2));
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const db = getFirestore(initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() }));
  const ref = db.doc("system_settings/global");
  const current = ((await ref.get()).data()?.readModel ?? {}) as Record<string, unknown>;
  console.log(`readModel.${screen}: ${String(current[screen] ?? "firestore (unset)")} → ${mode}`);
  if (!apply) {
    console.log("[DRY RUN] nothing written. Re-run with --apply.");
    return;
  }
  await ref.set(setModePatch(screen, mode), { merge: true });
  console.log("Written. Screens pick it up on their next load.");
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
