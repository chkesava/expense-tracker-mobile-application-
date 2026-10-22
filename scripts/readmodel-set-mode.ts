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
 *
 * Spendly Test (SPENDLY-512): with FIRESTORE_EMULATOR_HOST set this writes the
 * emulator's settings instead (project demo-spendly), where the loopback read
 * model serves every mode. Two test-only knobs, refused against production:
 *   --loopback-fail=true|false   simulate a read-model outage (fallback test)
 *   --loopback-lag=<minutes>     simulate sync lag (stale-banner test)
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/readmodel-set-mode.ts --screen=journal --mode=supabase --loopback-lag=240 --apply
 */
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { READ_MODEL_MODES, READ_MODEL_SCREENS, type ReadModelMode, type ReadModelScreen } from "../shared/utils/readModelMode";

export type SetModeArgs = {
  screen: ReadModelScreen;
  mode: ReadModelMode;
  apply: boolean;
  loopbackFail?: boolean;
  loopbackLagMinutes?: number;
};

export function parseSetModeArgs(argv: string[], emulator = false): SetModeArgs {
  const value = (flag: string) => argv.find((a) => a.startsWith(`--${flag}=`))?.split("=")[1];
  const screen = value("screen");
  const mode = value("mode");
  if (!(READ_MODEL_SCREENS as readonly string[]).includes(screen ?? "")) {
    throw new Error(`--screen must be one of: ${READ_MODEL_SCREENS.join(", ")}`);
  }
  if (!(READ_MODEL_MODES as readonly string[]).includes(mode ?? "")) {
    throw new Error(`--mode must be one of: ${READ_MODEL_MODES.join(", ")}`);
  }
  const fail = value("loopback-fail");
  const lag = value("loopback-lag");
  if ((fail !== undefined || lag !== undefined) && !emulator) {
    throw new Error("--loopback-* are for the Firebase emulator (Spendly Test) only; set FIRESTORE_EMULATOR_HOST.");
  }
  if (fail !== undefined && fail !== "true" && fail !== "false") throw new Error("--loopback-fail must be true or false");
  if (lag !== undefined && !(Number(lag) >= 0)) throw new Error("--loopback-lag must be a number of minutes");
  return {
    screen: screen as ReadModelScreen,
    mode: mode as ReadModelMode,
    apply: argv.includes("--apply"),
    ...(fail !== undefined ? { loopbackFail: fail === "true" } : {}),
    ...(lag !== undefined ? { loopbackLagMinutes: Number(lag) } : {}),
  };
}

/** The merge write: only `readModel.<screen>` changes. */
export function setModePatch(args: Pick<SetModeArgs, "screen" | "mode" | "loopbackFail" | "loopbackLagMinutes">) {
  return {
    readModel: {
      [args.screen]: args.mode,
      ...(args.loopbackFail !== undefined ? { loopbackFail: args.loopbackFail } : {}),
      ...(args.loopbackLagMinutes !== undefined ? { loopbackLagMinutes: args.loopbackLagMinutes } : {}),
    },
  };
}

async function main() {
  const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  const args = parseSetModeArgs(process.argv.slice(2), emulator);
  const { screen, mode, apply } = args;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const db = getFirestore(
    emulator
      ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
      : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() })
  );
  console.log(emulator ? "Target: Firebase emulator (Spendly Test)" : "Target: PRODUCTION");
  const ref = db.doc("system_settings/global");
  const current = ((await ref.get()).data()?.readModel ?? {}) as Record<string, unknown>;
  console.log(`readModel.${screen}: ${String(current[screen] ?? "firestore (unset)")} → ${mode}`);
  if (!apply) {
    console.log("[DRY RUN] nothing written. Re-run with --apply.");
    return;
  }
  await ref.set(setModePatch(args), { merge: true });
  console.log("Written. Screens pick it up on their next load.");
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
