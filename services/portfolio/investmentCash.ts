/**
 * Writes to the Investment Cash ledger.
 *
 * Three rules hold everywhere in this file, and between them they are what KAN-77
 * actually asks for:
 *
 * 1. **Doc ids are minted on the client and are the idempotency key.** A retry
 *    `setDoc`s the same path, so it overwrites rather than deducting a second time.
 *    `addDoc` is never used — it only resolves on server ack, so offline it would
 *    hang waiting for an id the local cache already has.
 * 2. **`writeBatch` + `commitWrite`, never `runTransaction`.** A batch is atomic and
 *    commits to the local cache immediately, syncing later; a transaction requires
 *    connectivity, which is half of why the existing cash paths misbehave offline.
 * 3. **The `cashBalance` scalar is only a cache.** It is updated with `increment`
 *    (a server-side transform, correct under replay) purely so the web app sharing
 *    this Firestore project keeps seeing a sane number. Read the balance from the
 *    ledger via `shared/features/portfolio/utils/investmentCash`.
 */

import {
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite, type WriteOutcome } from "@/lib/firestoreWrite";
import { newId } from "@/lib/id";
import { roundMoney } from "@/shared/utils/money";
import type {
  Holding,
  InvestmentCashEntry,
  InvestmentCashEntryType,
  InvestmentCashSource,
} from "@/shared/features/portfolio/types";
import type { HoldingFundingSource } from "@/shared/features/portfolio/schemas";

const SETTINGS_DOC_ID = "config";
export const INVESTMENT_CASH_COLLECTION = "investmentCashTransactions";

type CreateHoldingInput = Omit<Holding, "id" | "createdAt" | "updatedAt">;

export type InvestmentCashEntryInput = {
  type: InvestmentCashEntryType;
  /** Always positive; `direction` carries the sign. */
  amount: number;
  direction: "credit" | "debit";
  date: string;
  note?: string;
  reason?: string;
  holdingId?: string;
  symbol?: string;
  quantity?: number;
  price?: number;
  accountId?: string;
  accountEntryId?: string;
  reversesId?: string;
  source?: InvestmentCashSource;
};

export type InvestmentCashWriteResult = {
  /** Doc id, generated client-side so it exists offline too. */
  id: string;
  outcome: WriteOutcome;
};

function requireDb() {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore is not available");
  return db;
}

function requireUid(uid: string) {
  if (!uid.trim()) throw new Error("Not authenticated");
  return uid;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const result = { ...value };
  for (const key of Object.keys(result)) {
    if (result[key] === undefined) delete result[key];
  }
  return result;
}

/** The signed effect an entry has on the balance. */
function signedDelta(input: Pick<InvestmentCashEntryInput, "amount" | "direction">): number {
  const amount = roundMoney(Math.abs(Number(input.amount) || 0));
  return input.direction === "credit" ? amount : -amount;
}

function buildEntryDoc(
  input: InvestmentCashEntryInput,
  correlationId: string
): Record<string, unknown> {
  return stripUndefined({
    type: input.type,
    amount: roundMoney(Math.abs(Number(input.amount) || 0)),
    direction: input.direction,
    date: input.date,
    note: input.note?.trim() || undefined,
    reason: input.reason?.trim() || undefined,
    holdingId: input.holdingId,
    symbol: input.symbol,
    quantity: input.quantity,
    price: input.price,
    accountId: input.accountId,
    accountEntryId: input.accountEntryId,
    reversesId: input.reversesId,
    correlationId,
    source: input.source ?? "app",
    createdAt: serverTimestamp(),
    // `createdAt` is still null locally until the server acks, so ordering needs a
    // client value that exists the moment the write is queued.
    createdAtMs: Date.now(),
  });
}

/**
 * Captures the opening balance the ledger folds onto, once per user.
 *
 * This is what lets the ledger ship without a backfill against the shared
 * dev/prod Firebase project: whatever the legacy `cashBalance` scalar says today
 * becomes the baseline, and every movement from here on is a ledger entry. Guarded
 * by a read so it is idempotent and safe to call before every write.
 */
export async function ensureCashBaseline(
  uid: string,
  fallbackBalance: number
): Promise<void> {
  const db = requireDb();
  const ref = doc(db, "users", requireUid(uid), "portfolioSettings", SETTINGS_DOC_ID);
  const snapshot = await getDoc(ref);
  if (snapshot.exists() && snapshot.data()?.cashBaseline) return;

  const amount = roundMoney(
    Number(snapshot.data()?.cashBalance ?? fallbackBalance) || 0
  );
  const now = new Date();
  await commitWrite(
    () =>
      setDoc(
        ref,
        {
          cashBalance: amount,
          cashBaseline: {
            amount,
            capturedAt: now.toISOString(),
            capturedAtMs: now.getTime(),
            reason: "Opening balance carried over when cash history started",
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
    { label: "investment cash baseline" }
  );
}

/**
 * Records one cash movement and keeps the scalar cache in step.
 *
 * Pass `entryId` to make the write idempotent: the caller mints it once and reuses
 * it across retries, so a repeated submit rewrites the same document.
 */
export async function recordInvestmentCashEntry(
  uid: string,
  input: InvestmentCashEntryInput,
  entryId: string = newId()
): Promise<InvestmentCashWriteResult> {
  const db = requireDb();
  const owner = requireUid(uid);
  const entryRef = doc(db, "users", owner, INVESTMENT_CASH_COLLECTION, entryId);
  const settingsRef = doc(db, "users", owner, "portfolioSettings", SETTINGS_DOC_ID);

  const outcome = await commitWrite(() => {
    const batch = writeBatch(db);
    batch.set(entryRef, buildEntryDoc(input, entryId));
    batch.set(
      settingsRef,
      { cashBalance: increment(signedDelta(input)), updatedAt: serverTimestamp() },
      { merge: true }
    );
    return batch.commit();
  }, { label: "investment cash entry" });

  return { id: entryId, outcome };
}

export type CreateHoldingWithCashInput = {
  holding: CreateHoldingInput;
  fundingSource: HoldingFundingSource;
  /** Cash the purchase consumes. Ignored when funding is `external`. */
  purchaseAmount: number;
  /** Reused across retries to keep the write idempotent. */
  holdingId?: string;
  entryId?: string;
  date: string;
  source?: InvestmentCashSource;
};

export type CreateHoldingWithCashResult = {
  holdingId: string;
  /** Null when the holding was recorded without touching investment cash. */
  entryId: string | null;
  outcome: WriteOutcome;
};

/**
 * Adds a holding and, when it is funded from investment cash, the PURCHASE entry
 * that consumes it — in one batch, so a holding can never exist without its
 * matching cash movement.
 *
 * `fundingSource: "external"` records a holding bought outside the app (a CSV
 * import, or a portfolio that predates this feature) and moves no cash at all.
 * Without that option a user with no investment cash could not record what they
 * already own.
 */
export async function createHoldingWithCash(
  uid: string,
  input: CreateHoldingWithCashInput
): Promise<CreateHoldingWithCashResult> {
  const db = requireDb();
  const owner = requireUid(uid);
  const holdingId = input.holdingId ?? newId();
  const holdingRef = doc(db, "users", owner, "holdings", holdingId);
  const amount = roundMoney(Math.max(0, Number(input.purchaseAmount) || 0));
  const deducts = input.fundingSource === "investment_cash" && amount > 0;
  const entryId = deducts ? input.entryId ?? newId() : null;

  const outcome = await commitWrite(() => {
    const batch = writeBatch(db);
    batch.set(
      holdingRef,
      stripUndefined({
        ...input.holding,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    if (entryId) {
      const entryRef = doc(db, "users", owner, INVESTMENT_CASH_COLLECTION, entryId);
      batch.set(
        entryRef,
        buildEntryDoc(
          {
            type: "PURCHASE",
            amount,
            direction: "debit",
            date: input.date,
            holdingId,
            symbol: input.holding.symbol,
            quantity: input.holding.quantity,
            price: input.holding.averageBuyPrice,
            note: `Bought ${input.holding.quantity} ${input.holding.symbol}`,
            source: input.source ?? "app",
          },
          entryId
        )
      );
      batch.set(
        doc(db, "users", owner, "portfolioSettings", SETTINGS_DOC_ID),
        { cashBalance: increment(-amount), updatedAt: serverTimestamp() },
        { merge: true }
      );
    }

    return batch.commit();
  }, { label: "holding" });

  return { holdingId, entryId, outcome };
}

export type InvestmentCashAdjustment = {
  amount: number;
  direction: "credit" | "debit";
  reason: string;
  date: string;
  entryId?: string;
};

/**
 * Records a manual correction to the balance.
 *
 * Deliberately writes nothing but a new ledger entry: the original holding and
 * bank-transfer records the discrepancy came from are never touched, which the
 * separate collection makes structurally true rather than a matter of care.
 */
export async function recordInvestmentCashAdjustment(
  uid: string,
  adjustment: InvestmentCashAdjustment
): Promise<InvestmentCashWriteResult> {
  const reason = adjustment.reason.trim();
  if (!reason) throw new Error("An adjustment needs a reason");
  if (!(adjustment.amount > 0)) throw new Error("An adjustment needs a positive amount");

  return recordInvestmentCashEntry(
    uid,
    {
      type: "ADJUSTMENT",
      amount: adjustment.amount,
      direction: adjustment.direction,
      date: adjustment.date,
      reason,
    },
    adjustment.entryId ?? newId()
  );
}

/**
 * Returns cash a deleted holding's purchase consumed.
 *
 * Writes a new REVERSAL rather than editing or removing the original PURCHASE, so
 * the history keeps showing that the money was spent and then returned.
 */
export async function reverseInvestmentCashEntry(
  uid: string,
  original: Pick<InvestmentCashEntry, "id" | "amount" | "direction" | "symbol">,
  options: { date: string; reason?: string; entryId?: string }
): Promise<InvestmentCashWriteResult> {
  return recordInvestmentCashEntry(
    uid,
    {
      type: "REVERSAL",
      amount: original.amount,
      direction: original.direction === "debit" ? "credit" : "debit",
      date: options.date,
      symbol: original.symbol,
      reversesId: original.id,
      note: options.reason ?? "Reversal of an earlier cash movement",
    },
    options.entryId ?? newId()
  );
}
