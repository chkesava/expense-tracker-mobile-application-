/**
 * EPF transfers between establishments — KAN-69.
 *
 * Thin by design: every rule lives in `shared/features/epf/utils/transfers.ts`,
 * because `vitest.config.ts` never runs `hooks/**`.
 *
 * Unfiltered listener on purpose — a person makes a handful of transfers in a
 * working lifetime, and the balance calculation needs all of them regardless of
 * which establishment is on screen. No filter means no composite index and no
 * deploy dependency.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import type { EpfTransfer, EpfTransferStatus } from "@/shared/features/epf/types";
import {
  EPF_TRANSFER_EVENTS_COLLECTION,
  EPF_TRANSFERS_COLLECTION,
} from "@/shared/features/epf/types";
import {
  buildReversal,
  canCompleteTransfer,
  canFailTransfer,
  canReverseTransfer,
  normalizeTransfer,
} from "@/shared/features/epf/utils/transfers";
import { epfTodayKey } from "@/shared/features/epf/utils/epfClock";
import { withoutUndefined } from "@/shared/utils/objects";

export type EpfTransferInput = Pick<
  EpfTransfer,
  | "sourceEstablishmentId"
  | "destinationEstablishmentId"
  | "amount"
  | "date"
  | "reference"
  | "notes"
  | "adjustmentReason"
>;

export function useEpfTransfers(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  // Duress-aware uid, matching every other EPF hook.
  const { user } = useAuth();
  const uid = user?.uid;

  const [transfers, setTransfers] = useState<EpfTransfer[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(true);
  const {
    error: transfersError,
    setError: setTransfersError,
    retry: retryTransfers,
    attempt,
  } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setTransfers([]);
      setTransfersLoading(false);
      return;
    }

    setTransfersLoading(true);
    const path = `users/${uid}/${EPF_TRANSFERS_COLLECTION}`;

    const unsubscribe = onSnapshot(
      collection(db, "users", uid, EPF_TRANSFERS_COLLECTION),
      (snapshot) => {
        logQuerySnapshot(path, snapshot);
        setTransfers(
          snapshot.docs.map((docSnap) =>
            normalizeTransfer(docSnap.id, docSnap.data() as Record<string, unknown>)
          )
        );
        setTransfersError(null);
        setTransfersLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.epfTransfers",
        (failure) => {
          setTransfersError(failure);
          setTransfersLoading(false);
        },
        "Couldn't load your EPF transfers."
      )
    );

    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, attempt]);

  const byId = useMemo(
    () => new Map(transfers.map((transfer) => [transfer.id, transfer])),
    [transfers]
  );

  /** Append one audit row. Always batched with the change it describes. */
  const eventPayload = (
    transferId: string,
    from: EpfTransferStatus | "none",
    to: EpfTransferStatus,
    meta: { actor: "system" | "user"; amount?: number; reason?: string }
  ) =>
    withoutUndefined({
      transferId,
      from,
      to,
      amount: meta.amount,
      actor: meta.actor,
      reason: meta.reason,
      at: serverTimestamp(),
    });

  const createTransfer = useCallback(
    async (input: EpfTransferInput): Promise<string | null> => {
      const db = getFirestoreDb();
      if (!uid || !db) {
        toast.error("Not authenticated");
        return null;
      }

      try {
        const ref = doc(collection(db, "users", uid, EPF_TRANSFERS_COLLECTION));
        const batch = writeBatch(db);
        batch.set(
          ref,
          withoutUndefined({
            ...input,
            reference: input.reference || undefined,
            notes: input.notes || undefined,
            adjustmentReason: input.adjustmentReason || undefined,
            status: "initiated" as EpfTransferStatus,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            statusUpdatedAt: serverTimestamp(),
          })
        );
        batch.set(
          doc(collection(db, "users", uid, EPF_TRANSFER_EVENTS_COLLECTION)),
          eventPayload(ref.id, "none", "initiated", {
            actor: "user",
            amount: input.amount,
          })
        );

        const outcome = await commitWrite(() => batch.commit(), { label: "EPF transfer" });
        toast.success(writeSavedMessage(outcome, "Transfer recorded"));
        return ref.id;
      } catch (err) {
        logError("epftransfers.createtransfer", err);
        toast.error("Failed to record transfer");
        return null;
      }
    },
    [uid]
  );

  /**
   * Settle a transfer.
   *
   * Runs in a transaction that re-reads the document and aborts unless it is
   * still `initiated`, so a replayed or double-tapped completion cannot apply
   * the amount twice. (Client transactions can `get` a document — the KAN-65
   * constraint was only about reading *queries*.)
   */
  const settleTransfer = useCallback(
    async (
      transferId: string,
      status: Extract<EpfTransferStatus, "completed" | "failed">,
      reason?: string
    ): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db) {
        toast.error("Not authenticated");
        return false;
      }

      const ref = doc(db, "users", uid, EPF_TRANSFERS_COLLECTION, transferId);
      const eventRef = doc(collection(db, "users", uid, EPF_TRANSFER_EVENTS_COLLECTION));

      try {
        await commitWrite(
          () =>
            runTransaction(db, async (tx) => {
              const snap = await tx.get(ref);
              if (!snap.exists()) throw new Error("MISSING");

              const current = normalizeTransfer(snap.id, snap.data() as Record<string, unknown>);
              const allowed =
                status === "completed"
                  ? canCompleteTransfer(current)
                  : canFailTransfer(current);
              if (!allowed) throw new Error("ALREADY_SETTLED");

              tx.update(ref, {
                status,
                statusReason: reason ?? null,
                statusUpdatedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              tx.set(
                eventRef,
                eventPayload(transferId, current.status, status, {
                  actor: "user",
                  amount: current.amount,
                  reason,
                })
              );
            }),
          { label: "EPF transfer" }
        );
        toast.success(status === "completed" ? "Transfer completed" : "Transfer marked failed");
        return true;
      } catch (err) {
        if (err instanceof Error && err.message === "ALREADY_SETTLED") {
          toast.error("That transfer has already been settled.");
          return false;
        }
        logError("epftransfers.settletransfer", err);
        toast.error("Couldn't update that transfer");
        return false;
      }
    },
    [uid]
  );

  const completeTransfer = useCallback(
    (transferId: string) => settleTransfer(transferId, "completed"),
    [settleTransfer]
  );

  const failTransfer = useCallback(
    (transferId: string, reason: string) => settleTransfer(transferId, "failed", reason),
    [settleTransfer]
  );

  /**
   * Reverse a settled transfer with a compensating row.
   *
   * The original is never deleted or flipped — it did happen. One batch writes
   * the compensating transfer, the back-pointer and the audit event, so a
   * reversal can never half-apply and leave the ledger unbalanced.
   */
  const reverseTransfer = useCallback(
    async (transferId: string, reason: string): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db) {
        toast.error("Not authenticated");
        return false;
      }

      const original = byId.get(transferId);
      if (!original) {
        toast.error("Transfer not found");
        return false;
      }
      if (!canReverseTransfer(original)) {
        toast.error("Only a completed transfer that has not been reversed can be reversed.");
        return false;
      }

      try {
        const batch = writeBatch(db);
        const reversalRef = doc(collection(db, "users", uid, EPF_TRANSFERS_COLLECTION));

        batch.set(
          reversalRef,
          withoutUndefined({
            ...buildReversal(original, epfTodayKey(), reason),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            statusUpdatedAt: serverTimestamp(),
          })
        );
        batch.update(doc(db, "users", uid, EPF_TRANSFERS_COLLECTION, transferId), {
          reversedBy: reversalRef.id,
          updatedAt: serverTimestamp(),
        });
        batch.set(
          doc(collection(db, "users", uid, EPF_TRANSFER_EVENTS_COLLECTION)),
          eventPayload(transferId, original.status, "completed", {
            actor: "user",
            amount: original.amount,
            reason: `Reversed: ${reason}`,
          })
        );

        const outcome = await commitWrite(() => batch.commit(), {
          label: "EPF transfer reversal",
        });
        toast.success(writeSavedMessage(outcome, "Transfer reversed"));
        return true;
      } catch (err) {
        logError("epftransfers.reversetransfer", err);
        toast.error("Couldn't reverse that transfer");
        return false;
      }
    },
    [uid, byId]
  );

  /** Confirm a simulated transfer against a real EPFO one. */
  const reconcileTransfer = useCallback(
    async (transferId: string): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db) {
        toast.error("Not authenticated");
        return false;
      }

      try {
        const outcome = await commitWrite(
          () =>
            writeBatch(db)
              .update(doc(db, "users", uid, EPF_TRANSFERS_COLLECTION, transferId), {
                reconciledAt: new Date().toISOString(),
                updatedAt: serverTimestamp(),
              })
              .commit(),
          { label: "EPF transfer" }
        );
        toast.success(writeSavedMessage(outcome, "Transfer confirmed"));
        return true;
      } catch (err) {
        logError("epftransfers.reconciletransfer", err);
        toast.error("Couldn't confirm that transfer");
        return false;
      }
    },
    [uid]
  );

  return {
    transfers,
    byId,
    transfersLoading,
    transfersError,
    retryTransfers,

    createTransfer,
    completeTransfer,
    failTransfer,
    reverseTransfer,
    reconcileTransfer,
  };
}
