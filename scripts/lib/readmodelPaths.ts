import type { TableSpec } from "../../shared/utils/readModel/mapping";

/**
 * SPENDLY-672: the uid and read-model doc id of a collection-group result, when
 * its path is exactly this spec's `users/{uid}/{collection}/{id}` (or nested
 * `users/{uid}/{parent}/{pid}/{child}/{id}`); otherwise null.
 */
export function userDocOf(spec: TableSpec, path: string): { uid: string; id: string } | null {
  const parts = path.split("/");
  if (parts[0] !== "users" || !parts[1]) return null;
  if (spec.parent) {
    return parts.length === 6 && parts[2] === spec.parent.collection && parts[4] === spec.parent.child
      ? { uid: parts[1], id: `${parts[3]}/${parts[5]}` }
      : null;
  }
  return parts.length === 4 && parts[2] === spec.collection ? { uid: parts[1], id: parts[3] } : null;
}
