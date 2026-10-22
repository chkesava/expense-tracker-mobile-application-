import type { ReadModelMode, ReadModelScreen } from "@/shared/utils/readModelMode";

/**
 * SPENDLY-511 — serves one read through the screen's mode, with the
 * Firestore source as the fallback.
 *
 * - `firestore`: only the Firestore source runs. Nothing else is touched.
 * - `supabase`: the read model, under a timeout. On an error or a timeout the
 *   screen falls back to Firestore for the rest of the session, and the
 *   failure is logged once (no toast, no loop).
 * - `shadow`: Firestore serves; the read model is fetched in the background,
 *   compared, and differences are logged (at most once per screen per
 *   interval). The user never sees the read-model result.
 *
 * The Firestore sources passed in are the screens' existing bounded queries,
 * so a fallback can never become an unbounded read.
 */
export type ReadPathDeps = {
  timeoutMs: number;
  log: (event: string, detail: unknown) => void;
  now?: () => number;
  /** Minimum gap between two shadow-diff logs for one screen. */
  shadowLogIntervalMs?: number;
};

type Fetcher<T> = () => Promise<T>;

export type ReadPath = {
  read<T>(screen: ReadModelScreen, mode: ReadModelMode, sources: {
    firestore: Fetcher<T>;
    supabase: Fetcher<T> | null;
    compare?: (firestore: T, supabase: T) => string[];
  }): Promise<{ value: T; servedBy: "firestore" | "supabase" }>;
  /** True once a screen has fallen back this session. */
  fellBack(screen: ReadModelScreen): boolean;
  /** Clears session state (sign-out, tests). */
  reset(): void;
};

export class ReadModelTimeout extends Error {
  constructor(ms: number) {
    super(`read model did not answer within ${ms} ms`);
    this.name = "ReadModelTimeout";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ReadModelTimeout(ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function createReadPath(deps: ReadPathDeps): ReadPath {
  const now = deps.now ?? Date.now;
  const fallen = new Set<ReadModelScreen>();
  const lastShadowLog = new Map<ReadModelScreen, number>();
  const shadowInterval = deps.shadowLogIntervalMs ?? 10 * 60 * 1000;

  return {
    async read(screen, mode, sources) {
      if (mode === "firestore" || !sources.supabase || fallen.has(screen)) {
        return { value: await sources.firestore(), servedBy: "firestore" };
      }

      if (mode === "shadow") {
        const value = await sources.firestore();
        const supabase = sources.supabase;
        void withTimeout(supabase(), deps.timeoutMs)
          .then((theirs) => {
            const diffs = sources.compare ? sources.compare(value, theirs) : [];
            const last = lastShadowLog.get(screen) ?? -Infinity;
            if (diffs.length && now() - last >= shadowInterval) {
              lastShadowLog.set(screen, now());
              deps.log(`readModel.shadow.${screen}`, { differences: diffs.slice(0, 20), count: diffs.length });
            }
          })
          .catch((error) => deps.log(`readModel.shadow.${screen}.error`, error));
        return { value, servedBy: "firestore" };
      }

      try {
        return { value: await withTimeout(sources.supabase(), deps.timeoutMs), servedBy: "supabase" };
      } catch (error) {
        fallen.add(screen);
        deps.log(`readModel.fallback.${screen}`, error);
        return { value: await sources.firestore(), servedBy: "firestore" };
      }
    },
    fellBack: (screen) => fallen.has(screen),
    reset() {
      fallen.clear();
      lastShadowLog.clear();
    },
  };
}

/** Shadow comparison for ledger rows: ids present on one side only, and differing amounts or dates. */
export function compareLedgerRows<T extends { id?: string; amount?: unknown; date?: unknown }>(firestore: T[], supabase: T[]): string[] {
  const theirs = new Map(supabase.map((r) => [r.id, r]));
  const mine = new Map(firestore.map((r) => [r.id, r]));
  const diffs: string[] = [];
  for (const [id, row] of mine) {
    const other = theirs.get(id);
    if (!other) diffs.push(`missing in read model: ${id}`);
    else if (Number(row.amount).toFixed(2) !== Number(other.amount).toFixed(2) || row.date !== other.date) diffs.push(`differs: ${id}`);
  }
  for (const id of theirs.keys()) if (!mine.has(id)) diffs.push(`only in read model: ${id}`);
  return diffs;
}
