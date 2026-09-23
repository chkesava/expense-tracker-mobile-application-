import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { AccountNote } from "@/shared/types/expense";
import {
  isAccountNoteDraftValid,
  normalizeAccountNoteDraft,
  sortAccountNotes,
  type AccountNoteDraft,
} from "@/shared/utils/accountNotes";

/**
 * Persisting account notes (SPENDLY-89).
 *
 * A one-shot read rather than a listener in `FinanceDataProvider`, for the
 * same reason `accountReconciliationStore` is: notes are read on one screen,
 * by the subset of users who write them, so a session-long subscription on
 * every screen would charge everybody for a feature most never open.
 *
 * Queried by `accountId` alone and ordered on the client. An `orderBy`
 * alongside the `where` would require a composite index, and this repo's index
 * file is known to be a subset of what is actually deployed — a query that
 * needs no index cannot break on release day.
 */

const COLLECTION = "accountNotes";

function notesCollection(database: ReturnType<typeof getFirestoreDb>, uid: string) {
  return collection(database!, "users", uid, COLLECTION);
}

/** Notes for one account, pinned first then most recently updated. */
export async function listAccountNotes(
  uid: string,
  accountId: string
): Promise<AccountNote[]> {
  const database = getFirestoreDb();
  if (!database || !uid || !accountId) return [];

  const snapshot = await getDocs(
    query(notesCollection(database, uid), where("accountId", "==", accountId))
  );

  return sortAccountNotes(
    snapshot.docs.map(
      (entry) => ({ id: entry.id, ...entry.data() }) as AccountNote
    )
  );
}

/**
 * Creates a note. Writes one document and nothing else.
 *
 * In particular it touches no account, entry, expense or balance: a note is
 * context, not a transaction.
 */
export async function createAccountNote(
  uid: string,
  accountId: string,
  draft: AccountNoteDraft
): Promise<string | null> {
  const database = getFirestoreDb();
  if (!database || !uid || !accountId) return null;

  const normalized = normalizeAccountNoteDraft(draft);
  if (!isAccountNoteDraftValid(normalized)) return null;

  const now = Date.now();
  const ref = doc(notesCollection(database, uid));
  await commitMutations(
    uid,
    [
      {
        op: "set",
        ref,
        data: {
          accountId,
          title: normalized.title,
          body: normalized.body,
          pinned: normalized.pinned,
          createdAtMs: now,
          updatedAtMs: now,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      },
    ],
    { label: "account note" }
  );
  return ref.id;
}

/**
 * Edits a note's content.
 *
 * `accountId` and `createdAt*` are deliberately not in the payload: a note
 * cannot be moved to another account by editing it, which keeps the account
 * scoping a property of the document rather than of the last write to it.
 */
export async function updateAccountNote(
  uid: string,
  noteId: string,
  draft: AccountNoteDraft
): Promise<boolean> {
  const database = getFirestoreDb();
  if (!database || !uid || !noteId) return false;

  const normalized = normalizeAccountNoteDraft(draft);
  if (!isAccountNoteDraftValid(normalized)) return false;

  await commitMutations(
    uid,
    [
      {
        op: "update",
        ref: doc(database, "users", uid, COLLECTION, noteId),
        data: {
          title: normalized.title,
          body: normalized.body,
          pinned: normalized.pinned,
          updatedAtMs: Date.now(),
          updatedAt: serverTimestamp(),
        },
      },
    ],
    { label: "account note" }
  );
  return true;
}

/** Pins or unpins without otherwise touching the note's content. */
export async function setAccountNotePinned(
  uid: string,
  noteId: string,
  pinned: boolean
): Promise<boolean> {
  const database = getFirestoreDb();
  if (!database || !uid || !noteId) return false;

  await commitMutations(
    uid,
    [
      {
        op: "update",
        ref: doc(database, "users", uid, COLLECTION, noteId),
        data: {
          pinned,
          updatedAtMs: Date.now(),
          updatedAt: serverTimestamp(),
        },
      },
    ],
    { label: "account note" }
  );
  return true;
}

/**
 * Deletes a note outright.
 *
 * A hard delete rather than the soft-delete the journal collections use:
 * there is no ledger to reconstruct here and nothing downstream refers to a
 * note, so keeping a tombstone would retain the user's private text after they
 * asked for it to be gone. The confirmation lives at the call site.
 */
export async function deleteAccountNote(
  uid: string,
  noteId: string
): Promise<boolean> {
  const database = getFirestoreDb();
  if (!database || !uid || !noteId) return false;

  await commitMutations(
    uid,
    [{ op: "delete", ref: doc(database, "users", uid, COLLECTION, noteId) }],
    { label: "account note" }
  );
  return true;
}
