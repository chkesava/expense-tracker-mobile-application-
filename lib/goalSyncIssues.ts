/**
 * SPENDLY-613 — goal writes that failed after the user was told they were
 * saved or queued (FRD FR-13: never silently discard a mutation after saying
 * it was queued).
 *
 * The outbox already reports a late failure; for goals, each one is also kept
 * here — with what failed, why, and a retry that re-applies the same intent
 * with the same idempotency key against the latest goal — until the user
 * retries or dismisses it. In memory for the session: a failure that happens
 * after a restart (outbox replay) is still reported by the outbox's toast.
 */

export type GoalSyncIssue = {
  id: string;
  goalId: string;
  label: string;
  message: string;
  atMs: number;
  /** Re-applies the change; resolves true when it saved. */
  retry?: () => Promise<boolean>;
};

type Listener = () => void;

let issues: readonly GoalSyncIssue[] = [];
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

export const goalSyncIssues = {
  list: (): readonly GoalSyncIssue[] => issues,
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** One entry per id: a second failure of the same submit replaces the first. */
  add(issue: GoalSyncIssue): void {
    issues = [...issues.filter((i) => i.id !== issue.id), issue];
    emit();
  },
  dismiss(id: string): void {
    const next = issues.filter((i) => i.id !== id);
    if (next.length === issues.length) return;
    issues = next;
    emit();
  },
  /** Retries; the entry goes when the retry saves, and stays (updated by a new failure) otherwise. */
  async retry(id: string): Promise<boolean> {
    const issue = issues.find((i) => i.id === id);
    if (!issue?.retry) return false;
    const ok = await issue.retry();
    if (ok) goalSyncIssues.dismiss(id);
    return ok;
  },
  /** Tests / sign-out. */
  clear(): void {
    issues = [];
    emit();
  },
};
