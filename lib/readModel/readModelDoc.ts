import { Timestamp } from "firebase/firestore";

/**
 * SPENDLY-512 — a read-model row back as the app object Firestore would have
 * returned: the source `doc` plus `id`. The sync stores timestamps as ISO
 * strings (toJsonDoc), so `createdAt` / `updatedAt` become Firestore
 * `Timestamp`s again; the same instant either way, but every caller then sees
 * exactly the shape it gets from Firestore.
 */
const TIMESTAMP_FIELDS = ["createdAt", "updatedAt"] as const;

export function fromReadModelDoc<T>(docId: string, doc: Record<string, unknown> | null): T {
  const out: Record<string, unknown> = { ...(doc ?? {}) };
  for (const field of TIMESTAMP_FIELDS) {
    const value = out[field];
    if (typeof value === "string") {
      const ms = Date.parse(value);
      if (Number.isFinite(ms)) out[field] = Timestamp.fromMillis(ms);
    }
  }
  out.id = docId;
  return out as T;
}
