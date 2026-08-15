/**
 * State bundle for a data hook that can fail to load.
 *
 * `attempt` belongs in the subscribing effect's dependency array — bumping it
 * is what actually tears down a dead Firestore listener and establishes a new
 * one, so `retry()` re-runs the query rather than only clearing the message.
 */

import { useCallback, useState } from "react";

import type { LoadFailure } from "@/lib/firestoreErrors";

export type UseLoadFailure = {
  error: LoadFailure | null;
  setError: (failure: LoadFailure | null) => void;
  retry: () => void;
  attempt: number;
};

export function useLoadFailure(): UseLoadFailure {
  const [error, setError] = useState<LoadFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  return { error, setError, retry, attempt };
}
