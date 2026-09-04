import {
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  type Firestore,
  type Transaction,
} from "firebase/firestore";

import { newId } from "@/lib/id";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { omitUndefined } from "@/shared/utils/firestorePayload";
import {
  applyPermanentFundDelta,
  availableGodFund,
  locationDelta,
  parseGaneshSummary,
  parsePermanentFund,
  validateFundTransfer,
  validateGodFundLocationSpend,
  validatePositiveAmount,
  validateSettlement,
} from "@/shared/utils/ganeshMath";
import {
  festivalCol,
  festivalDoc,
  permanentFundDoc,
  permanentFundTransactionsCol,
  summaryDoc,
} from "@/shared/utils/ganeshPaths";
import {
  EMPTY_PERMANENT_FUND,
  type GaneshSummary,
  type PermanentFundLocation,
  type PermanentFundSummary,
  type PermanentFundTxType,
} from "@/shared/types/ganesh";

type FundActor = {
  uid: string;
  displayName: string;
  phone?: string;
};

export const PERMANENT_FUND_OFFLINE_ERROR =
  "Transfer requires an active connection. Please reconnect and try again.";

export class InsufficientFundError extends Error {
  constructor(
    public kind: "permanent" | "festival",
    public available: number,
    public requested: number
  ) {
    super(
      kind === "permanent"
        ? `Insufficient Permanent Fund balance.\n\nAvailable:\n${formatInr(available)}\n\nRequested:\n${formatInr(requested)}`
        : `Transfer amount cannot exceed the festival closing balance.\n\nAvailable:\n${formatInr(available)}\n\nRequested:\n${formatInr(requested)}`
    );
    this.name = "InsufficientFundError";
  }
}

export function assertPermanentFundOnline(isOnline: boolean): void {
  if (!isOnline) throw new Error(PERMANENT_FUND_OFFLINE_ERROR);
}

function writeFestivalAudit(
  txn: Transaction,
  db: Firestore,
  pandalId: string,
  festivalId: string,
  actorId: string,
  action: "closed" | "transferred",
  entityType: string,
  entityId: string,
  extra?: { reason?: string; newValue?: unknown }
) {
  txn.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "auditLogs"), newId()]),
    omitUndefined({
      actorId,
      action,
      entityType,
      entityId,
      oldValue: null,
      newValue: extra?.newValue ?? null,
      reason: extra?.reason,
      at: serverTimestamp(),
    })
  );
}

function pathRef(db: Firestore, segments: string[]) {
  const [first, ...rest] = segments;
  return doc(db, first, ...rest);
}

function incrementLocations(location: PermanentFundLocation, signedAmount: number) {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(locationDelta(location, signedAmount))) {
    if (typeof value === "number" && value !== 0) payload[key] = increment(value);
  }
  return payload;
}

function parseSummary(data?: Partial<GaneshSummary> | null): GaneshSummary {
  return parseGaneshSummary(data);
}

async function readPermanentFund(
  txn: Transaction,
  db: Firestore,
  pandalId: string
): Promise<PermanentFundSummary> {
  const snap = await txn.get(pathRef(db, permanentFundDoc(pandalId)));
  return snap.exists() ? parsePermanentFund(snap.data()) : EMPTY_PERMANENT_FUND;
}

function writePermanentFund(
  txn: Transaction,
  db: Firestore,
  pandalId: string,
  actor: FundActor,
  next: PermanentFundSummary
) {
  txn.set(pathRef(db, permanentFundDoc(pandalId)), {
    ...next,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Has this exact transfer already landed? (GS-085)
 *
 * Transfer ids were minted with `newId()` before `runTransaction`, which makes
 * Firestore's own internal retries safe — the same id is reused — but does
 * nothing for a *user* retry. Someone who taps again after an apparent timeout
 * produced a second, distinct transfer. Balances stayed self-consistent,
 * because the second transaction re-read the post-first balance, so this was
 * duplication needing manual correction rather than corruption. The only guard
 * was the Button's own `loading` state, which does not survive the screen.
 *
 * With a caller-supplied `clientOpId` the id becomes deterministic, so the
 * repeat can be recognised inside the transaction and skipped. Read through the
 * transaction, not `getDoc`, so the check participates in the same isolation as
 * the balance read it guards.
 */
async function transferAlreadyRecorded(
  txn: Transaction,
  db: Firestore,
  pandalId: string,
  txId: string
): Promise<boolean> {
  const existing = await txn.get(pathRef(db, [...permanentFundTransactionsCol(pandalId), txId]));
  return existing.exists();
}

function writePermanentTx(
  txn: Transaction,
  db: Firestore,
  pandalId: string,
  actor: FundActor,
  txId: string,
  payload: {
    type: PermanentFundTxType;
    amount: number;
    signedAmount: number;
    location: PermanentFundLocation;
    sourceType: "PERMANENT_FUND" | "FESTIVAL" | "EXTERNAL";
    sourceId?: string;
    destinationType: "PERMANENT_FUND" | "FESTIVAL" | "EXTERNAL";
    destinationId?: string;
    festivalId?: string;
    festivalName?: string;
    description?: string;
  }
) {
  txn.set(
    pathRef(db, [...permanentFundTransactionsCol(pandalId), txId]),
    omitUndefined({
      ...payload,
      date: todayDateInput(),
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
}

export async function seedPermanentFund(
  db: Firestore,
  actor: FundActor,
  pandalId: string,
  input?: {
    amount?: number;
    location?: PermanentFundLocation;
    description?: string;
  }
): Promise<void> {
  const amount = Number(input?.amount ?? 0);
  const location = input?.location ?? "cash";
  if (amount > 0) {
    const valid = validatePositiveAmount(amount, "Permanent Fund");
    if (!valid.ok) throw new Error(valid.error);
  }

  await runTransaction(db, async (txn) => {
    const current = await readPermanentFund(txn, db, pandalId);
    const alreadyHasBalance =
      current.total > 0 || current.cash + current.upi + current.bank + current.other > 0;
    if (alreadyHasBalance) {
      if (amount > 0) {
        throw new Error(
          "The Permanent Fund already has a balance. Use Add donation or Adjust to change it."
        );
      }
      return;
    }
    if (amount <= 0) {
      writePermanentFund(txn, db, pandalId, actor, EMPTY_PERMANENT_FUND);
      return;
    }
    const applied = applyPermanentFundDelta(EMPTY_PERMANENT_FUND, location, amount);
    if (!applied.ok) throw new Error(applied.error);
    writePermanentFund(txn, db, pandalId, actor, applied.next);
    writePermanentTx(txn, db, pandalId, actor, newId(), {
      type: "INITIAL_BALANCE",
      amount,
      signedAmount: amount,
      location,
      sourceType: "EXTERNAL",
      sourceId: "existing-pandal-fund",
      destinationType: "PERMANENT_FUND",
      destinationId: pandalId,
      description: input?.description?.trim() || "Money saved from previous years",
    });
  });
}

/**
 * Record an existing Pandal balance and allocate part of it to a festival, in
 * **one** transaction (GS-070).
 *
 * The setup screen used to await `seedPermanentFund` and then await
 * `transferPermanentToFestival`. Each is internally transactional; the pair was
 * not. A failure or an app kill between them left the Fund holding the whole
 * amount and the festival with nothing — and the screen then refused to re-run,
 * because it bails when `fund.total > 0`. A half-applied setup that the UI
 * would not let you complete.
 *
 * Both effects now apply or neither does. The fund document is written once,
 * with the post-allocation balance, so there is no intermediate state to
 * observe even inside the transaction.
 *
 * `allocation` is optional: with none, this behaves exactly like
 * `seedPermanentFund` and is safe to use for that alone.
 */
export async function seedPermanentFundWithAllocation(
  db: Firestore,
  actor: FundActor,
  pandalId: string,
  input: {
    amount: number;
    location: PermanentFundLocation;
    description?: string;
    allocation?: {
      festivalId: string;
      amount: number;
      festivalName?: string;
      description?: string;
    };
    /** Idempotency key for the allocation half (GS-085). */
    clientOpId?: string;
  }
): Promise<void> {
  const amount = Number(input.amount ?? 0);
  const location = input.location ?? "cash";
  if (amount > 0) {
    const valid = validatePositiveAmount(amount, "Permanent Fund");
    if (!valid.ok) throw new Error(valid.error);
  }
  const allocation = input.allocation;
  if (allocation) {
    const allocValid = validatePositiveAmount(allocation.amount, "Transfer");
    if (!allocValid.ok) throw new Error(allocValid.error);
    const room = validateFundTransfer(allocation.amount, amount, "Permanent Fund");
    if (!room.ok) throw new Error(room.error);
  }
  const txId = input.clientOpId?.trim() || newId();

  await runTransaction(db, async (txn) => {
    // Same guard as seedPermanentFund: this is a one-time setup, not a way to
    // overwrite a Fund that already holds money.
    const current = await readPermanentFund(txn, db, pandalId);
    const alreadyHasBalance =
      current.total > 0 || current.cash + current.upi + current.bank + current.other > 0;
    if (alreadyHasBalance) {
      throw new Error(
        "The Permanent Fund already has a balance. Use Add donation or Adjust to change it."
      );
    }
    if (amount <= 0) {
      writePermanentFund(txn, db, pandalId, actor, EMPTY_PERMANENT_FUND);
      return;
    }

    const seeded = applyPermanentFundDelta(EMPTY_PERMANENT_FUND, location, amount);
    if (!seeded.ok) throw new Error(seeded.error);
    writePermanentTx(txn, db, pandalId, actor, `${txId}-seed`, {
      type: "INITIAL_BALANCE",
      amount,
      signedAmount: amount,
      location,
      sourceType: "EXTERNAL",
      sourceId: "existing-pandal-fund",
      destinationType: "PERMANENT_FUND",
      destinationId: pandalId,
      description: input.description?.trim() || "Money saved from previous years",
    });

    if (!allocation) {
      writePermanentFund(txn, db, pandalId, actor, seeded.next);
      return;
    }

    const festivalName = await requireOpenFestivalName(
      txn,
      db,
      pandalId,
      allocation.festivalId,
      allocation.festivalName
    );
    // Debited from the balance being created in this same transaction — which
    // is exactly why appendTransferOutEffects takes the fund state rather than
    // reading it.
    const next = appendTransferOutEffects(
      txn,
      db,
      pandalId,
      allocation.festivalId,
      actor,
      seeded.next,
      txId,
      {
        amount: allocation.amount,
        location,
        festivalName: allocation.festivalName,
        description: allocation.description,
      },
      festivalName
    );
    writePermanentFund(txn, db, pandalId, actor, next);
  });
}

export async function addPermanentFundDonation(
  db: Firestore,
  actor: FundActor,
  pandalId: string,
  input: { amount: number; location: PermanentFundLocation; description?: string }
): Promise<string> {
  const valid = validatePositiveAmount(input.amount, "Donation");
  if (!valid.ok) throw new Error(valid.error);
  const txId = newId();

  await runTransaction(db, async (txn) => {
    const current = await readPermanentFund(txn, db, pandalId);
    const applied = applyPermanentFundDelta(current, input.location, input.amount);
    if (!applied.ok) throw new Error(applied.error);
    writePermanentFund(txn, db, pandalId, actor, applied.next);
    writePermanentTx(txn, db, pandalId, actor, txId, {
      type: "DONATION",
      amount: input.amount,
      signedAmount: input.amount,
      location: input.location,
      sourceType: "EXTERNAL",
      destinationType: "PERMANENT_FUND",
      destinationId: pandalId,
      description: input.description?.trim() || "Pandal donation",
    });
  });
  return txId;
}

export async function adjustPermanentFund(
  db: Firestore,
  actor: FundActor,
  pandalId: string,
  input: { amount: number; location: PermanentFundLocation; reason: string }
): Promise<string> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Enter a reason for the adjustment.");
  if (!Number.isFinite(input.amount) || input.amount === 0) {
    throw new Error("Enter an adjustment amount other than zero.");
  }
  const txId = newId();

  await runTransaction(db, async (txn) => {
    const current = await readPermanentFund(txn, db, pandalId);
    const applied = applyPermanentFundDelta(current, input.location, input.amount);
    if (!applied.ok) {
      throw new InsufficientFundError("permanent", current[input.location] ?? 0, Math.abs(input.amount));
    }
    writePermanentFund(txn, db, pandalId, actor, applied.next);
    writePermanentTx(txn, db, pandalId, actor, txId, {
      type: "ADJUSTMENT",
      amount: Math.abs(input.amount),
      signedAmount: input.amount,
      location: input.location,
      sourceType: "EXTERNAL",
      destinationType: "PERMANENT_FUND",
      destinationId: pandalId,
      description: reason,
    });
  });
  return txId;
}

/**
 * The effects of moving money out of the Permanent Fund into a festival,
 * written into a transaction the caller already opened (GS-070).
 *
 * Extracted so seeding-then-allocating can happen in **one** transaction. That
 * flow used to await `seedPermanentFund` and then await
 * `transferPermanentToFestival`, each internally transactional but the pair not
 * — so a failure or app kill between them left the Fund holding the whole
 * amount and the festival with nothing, and the setup screen then refused to
 * re-run because `fund.total > 0`. A half-applied setup the UI would not let
 * you finish.
 *
 * Takes the already-read fund state rather than reading it, because the seed
 * path has to debit the balance it is creating in the same transaction — a
 * second read would see the pre-seed state.
 *
 * @returns the fund state after the debit, for the caller to write.
 */
function appendTransferOutEffects(
  txn: Transaction,
  db: Firestore,
  pandalId: string,
  festivalId: string,
  actor: FundActor,
  current: PermanentFundSummary,
  txId: string,
  input: {
    amount: number;
    location: PermanentFundLocation;
    festivalName?: string;
    description?: string;
  },
  festivalName: string
): PermanentFundSummary {
  const openingId = `${txId}-opening`;
  const festivalTransferId = `${txId}-festival`;

  const transferCheck = validateFundTransfer(input.amount, current[input.location] ?? 0, "Permanent Fund");
  if (!transferCheck.ok) {
    throw new InsufficientFundError("permanent", current[input.location] ?? 0, input.amount);
  }
  const applied = applyPermanentFundDelta(current, input.location, -input.amount);
  if (!applied.ok) {
    throw new InsufficientFundError("permanent", current[input.location] ?? 0, input.amount);
  }

  writePermanentTx(txn, db, pandalId, actor, txId, {
    type: "TRANSFER_OUT",
    amount: input.amount,
    signedAmount: -input.amount,
    location: input.location,
    sourceType: "PERMANENT_FUND",
    sourceId: pandalId,
    destinationType: "FESTIVAL",
    destinationId: festivalId,
    festivalId,
    festivalName,
    description: input.description?.trim() || `Opening funds for ${festivalName}`,
  });
  txn.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "openingFunds"), openingId]),
    omitUndefined({
      amount: input.amount,
      sourceType: "permanent_fund",
      location: input.location,
      linkedTransferId: txId,
      description: input.description?.trim() || `From Permanent Pandal Fund (${input.location})`,
      date: todayDateInput(),
      ledgerType: "OPENING_BALANCE",
      voided: false,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  txn.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "fundTransfers"), festivalTransferId]),
    omitUndefined({
      direction: "from_permanent",
      amount: input.amount,
      location: input.location,
      linkedPermanentTxId: txId,
      description: input.description?.trim() || `₹${input.amount} funded from Permanent Pandal Fund`,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  txn.set(
    pathRef(db, summaryDoc(pandalId, festivalId)),
    {
      openingFunds: increment(input.amount),
      receivedFromPermanentFund: increment(input.amount),
      ...incrementLocations(input.location, input.amount),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  txn.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "activity"), newId()]),
    omitUndefined({
      title: "Funded from Permanent Pandal Fund",
      subtitle: `Added by ${actor.displayName}`,
      amount: input.amount,
      actorId: actor.uid,
      entityType: "fundTransfer",
      entityId: txId,
      createdAt: serverTimestamp(),
    })
  );
  // Activity is a feed the committee reads; `auditLogs` is the trail an audit
  // is reconstructed from. Money moving in or out of the Permanent Fund was
  // only ever in the feed (GS-021), so it was absent from the record that
  // matters, and `fundTransfers` is now immutable precisely so this trail can
  // be trusted.
  writeFestivalAudit(txn, db, pandalId, festivalId, actor.uid, "transferred", "fundTransfer", txId, {
    newValue: {
      direction: "from_permanent",
      amount: input.amount,
      location: input.location,
    },
    reason: input.description?.trim() || undefined,
  });

  return applied.next;
}

/** Reads the festival and refuses a closed one. Shared by both transfer-out callers. */
async function requireOpenFestivalName(
  txn: Transaction,
  db: Firestore,
  pandalId: string,
  festivalId: string,
  preferred?: string
): Promise<string> {
  const festivalSnap = await txn.get(pathRef(db, festivalDoc(pandalId, festivalId)));
  if (!festivalSnap.exists()) throw new Error("Festival not found.");
  if (festivalSnap.data().status !== "open") {
    throw new Error("Open the festival before moving Permanent Fund into it.");
  }
  return preferred?.trim() || String(festivalSnap.data().name ?? "Festival");
}

export async function transferPermanentToFestival(
  db: Firestore,
  actor: FundActor,
  pandalId: string,
  festivalId: string,
  input: {
    amount: number;
    location: PermanentFundLocation;
    festivalName?: string;
    description?: string;
    /**
     * Idempotency key held across retries by the caller (GS-085). Omitting it
     * keeps the old behaviour — a fresh id each call — so an existing caller is
     * unchanged, but a retry is then indistinguishable from a second transfer.
     */
    clientOpId?: string;
  }
): Promise<string> {
  const valid = validatePositiveAmount(input.amount, "Transfer");
  if (!valid.ok) throw new Error(valid.error);
  // Derived ids live in appendTransferOutEffects, so a retry cannot leave
  // orphan siblings behind even if it got part-way through once (GS-085).
  const txId = input.clientOpId?.trim() || newId();

  await runTransaction(db, async (txn) => {
    if (await transferAlreadyRecorded(txn, db, pandalId, txId)) return;
    const current = await readPermanentFund(txn, db, pandalId);
    const festivalName = await requireOpenFestivalName(
      txn,
      db,
      pandalId,
      festivalId,
      input.festivalName
    );
    const next = appendTransferOutEffects(
      txn,
      db,
      pandalId,
      festivalId,
      actor,
      current,
      txId,
      input,
      festivalName
    );
    writePermanentFund(txn, db, pandalId, actor, next);
  });
  return txId;
}

export async function transferFestivalToPermanent(
  db: Firestore,
  actor: FundActor,
  pandalId: string,
  festivalId: string,
  input: {
    amount: number;
    location: PermanentFundLocation;
    festivalName?: string;
    description?: string;
    type: "CARRY_FORWARD" | "TRANSFER_IN";
    closeFestival?: boolean;
    /** Idempotency key held across retries by the caller (GS-085). */
    clientOpId?: string;
  }
): Promise<string | null> {
  const amount = Number(input.amount ?? 0);
  if (amount < 0) throw new Error("Transfer amount cannot be negative.");
  if (amount === 0 && !input.closeFestival) {
    throw new Error("Enter a transfer amount.");
  }
  const opId = input.clientOpId?.trim();
  const txId = amount > 0 ? opId || newId() : null;
  const festivalTransferId = txId ? `${txId}-festival` : null;

  await runTransaction(db, async (txn) => {
    // A zero-amount call is a close-only operation with no transaction
    // document, so there is nothing to deduplicate against - closing is
    // already idempotent through the festival's own status.
    if (txId && (await transferAlreadyRecorded(txn, db, pandalId, txId))) return;
    const current = await readPermanentFund(txn, db, pandalId);
    const festivalSnap = await txn.get(pathRef(db, festivalDoc(pandalId, festivalId)));
    if (!festivalSnap.exists()) throw new Error("Festival not found.");
    const festivalName = input.festivalName?.trim() || String(festivalSnap.data().name ?? "Festival");
    const summarySnap = await txn.get(pathRef(db, summaryDoc(pandalId, festivalId)));
    const summary = parseSummary(summarySnap.exists() ? (summarySnap.data() as GaneshSummary) : null);
    const closing = availableGodFund(summary);

    if (amount > 0) {
      const settlement = validateSettlement({
        closing,
        transfer: amount,
        remaining: closing - amount,
      });
      if (!settlement.ok) throw new InsufficientFundError("festival", closing, amount);
      const locOk = validateGodFundLocationSpend(amount, input.location, summary);
      if (!locOk.ok) throw new Error(locOk.error);
      const applied = applyPermanentFundDelta(current, input.location, amount);
      if (!applied.ok) throw new Error(applied.error);
      writePermanentFund(txn, db, pandalId, actor, applied.next);
      writePermanentTx(txn, db, pandalId, actor, txId!, {
        type: input.type,
        amount,
        signedAmount: amount,
        location: input.location,
        sourceType: "FESTIVAL",
        sourceId: festivalId,
        destinationType: "PERMANENT_FUND",
        destinationId: pandalId,
        festivalId,
        festivalName,
        description: input.description?.trim() || `${input.type === "CARRY_FORWARD" ? "Carry forward from" : "Returned from"} ${festivalName}`,
      });
      txn.set(
        pathRef(db, [...festivalCol(pandalId, festivalId, "fundTransfers"), festivalTransferId!]),
        omitUndefined({
          direction: "to_permanent",
          amount,
          location: input.location,
          linkedPermanentTxId: txId,
          description: input.description?.trim() || `Returned to Permanent Pandal Fund`,
          createdBy: actor.uid,
          createdAt: serverTimestamp(),
          updatedBy: actor.uid,
          updatedAt: serverTimestamp(),
        })
      );
      txn.set(
        pathRef(db, summaryDoc(pandalId, festivalId)),
        {
          transferredToPermanentFund: increment(amount),
          ...incrementLocations(input.location, -amount),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      if (!input.closeFestival) {
        txn.set(
          pathRef(db, [...festivalCol(pandalId, festivalId, "activity"), newId()]),
          omitUndefined({
            title: "Returned to Permanent Pandal Fund",
            subtitle: `Added by ${actor.displayName}`,
            amount,
            actorId: actor.uid,
            entityType: "fundTransfer",
            entityId: txId,
            createdAt: serverTimestamp(),
          })
        );
      }
      // Audited whether or not this is part of a close: a settlement transfer
      // is exactly the movement an audit most needs to see (GS-021).
      writeFestivalAudit(txn, db, pandalId, festivalId, actor.uid, "transferred", "fundTransfer", txId!, {
        newValue: {
          direction: "to_permanent",
          amount,
          location: input.location,
          type: input.type,
        },
        reason: input.description?.trim() || undefined,
      });
    } else if (!input.closeFestival) {
      return;
    }

    if (input.closeFestival) {
      if (festivalSnap.data().status === "closed") {
        throw new Error("This festival is already closed.");
      }
      txn.update(pathRef(db, festivalDoc(pandalId, festivalId)), {
        status: "closed",
        closedAt: serverTimestamp(),
        closedBy: actor.uid,
        updatedBy: actor.uid,
        updatedAt: serverTimestamp(),
      });
      writeFestivalAudit(txn, db, pandalId, festivalId, actor.uid, "closed", "festival", festivalId, {
        reason: "Festival closed",
        newValue: { transferAmount: amount, remainingAmount: closing - amount },
      });
      if (amount > 0 && festivalTransferId) {
        writeFestivalAudit(
          txn,
          db,
          pandalId,
          festivalId,
          actor.uid,
          "transferred",
          "fundTransfer",
          festivalTransferId,
          { newValue: { amount, location: input.location } }
        );
      }
    }
  });
  return txId;
}
