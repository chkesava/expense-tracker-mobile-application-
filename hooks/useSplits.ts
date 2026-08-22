import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  or,
  query,
  deleteDoc,
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
  getPublicAppOrigin,
  getSplitShareUrl,
} from "@/shared/utils/paymentRequestUrl";
import {
  NO_ORIGIN_SHARE_REASON,
  isSharingRepairNoop,
  paySlugsByKey,
  planSplitSharingRepair,
  resolveSplitShareLink,
} from "@/shared/utils/splitShareLink";
import {
  buildApplyPaidClaimWrites,
  claimApplyPlan,
  splitClaimDocId,
  splitClaimDocIdsForSplit,
} from "@/shared/utils/splitClaims";
import type { SplitShareClaim } from "@/shared/types/splitShareClaim";
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
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

function applyShareSideEffects(
  batch: WriteBatch,
  db: Firestore,
  split: Split,
  participants: Participant[],
  extraSplitFields: Record<string, unknown>,
  /**
   * `currency` is required because the public snapshot is the only place an
   * anonymous visitor can learn it — `system_settings/global` needs sign-in.
   */
  options: { currency: string; claimsEnabled?: boolean }
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
        currency: options.currency,
        // Falls back to the split's own flag so a routine write (toggle paid,
        // collect, settle) never silently re-enables a revoked link.
        claimsEnabled: options.claimsEnabled ?? split.claimsEnabled,
      }
    ),
    { merge: true }
  );

  for (const patch of buildPaymentRequestSyncPatches(participants, {
    currency: options.currency,
  })) {
    batch.update(doc(db, "paymentRequests", patch.requestId), patch.fields);
  }
}

export function useSplits(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const displayCurrency = useDisplayCurrency();
  const uid = user?.uid;
  // The currency the organizer entered these amounts in. Mirrored onto every
  // public snapshot and payment request so the login-free pages can render it.
  const currency = displayCurrency;

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
          currency,
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
          {
            slug: publicSlug,
            settled: false,
            updatedAt: createdAt,
            currency,
          }
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

  /**
   * Makes a split shareable, repairing whatever is missing first.
   *
   * Safe to call on every Share tap: when nothing needs writing it returns the
   * existing link without committing. Fixes two silent failures — splits made
   * before public links existed have no `publicSlug`, and splits created while
   * the organizer had no UPI id have no per-person pay pages (and adding a UPI
   * id later never repaired them).
   */
  const ensureSplitSharing = async (
    splitId: string,
    opts: { upiId: string; payeePhotoUrl?: string; qrStyleId?: QrStyleId }
  ): Promise<
    | {
        ok: true;
        url: string;
        slug: string;
        paySlugByKey: Record<string, string>;
        repaired: boolean;
        payLinkBlockedReason?: string;
      }
    | { ok: false; message: string }
  > => {
    const db = getFirestoreDb();
    if (!uid || !db || !splitId) {
      return { ok: false, message: "You're not signed in. Sign in and try again." };
    }

    // Read from the live snapshot, not a caller-held prop, which can be stale.
    const split = splits.find((s) => s.id === splitId);
    if (!split) return { ok: false, message: "This split is no longer available." };

    const origin = getPublicAppOrigin();
    if (!origin) {
      // Nothing to write: without an origin there is no URL to hand out, and
      // minting a slug would not change that.
      return { ok: false, message: NO_ORIGIN_SHARE_REASON };
    }

    const plan = planSplitSharingRepair(split, { upiId: opts.upiId });

    if (isSharingRepairNoop(plan)) {
      const link = resolveSplitShareLink({ publicSlug: split.publicSlug, origin });
      if (!link.ready) return { ok: false, message: link.message };
      return {
        ok: true,
        url: link.url,
        slug: split.publicSlug as string,
        paySlugByKey: paySlugsByKey(split.participants),
        repaired: false,
        payLinkBlockedReason: plan.payLinkBlockedReason,
      };
    }

    try {
      const batch = writeBatch(db);
      const publicSlug = split.publicSlug || generatePaymentSlug(10);
      const newRequestIds: string[] = [];
      let participants = split.participants;

      if (plan.keysMissingPayLink.length > 0) {
        const shares = buildParticipantShareRequests({
          splitId,
          splitTitle: split.title,
          createdBy: uid,
          createdAt: Date.now(),
          payeeName: split.createdByName || user?.displayName || "Me",
          payeePhotoUrl: opts.payeePhotoUrl,
          upiId: opts.upiId,
          qrStyleId: opts.qrStyleId || getStoredQrStyleId(),
          currency,
          skipExisting: true,
          participants: split.participants,
        });

        const applied = shares.map((share) => {
          const requestRef = doc(collection(db, "paymentRequests"));
          batch.set(requestRef, share.payload);
          newRequestIds.push(requestRef.id);
          return {
            participantKey: share.participantKey,
            slug: share.slug,
            requestId: requestRef.id,
          };
        });
        participants = applyShareRequestsToParticipants(split.participants, applied);
      }

      // Mints publicSlug/publicShareId when absent and rewrites the snapshot,
      // so the new pay slugs, currency and claim fields land in one commit.
      applyShareSideEffects(
        batch,
        db,
        { ...split, publicSlug },
        participants,
        newRequestIds.length > 0
          ? {
              paymentRequestIds: [
                ...(split.paymentRequestIds || []),
                ...newRequestIds,
              ],
            }
          : {},
        { currency }
      );

      await commitWrite(() => batch.commit(), { label: "share link" });

      return {
        ok: true,
        url: getSplitShareUrl(publicSlug),
        slug: publicSlug,
        paySlugByKey: paySlugsByKey(participants),
        repaired: true,
        payLinkBlockedReason: plan.payLinkBlockedReason,
      };
    } catch (err) {
      logError("splits.ensuresharing", err);
      return {
        ok: false,
        message: friendlyErrorMessage(err, "Couldn't create the share link."),
      };
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
      applyShareSideEffects(
        batch,
        db,
        split,
        updatedParticipants,
        { settled: isAllPaid },
        { currency }
      );
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
    accountId: string,
    options?: { claimId?: string }
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
      applyShareSideEffects(
        batch,
        db,
        split,
        built.participants,
        { settled: built.settled },
        { currency }
      );
      if (options?.claimId) {
        batch.delete(doc(db, "splitShareClaims", options.claimId));
      }
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
      applyShareSideEffects(
        batch,
        db,
        split,
        built.participants,
        { settled: built.settled },
        { currency }
      );
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
      applyShareSideEffects(
        batch,
        db,
        split,
        split.participants,
        built.splitUpdates,
        { currency }
      );
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
      applyShareSideEffects(
        batch,
        db,
        split,
        updatedParticipants,
        { settled: true },
        { currency }
      );
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
    participantKey: string,
    options?: { claimId?: string }
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
      applyShareSideEffects(
        batch,
        db,
        split,
        built.participants,
        { settled: built.settled },
        { currency }
      );
      if (options?.claimId) {
        batch.delete(doc(db, "splitShareClaims", options.claimId));
      }
      await commitWrite(() => batch.commit(), { label: "split opt-out" });
      toast.success("Shares updated");
      return true;
    } catch (err) {
      logError("splits.optout", err);
      toast.error(friendlyErrorMessage(err, "Failed to update shares"));
      return false;
    }
  };

  /**
   * Records a `bill` + `paid` claim filed from the public link.
   *
   * The claim doc is deleted in the SAME batch as the participant update, which
   * is the idempotency mechanism: either the effect landed and the claim is
   * gone, or neither happened. `runTransaction` would allow a conditional read
   * but fails offline, which would break the commitWrite queue model the rest
   * of this file relies on — so: one batch, and absolute (never incremental)
   * paidAmount writes, so a replay is a no-op.
   */
  const applyPaidClaim = async (
    splitId: string,
    claim: SplitShareClaim
  ): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !splitId) return false;

    const split = splits.find((s) => s.id === splitId);
    if (!split) return false;
    if (split.createdBy !== uid) {
      toast.error("Only the organizer can record this.");
      return false;
    }

    const built = buildApplyPaidClaimWrites({ split, claim });
    if ("error" in built) {
      toast.error(built.error);
      return false;
    }

    const name =
      split.participants.find((p) => p.key === claim.participantKey)?.name ||
      "that person";

    try {
      const batch = writeBatch(db);
      applyShareSideEffects(
        batch,
        db,
        split,
        built.participants,
        { settled: built.settled },
        { currency }
      );
      if (split.publicShareId) {
        batch.delete(
          doc(
            db,
            "splitShareClaims",
            splitClaimDocId(split.publicShareId, claim.participantKey)
          )
        );
      }
      const outcome = await commitWrite(() => batch.commit(), {
        label: "settlement status",
      });
      toast.success(writeSavedMessage(outcome, `Recorded ${name}'s payment`));
      return true;
    } catch (err) {
      logError("splits.applypaidclaim", err);
      toast.error(friendlyErrorMessage(err, "Failed to record that payment"));
      return false;
    }
  };

  /** Clears a claim without applying it. Re-arms that person's claim slot. */
  const dismissClaim = async (
    splitId: string,
    claim: SplitShareClaim
  ): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !splitId) return false;

    const split = splits.find((s) => s.id === splitId);
    if (!split || !split.publicShareId) return false;
    if (split.createdBy !== uid) {
      toast.error("Only the organizer can dismiss this.");
      return false;
    }

    try {
      const outcome = await commitWrite(
        () =>
          deleteDoc(
            doc(
              db,
              "splitShareClaims",
              splitClaimDocId(split.publicShareId as string, claim.participantKey)
            )
          ),
        { label: "update" }
      );
      toast.success(writeSavedMessage(outcome, "Dismissed"));
      return true;
    } catch (err) {
      logError("splits.dismissclaim", err);
      toast.error(friendlyErrorMessage(err, "Failed to dismiss that update"));
      return false;
    }
  };

  /**
   * The revoke lever. Lives on the world-readable share because the Firestore
   * rules read it there to gate anonymous creates.
   */
  const setSplitClaimsEnabled = async (
    splitId: string,
    enabled: boolean
  ): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !splitId) return false;

    const split = splits.find((s) => s.id === splitId);
    if (!split) return false;
    if (split.createdBy !== uid) {
      toast.error("Only the organizer can change this.");
      return false;
    }

    try {
      const batch = writeBatch(db);
      applyShareSideEffects(
        batch,
        db,
        split,
        split.participants,
        // Recorded on the private doc as well, which is what makes the setting
        // survive every later write.
        { claimsEnabled: enabled },
        { currency, claimsEnabled: enabled }
      );
      const outcome = await commitWrite(() => batch.commit(), {
        label: "share link",
      });
      toast.success(
        writeSavedMessage(
          outcome,
          enabled ? "Updates from the link are on" : "Updates from the link are off"
        )
      );
      return true;
    } catch (err) {
      logError("splits.setclaimsenabled", err);
      toast.error(friendlyErrorMessage(err, "Failed to change that setting"));
      return false;
    }
  };

  /** What applying this claim would do, so the UI can route or explain it. */
  const planClaim = (splitId: string, claim: SplitShareClaim) => {
    const split = splits.find((s) => s.id === splitId);
    if (!split) return { action: "dismiss" as const, reason: "This split is gone." };
    return claimApplyPlan(split, claim);
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
        // Rules evaluate the whole batch against pre-batch state, so the share
        // still exists for the ownership check even though this batch drops it.
        for (const claimDocId of splitClaimDocIdsForSplit(split)) {
          batch.delete(doc(db, "splitShareClaims", claimDocId));
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
    ensureSplitSharing,
    toggleParticipantPaid,
    markParticipantCollected,
    unmarkParticipantCollected,
    spendCollectPot,
    settleAll,
    optOutParticipant,
    applyPaidClaim,
    dismissClaim,
    setSplitClaimsEnabled,
    planClaim,
    deleteSplit,
  };
}
