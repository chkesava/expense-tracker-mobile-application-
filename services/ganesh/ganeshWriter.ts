import type {
  DocumentData,
  DocumentReference,
  SetOptions,
  UpdateData,
  WithFieldValue,
} from "firebase/firestore";

/**
 * The slice of `WriteBatch` and `Transaction` that the Ganesh ledger helpers
 * use. Both classes expose the same `set` / `update` shape, so a helper written
 * against this type appends to either one.
 *
 * Which one a write path picks is a real decision, not a style choice:
 *
 * - **Batch** for writes that only append. These stay usable offline: the
 *   mutation is queued in the local cache and `commitWrite` reports it as
 *   `queued` rather than hanging the save button on a promise that only settles
 *   when the server acks.
 * - **Transaction** for writes that must not exceed a balance. A batch cannot
 *   express "read this balance, then write, with nothing in between" — the read
 *   has to happen inside the transaction so a concurrent writer forces a retry
 *   instead of both writers passing the same stale check. Transactions do not
 *   work offline, which is why those paths gate on connectivity first and say
 *   so, rather than failing opaquely or queueing a write that can never commit.
 */
export type GaneshWriter = {
  set(
    ref: DocumentReference<DocumentData>,
    data: WithFieldValue<DocumentData>,
    options?: SetOptions
  ): void;
  update(ref: DocumentReference<DocumentData>, data: UpdateData<DocumentData>): void;
};
