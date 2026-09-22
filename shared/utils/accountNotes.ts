import type { AccountNote } from "../types/expense";

/**
 * Account notes (SPENDLY-89) — pure helpers.
 *
 * Notes are context a user keeps about an account: the branch they opened it
 * at, the relationship manager's name, why a card is being kept open. They are
 * deliberately *not* financial records. Nothing here computes, adjusts or even
 * reads money, and notes are stored in their own collection so that the
 * activity pipeline in `accountBalance.ts` cannot see them at all. A note can
 * never move a balance, change a statement or shift an analytics figure,
 * because no balance, statement or analytic is derived from this file.
 */

export const ACCOUNT_NOTE_TITLE_MAX = 80;
export const ACCOUNT_NOTE_BODY_MAX = 2000;

export interface AccountNoteDraft {
  title: string;
  body: string;
  pinned: boolean;
}

export function createEmptyAccountNoteDraft(): AccountNoteDraft {
  return { title: "", body: "", pinned: false };
}

/** Trim and clamp. Applied before validation and before every write. */
export function normalizeAccountNoteDraft(draft: {
  title?: string;
  body?: string;
  pinned?: boolean;
}): AccountNoteDraft {
  return {
    title: (draft.title ?? "").trim().slice(0, ACCOUNT_NOTE_TITLE_MAX),
    body: (draft.body ?? "").trim().slice(0, ACCOUNT_NOTE_BODY_MAX),
    pinned: draft.pinned === true,
  };
}

/**
 * A note needs a title or a body — not both.
 *
 * Requiring only the title would lose the common case of jotting a paragraph
 * with no obvious heading; requiring both would make the quick jot a form.
 */
export function isAccountNoteDraftValid(draft: {
  title?: string;
  body?: string;
}): boolean {
  const normalized = normalizeAccountNoteDraft(draft);
  return normalized.title.length > 0 || normalized.body.length > 0;
}

/**
 * Millisecond sort key for a note.
 *
 * Reads the client-stamped `updatedAtMs` rather than the `updatedAt`
 * server timestamp. `serverTimestamp()` resolves to null on the local
 * document until the server acknowledges the write, so sorting on it would
 * drop a note the user just saved to the bottom of their own list, and keep it
 * there for the whole of an offline session. The server timestamp is still
 * written, and remains the authority for anything that needs a trustworthy
 * time; this is ordering for a list the user is looking at right now.
 */
export function accountNoteSortMs(note: AccountNote): number {
  const updated = note.updatedAtMs;
  if (typeof updated === "number" && Number.isFinite(updated)) return updated;
  const created = note.createdAtMs;
  if (typeof created === "number" && Number.isFinite(created)) return created;
  return 0;
}

/**
 * Pinned first, then most recently updated. Ties break on id so the order is
 * stable across re-renders rather than dependent on Firestore's doc order.
 */
export function sortAccountNotes(notes: AccountNote[]): AccountNote[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const diff = accountNoteSortMs(b) - accountNoteSortMs(a);
    if (diff !== 0) return diff;
    return (a.id ?? "").localeCompare(b.id ?? "");
  });
}

/**
 * Notes belonging to one account, sorted.
 *
 * The store already queries by `accountId`, so this is defence in depth: the
 * screen holds whatever the last account left behind while the next account's
 * read is in flight, and rendering that unfiltered would show one account's
 * notes under another account's name.
 */
export function selectAccountNotes(
  notes: AccountNote[],
  accountId: string
): AccountNote[] {
  if (!accountId) return [];
  return sortAccountNotes(notes.filter((note) => note.accountId === accountId));
}

/** True when the draft differs from the saved note, so Save can be a no-op. */
export function accountNoteDraftChanged(
  note: Pick<AccountNote, "title" | "body" | "pinned">,
  draft: AccountNoteDraft
): boolean {
  const normalized = normalizeAccountNoteDraft(draft);
  return (
    normalized.title !== (note.title ?? "") ||
    normalized.body !== (note.body ?? "") ||
    normalized.pinned !== (note.pinned === true)
  );
}
