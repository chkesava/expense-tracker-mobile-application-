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
 *
 * SPENDLY-601 (plan v2): the per-collection switches (673) and the app-wide
 * ones, the same way:
 *   npx tsx scripts/readmodel-set-mode.ts --collection=expenses --mode=shadow --apply
 *   npx tsx scripts/readmodel-set-mode.ts --switch=localCopy --value=false --apply
 *
 * `--switch=localCopy --value=false` is the one-write rollback: every
 * collection reads Firestore again on every device (no release), and the
 * per-collection settings stay as they were for when it's turned back on.
 */
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { COLLECTION_MODES, READ_MODEL_COLLECTIONS, type CollectionMode } from "../shared/utils/readModel/collectionMode";
import { READ_MODEL_MODES, READ_MODEL_SCREENS, type ReadModelMode, type ReadModelScreen } from "../shared/utils/readModelMode";

export type ScreenModeArgs = {
  screen: ReadModelScreen;
  mode: ReadModelMode;
  apply: boolean;
  loopbackFail?: boolean;
  loopbackLagMinutes?: number;
};
/** SPENDLY-601: `readModel.<collection>` (673). */
export type CollectionModeArgs = { collection: string; mode: CollectionMode; apply: boolean };
/** SPENDLY-601: the app-wide switches. */
export const READ_MODEL_SWITCHES = ["localCopy", "realtime", "clientWrites"] as const;
export type SwitchArgs = { switchName: (typeof READ_MODEL_SWITCHES)[number]; value: boolean; apply: boolean };
export type SetModeArgs = ScreenModeArgs | CollectionModeArgs | SwitchArgs;

export function parseSetModeArgs(argv: string[], emulator = false): SetModeArgs {
  const value = (flag: string) => argv.find((a) => a.startsWith(`--${flag}=`))?.split("=")[1];
  const apply = argv.includes("--apply");
  const switchName = value("switch");
  if (switchName !== undefined) {
    if (!(READ_MODEL_SWITCHES as readonly string[]).includes(switchName)) {
      throw new Error(`--switch must be one of: ${READ_MODEL_SWITCHES.join(", ")}`);
    }
    const v = value("value");
    if (v !== "true" && v !== "false") throw new Error("--value must be true or false");
    return { switchName: switchName as SwitchArgs["switchName"], value: v === "true", apply };
  }
  const collection = value("collection");
  if (collection !== undefined) {
    if (!READ_MODEL_COLLECTIONS.includes(collection)) throw new Error(`--collection must be one of: ${READ_MODEL_COLLECTIONS.join(", ")}`);
    const m = value("mode");
    if (!(COLLECTION_MODES as readonly string[]).includes(m ?? "")) throw new Error(`--mode must be one of: ${COLLECTION_MODES.join(", ")}`);
    return { collection, mode: m as CollectionMode, apply };
  }
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
    apply,
    ...(fail !== undefined ? { loopbackFail: fail === "true" } : {}),
    ...(lag !== undefined ? { loopbackLagMinutes: Number(lag) } : {}),
  };
}

/** The field this write changes, e.g. `journal`, `expenses` or `localCopy`. */
export function setModeField(args: SetModeArgs): string {
  if ("switchName" in args) return args.switchName;
  if ("collection" in args) return args.collection;
  return args.screen;
}

/** The merge write: only `readModel.<screen|collection|switch>` changes. */
export function setModePatch(args: SetModeArgs | Pick<ScreenModeArgs, "screen" | "mode" | "loopbackFail" | "loopbackLagMinutes">) {
  if ("switchName" in args) return { readModel: { [args.switchName]: args.value } };
  if ("collection" in args) return { readModel: { [args.collection]: args.mode } };
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
  const field = setModeField(args);
  const next = "switchName" in args ? String(args.value) : args.mode;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const db = getFirestore(
    emulator
      ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
      : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() })
  );
  console.log(emulator ? "Target: Firebase emulator (Spendly Test)" : "Target: PRODUCTION");
  const ref = db.doc("system_settings/global");
  const current = ((await ref.get()).data()?.readModel ?? {}) as Record<string, unknown>;
  console.log(`readModel.${field}: ${String(current[field] ?? "(unset)")} → ${next}`);
  if (!args.apply) {
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
