import type { Firestore } from "@/lib/firestore";

import { logWarning } from "@/lib/errors";
import { connectReadModel, type ReadModelUser } from "@/lib/readModelClient";
import {
  configuredReadModelMode,
  effectiveReadModelMode,
  type ReadModelMode,
  type ReadModelScreen,
} from "@/shared/utils/readModelMode";

import { loopbackBackend, supabaseBackend, type LoopbackKnobs, type ReadModelBackend } from "./backend";
import { createReadPath, type ReadPath } from "./readPath";

/**
 * SPENDLY-511/512/513 — the one session read path every read-model screen
 * shares, and the resolver that picks a screen's mode and read model.
 *
 * Each screen has its own switch (`system_settings/global.readModel.<screen>`)
 * and its own fallback state: a failing Insights read never moves the Journal
 * back to Firestore. With a screen's setting unset or `firestore` (the
 * default) no read-model connection is attempted for it.
 *
 * The read model is Supabase in normal builds and the loopback (backend.ts)
 * in local test builds, so Spendly Test can exercise every mode on a phone.
 */
export const READ_MODEL_TIMEOUT_MS = 4000;

let sharedPath: ReadPath = createReadPath({
  timeoutMs: READ_MODEL_TIMEOUT_MS,
  log: (event, detail) => logWarning(event, detail),
});

export function readModelPath(): ReadPath {
  return sharedPath;
}

/** Tests only. */
export function setReadModelPathForTests(path: ReadPath): void {
  sharedPath = path;
}

export type ReadModelReadConditions = {
  /** `system_settings/global.readModel` */
  setting: unknown;
  online: boolean;
  duress: boolean;
  /** A local test build (Firebase emulator): use the loopback, never Supabase. */
  localTestMode?: boolean;
};
export type ReadModelReadUser = (ReadModelUser & { uid: string }) | null;

function loopbackKnobs(setting: unknown): LoopbackKnobs {
  const s = (setting && typeof setting === "object" ? setting : {}) as Record<string, unknown>;
  return {
    fail: s.loopbackFail === true,
    lagMinutes: typeof s.loopbackLagMinutes === "number" ? s.loopbackLagMinutes : 0,
  };
}

/** The mode this read runs in for `screen`, and the read model it may use. */
export async function resolveReadModelBackend(
  screen: ReadModelScreen,
  input: {
    db: Firestore;
    user: ReadModelReadUser;
    conditions: ReadModelReadConditions;
    connect?: typeof connectReadModel;
  }
): Promise<{ mode: ReadModelMode; backend: ReadModelBackend | null }> {
  const configured = configuredReadModelMode(input.conditions.setting, screen);
  if (configured === "firestore") return { mode: "firestore", backend: null };
  let backend: ReadModelBackend | null = null;
  if (input.conditions.online && !input.conditions.duress && input.user) {
    if (input.conditions.localTestMode) {
      backend = loopbackBackend(input.db, input.user.uid, loopbackKnobs(input.conditions.setting));
    } else {
      try {
        const client = (await (input.connect ?? connectReadModel)(input.user)).client;
        if (client) backend = supabaseBackend(client);
      } catch (error) {
        logWarning("readModel.connect", error);
      }
    }
  }
  const mode = effectiveReadModelMode({
    configured,
    online: input.conditions.online,
    duress: input.conditions.duress,
    available: !!backend,
    fellBack: sharedPath.fellBack(screen),
  });
  return { mode, backend: mode === "firestore" ? null : backend };
}
