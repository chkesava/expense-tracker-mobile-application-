import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  or,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";

import { friendlyErrorMessage, logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type { Participant, Split } from "@/shared/types/split";
import type { QrStyleId } from "@/shared/utils/qrStyles";
import { getStoredQrStyleId } from "@/shared/utils/qrStyles";
import { currentMonthKey, todayDateKey } from "@/shared/utils/dates";
import { omitUndefined } from "@/shared/utils/firestorePayload";
import { generatePaymentSlug } from "@/shared/utils/paymentSlug";
import {
  applyShareRequestsToParticipants,
  buildCreateSplitPayload,
  buildMarkCollectedWrites,
  buildParticipantShareRequests,
  buildPaymentRequestSyncPatches,
  buildSpendGiftWrites,
  buildUnmarkCollectedWrites,
  linkedLedgerIds,
  toFirestoreParticipant,
  withParticipantKeys,
  type CreateSplitInput,
} from "@/shared/utils/splitLedger";
import { buildSplitPublicSharePayloadFromSplit } from "@/shared/utils/splitPublicShare";
import {
  isCollectSplit,
  isParticipantContributing,
  isParticipantShareSettled,
  participantRemainingDue,
  recalibrateSplitAfterOptOut,
} from "@/shared/utils/splitMath";

function applyShareSideEffects(
  batch: WriteBatch,
  db: Firestore,
  split: Split,
  participants: Participant[],
  extraSplitFields: Record<string, unknown>
) {
  const publicSlug = split.publicSlug || generatePaymentSlug(10);
  const shareRef = split.publicShareId
    ? doc(db, "splitPublicShares", split.publicShareId)
    : doc(collection(db, "splitPublicShares"));
  const settled = Boolean(extraSplitFields.settled ?? split.settled);

  batch.update(
    doc(db, "splits", split.id as string),
    omitUndefined({
      participants: participants.map(toFirestoreParticipant),
      publicSlug,
      publicShareId: shareRef.id,
      ...extraSplitFields,
    })
  );

  batch.set(
    shareRef,
    buildSplitPublicSharePayloadFromSplit(
      {
        ...split,
        participants,
        settled,
        status: (extraSplitFields.status as Split["status"]) ?? split.status,
      },
      {
        slug: publicSlug,
        settled,
        updatedAt: Date.now(),
      }
    ),
    { merge: true }
  );

  for (const patch of buildPaymentRequestSyncPatches(participants)) {
    batch.update(doc(db, "paymentRequests", patch.requestId), patch.fields);
  }
}

export function useSplits(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;

  const [splits, setSplits] = useState<Split[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setSplits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "splits"),
      or(
        where("createdBy", "==", uid),
        where("participantIds", "array-contains", uid)
      )
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Split[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Split, "id">),
        }));
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setSplits(list);
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.splits",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your splits."
      )
    );

    return unsubscribe;
  }, [uid, enabled, attempt]);

  const createSplit = async (
    splitData: CreateSplitInput,
    createOptions?: {
      createPersonalExpense?: boolean;
      accountId?: string;
      organizerUpiId?: string;
      payeePhotoUrl?: string;
      qrStyleId?: QrStyleId;
    }
  ): Promise<string | null> => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      toast.error("You're not signed in. Sign in and try again.");
      return null;
    }

    try {
      const keyedParticipants = withParticipantKeys(splitData.participants);
      const docRef = doc(collection(db, "splits"));
      const publicShareRef = doc(collection(db, "splitPublicShares"));
      const publicSlug = generatePaymentSlug(10);
      const createdAt = Date.now();
      const createdByName =
        user?.displayName || user?.email?.split("@")[0] || "Me";

      const batch = writeBatch(db);
      const paymentRequestIds: string[] = [];
      let participants = keyedParticipants;

      if (createOptions?.organizerUpiId) {
        const shares = buildParticipantShareRequests({
          splitId: docRef.id,
          splitTitle: splitData.title,
          createdBy: uid,
          createdAt,
          payeeName: createdByName,
          payeePhotoUrl: createOptions.payeePhotoUrl,
          upiId: createOptions.organizerUpiId,
          qrStyleId: createOptions.qrStyleId || getStoredQrStyleId(),
          participants: keyedParticipants,
        });

        const applied = shares.map((share) => {
          const requestRef = doc(collection(db, "paymentRequests"));
          batch.set(requestRef, {
            ...share.payload,
            createdAt,
          });
          paymentRequestIds.push(requestRef.id);
          return {
            participantKey: share.participantKey,
            slug: share.slug,
            requestId: requestRef.id,
          };
        });
        participants = applyShareRequestsToParticipants(
          keyedParticipants,
          applied
        );
      }

      const { split, expense } = buildCreateSplitPayload({
        uid,
        createdByName,
        createdAt,
        data: {
          ...splitData,
          participants,
          paymentRequestIds,
          publicSlug,
          publicShareId: publicShareRef.id,
        },
        options: createOptions,
        dateKey: todayDateKey(),
        monthKey: currentMonthKey(),
        splitId: docRef.id,
      });

      batch.set(docRef, split);
      batch.set(
        publicShareRef,
        buildSplitPublicSharePayloadFromSplit(
          {
            id: docRef.id,
            title: splitData.title,
            totalAmount: splitData.totalAmount,
            splitType: splitData.splitType,
            participants,
            createdBy: uid,
            createdByName,
            createdAt,
            settled: false,
            participantIds: [],
            kind: splitData.kind,
            status: splitData.kind === "collect" ? "collecting" : undefined,
            publicSlug,
            publicShareId: publicShareRef.id,
          },
          { slug: publicSlug, settled: false, updatedAt: createdAt }
        )
      );

      if (expense) {
        batch.set(doc(collection(db, "users", uid, "expenses")), {
          ...expense,
          createdAt: serverTimestamp(),
        });
      }

      const outcome = await commitWrite(() => batch.commit(), { label: "split" });
      toast.success(writeSavedMessage(outcome, "Split created successfully"));
      return docRef.id;
    } catch (err) {
      logError("splits.createsplit", err);
      toast.error(friendlyErrorMessage(err, "Failed to create split"));
      return null;
    }
  };

  const updateSplit = async (
    id: string,
    updates: Partial<Split>
  ): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !id) return false;

    try {
      const outcome = await commitWrite(
        () => updateDoc(doc(db, "splits", id), omitUndefined(updates)),
        { label: "split" }
      );
      toast.success(writeSavedMessage(outcome, "Split updated"));
      return true;
    } catch (err) {
      logError("splits.updatesplit", err);
      toast.error(friendlyErrorMessage(err, "Failed to update split"));
      return false;
    }
  };

  const toggleParticipantPaid = async (
    splitId: string,
    participantIndex: number,
    newPaid: boolean
  ): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !splitId) return false;

    const split = splits.find((s) => s.id === splitId);
    if (!split) return false;

    const target = split.participants[participantIndex];
    if (!target) return false;

    if (isCollectSplit(split)) {
      const organizerTopUp =
        target.isCurrentUser &&
        newPaid &&
        isParticipantContributing(target) &&
        participantRemainingDue(target) > 0.009;
      if (!organizerTopUp) {
        toast.error("Mark collected and choose the account that received the money.");
        return false;
      }
    }

    const updatedParticipants = split.participants.map((p, idx) => {
      if (idx !== participantIndex) return p;
      if (!isParticipantContributing(p)) return p;
      if (newPaid) {
        return { ...p, paid: true, paidAmount: Number(p.amount) || 0 };
      }
      return { ...p, paid: false, paidAmount: 0 };
    });

    const isAllPaid = updatedParticipants.every((p) => isParticipantShareSettled(p));

    try {
      const batch = writeBatch(db);
      applyShareSideEffects(batch, db, split, updatedParticipants, {
        settled: isAllPaid,
      });
      await commitWrite(() => batch.commit(), { label: "settlement status" });
      return true;
    } catch (err) {
      logError("splits.toggleparticipantpaid", err);
      toast.error(friendlyErrorMessage(err, "Failed to update settlement status"));
      return false;
    }
  };

  const markParticipantCollected = async (
    splitId: string,
    participantKey: string,
    accountId: string
  ): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !splitId) return false;

    const split = splits.find((s) => s.id === splitId);
    if (!split) return false;

    const entryRef = doc(collection(db, "users", uid, "accountEntries"));
    const built = buildMarkCollectedWrites({
      split,
      participantKey,
      accountId,
      entryId: entryRef.id,
      dateKey: todayDateKey(),
    });
    if ("error" in built) {
      toast.error(built.error);
      return false;
    }

    try {
      const batch = writeBatch(db);
      batch.set(entryRef, { ...built.entry, createdAt: serverTimestamp() });
      applyShareSideEffects(batch, db, split, built.participants, {
        settled: built.settled,
      });
      await commitWrite(() => batch.commit(), { label: "collection" });
      toast.success("Marked as collected");
      return true;
    } catch (err) {
      logError("splits.markcollected", err);
      toast.error(friendlyErrorMessage(err, "Failed to mark collected"));
      return false;
    }
  };

  const unmarkParticipantCollected = async (
    splitId: string,
    participantKey: string
  ): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !splitId) return false;

    const split = splits.find((s) => s.id === splitId);
    if (!split) return false;

    const built = buildUnmarkCollectedWrites({ split, participantKey });
    if ("error" in built) {
      toast.error(built.error);
      return false;
    }

    try {
      const batch = writeBatch(db);
      for (const entryId of built.entryIdsToDelete) {
        batch.delete(doc(db, "users", uid, "accountEntries", entryId));
      }
      applyShareSideEffects(batch, db, split, built.participants, {
        settled: built.settled,
      });
      await commitWrite(() => batch.commit(), { label: "collection" });
      return true;
    } catch (err) {
      logError("splits.unmarkcollected", err);
      toast.error(friendlyErrorMessage(err, "Failed to undo collection"));
      return false;
    }
  };

  const spendCollectPot = async (
    splitId: string,
    spendAmount: number,
    payingAccountId: string
  ): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !splitId) return false;

    const split = splits.find((s) => s.id === splitId);
    if (!split) return false;

    const expenseRef = doc(collection(db, "users", uid, "expenses"));
    const passRef = doc(collection(db, "users", uid, "accountEntries"));
    const built = buildSpendGiftWrites({
      split,
      spendAmount,
      payingAccountId,
      dateKey: todayDateKey(),
      monthKey: currentMonthKey(),
      expenseId: expenseRef.id,
      passThroughEntryId: passRef.id,
    });
    if ("error" in built) {
      toast.error(built.error);
      return false;
    }

    try {
      const batch = writeBatch(db);
      if (built.expense) {
        batch.set(expenseRef, {
          ...built.expense,
          createdAt: serverTimestamp(),
        });
      }
      if (built.passThroughEntry) {
        batch.set(passRef, {
          ...built.passThroughEntry,
          createdAt: serverTimestamp(),
        });
      }
      applyShareSideEffects(batch, db, split, split.participants, built.splitUpdates);
      const outcome = await commitWrite(() => batch.commit(), {
        label: "gift purchase",
      });
      toast.success(writeSavedMessage(outcome, "Gift purchase recorded"));
      return true;
    } catch (err) {
      logError("splits.spendcollect", err);
      toast.error(friendlyErrorMessage(err, "Failed to record gift purchase"));
      return false;
    }
  };

  const settleAll = async (splitId: string): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !splitId) return false;

    const split = splits.find((s) => s.id === splitId);
    if (!split) return false;

    if (isCollectSplit(split)) {
      toast.error("Use “Use money for gift” after collecting — Settle All is for bill splits.");
      return false;
    }

    const updatedParticipants = split.participants.map((p) =>
      isParticipantContributing(p)
        ? { ...p, paid: true, paidAmount: Number(p.amount) || 0 }
        : p
    );

    try {
      const batch = writeBatch(db);
      applyShareSideEffects(batch, db, split, updatedParticipants, {
        settled: true,
      });
      const outcome = await commitWrite(() => batch.commit(), {
        label: "split settlement",
      });
      toast.success(writeSavedMessage(outcome, "Split marked as fully settled!"));
      return true;
    } catch (err) {
      logError("splits.settleall", err);
      toast.error(friendlyErrorMessage(err, "Failed to settle split"));
      return false;
    }
  };

  const optOutParticipant = async (
    splitId: string,
    participantKey: string
  ): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !splitId) return false;

    const split = splits.find((s) => s.id === splitId);
    if (!split) return false;
    if (split.createdBy !== uid) {
      toast.error("Only the organizer can drop someone from this split.");
      return false;
    }

    const built = recalibrateSplitAfterOptOut(split, participantKey);
    if ("error" in built) {
      toast.error(built.error);
      return false;
    }

    try {
      const batch = writeBatch(db);
      applyShareSideEffects(batch, db, split, built.participants, {
        settled: built.settled,
      });
      await commitWrite(() => batch.commit(), { label: "split opt-out" });
      toast.success("Shares updated");
      return true;
    } catch (err) {
      logError("splits.optout", err);
      toast.error(friendlyErrorMessage(err, "Failed to update shares"));
      return false;
    }
  };

  const deleteSplit = async (id: string): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !id) return false;

    const split = splits.find((s) => s.id === id);

    try {
      const batch = writeBatch(db);
      if (split) {
        const linked = linkedLedgerIds(split);
        for (const entryId of linked.entryIds) {
          batch.delete(doc(db, "users", uid, "accountEntries", entryId));
        }
        for (const expenseId of linked.expenseIds) {
          batch.delete(doc(db, "users", uid, "expenses", expenseId));
        }
        for (const requestId of linked.paymentRequestIds) {
          batch.delete(doc(db, "paymentRequests", requestId));
        }
        if (linked.publicShareId) {
          batch.delete(doc(db, "splitPublicShares", linked.publicShareId));
        }
      }
      batch.delete(doc(db, "splits", id));
      const outcome = await commitWrite(() => batch.commit(), {
        label: "split deletion",
      });
      toast.success(writeSavedMessage(outcome, "Split deleted"));
      return true;
    } catch (err) {
      logError("splits.deletesplit", err);
      toast.error(friendlyErrorMessage(err, "Failed to delete split"));
      return false;
    }
  };

  return {
    error,
    retry,
    splits,
    loading,
    createSplit,
    updateSplit,
    toggleParticipantPaid,
    markParticipantCollected,
    unmarkParticipantCollected,
    spendCollectPot,
    settleAll,
    optOutParticipant,
    deleteSplit,
  };
}
