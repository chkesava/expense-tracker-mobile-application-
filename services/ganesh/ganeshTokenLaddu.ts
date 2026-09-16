import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  type Firestore,
  type Transaction,
} from "firebase/firestore";

import { newId } from "@/lib/id";
import { omitUndefined } from "@/shared/utils/firestorePayload";
import type { GaneshActor } from "@/services/ganesh/ganeshWrites";
import { requireOpenFestival } from "@/services/ganesh/ganeshFestivalGuard";
import type { PaymentMethod } from "@/shared/types/ganesh";
import type { TokenLadduConfig } from "@/shared/types/ganeshTokenLaddu";
import {
  festivalCol,
  festivalDoc,
  summaryDoc,
  tokenLadduConfigDoc,
} from "@/shared/utils/ganeshPaths";
import { formatCollectionReceipt, money } from "@/shared/utils/ganeshMath";
import {
  allocateTokenNumbers,
  formatTokenCode,
  splitAmountAcrossTokens,
  validateTokenCapacityChange,
  validateTokenRegistration,
} from "@/shared/utils/ganeshTokenLaddu";

/**
 * Token Laddu write paths (KAN-125).
 *
 * One transaction does the whole registration: the purchase, one document per
 * laddu, the ledger row that carries the money, and the allocator bump. That is
 * not tidiness — KAN-125 requires a quantity of N to create all N tokens or
 * none, and the capacity check is a read-then-write that a batch cannot express.
 *
 * Which means these paths are **online-only**, and say so. The doctrine is in
 * `ganeshWriter.ts`: a transaction cannot commit offline, so a path that needs
 * one refuses with a reason rather than queueing a write that can never land.
 * Registering past capacity is exactly the stale-client bypass the ticket asks
 * us to block, so there is no offline fallback to add here.
 */

// Local, matching the convention in the sibling service modules.
function pathRef(db: Firestore, segments: string[]) {
  const [first, ...rest] = segments;
  return doc(db, first, ...rest);
}

/**
 * The audit trail. Deliberately the same shape as `audit()` in `ganeshWrites`
 * and `writeFestivalAudit()` in `ganeshPermanentFund` — `auditLogs` is one
 * collection with one reader, so a second shape would break the timeline.
 */
function writeTokenAudit(
  txn: Transaction,
  db: Firestore,
  pandalId: string,
  festivalId: string,
  actorId: string,
  action: "created" | "edited" | "cancelled" | "adjusted",
  entityType: string,
  entityId: string,
  extra?: { oldValue?: unknown; newValue?: unknown; reason?: string }
) {
  txn.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "auditLogs"), newId()]),
    omitUndefined({
      actorId,
      action,
      entityType,
      entityId,
      oldValue: extra?.oldValue ?? null,
      newValue: extra?.newValue ?? null,
      reason: extra?.reason,
      at: serverTimestamp(),
    })
  );
}

/** The feed the committee reads. `auditLogs` is the trail; this is the story. */
function writeTokenActivity(
  txn: Transaction,
  db: Firestore,
  pandalId: string,
  festivalId: string,
  payload: {
    title: string;
    subtitle?: string;
    amount?: number;
    actorId: string;
    entityType: string;
    entityId: string;
  }
) {
  txn.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "activity"), newId()]),
    omitUndefined({ ...payload, createdAt: serverTimestamp() })
  );
}

function readConfig(data: Record<string, unknown> | undefined): Partial<TokenLadduConfig> | null {
  if (!data) return null;
  return data as Partial<TokenLadduConfig>;
}

export type SetTokenLadduCapacityInput = {
  totalTokens: number;
  amountPerToken?: number;
  reason?: string;
};

/**
 * Sets how many Token Laddus exist, which is also how many draws there will be.
 *
 * A transaction because the validation reads the current registered count: two
 * admins editing at once must not be able to agree the capacity down below the
 * tokens that have been sold in between.
 */
export async function setTokenLadduCapacity(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: SetTokenLadduCapacityInput
): Promise<void> {
  await requireOpenFestival(db, pandalId, festivalId);

  await runTransaction(db, async (txn) => {
    const configRef = pathRef(db, tokenLadduConfigDoc(pandalId, festivalId));
    const snap = await txn.get(configRef);
    const current = readConfig(snap.data());

    validateTokenCapacityChange({
      totalTokens: input.totalTokens,
      config: current,
      reason: input.reason,
    });

    const amountPerToken = Math.max(0, money(Number(input.amountPerToken ?? current?.amountPerToken ?? 0)));
    const previousTotal = Number(current?.totalTokens ?? 0);

    txn.set(
      configRef,
      omitUndefined({
        totalTokens: input.totalTokens,
        amountPerToken,
        // Seeded on first write so the allocator and counters always exist.
        nextTokenNumber: Number(current?.nextTokenNumber ?? 0),
        registeredCount: Number(current?.registeredCount ?? 0),
        cancelledCount: Number(current?.cancelledCount ?? 0),
        capacityReason: input.reason?.trim() || undefined,
        createdBy: current?.createdBy ?? actor.uid,
        createdAt: snap.exists() ? undefined : serverTimestamp(),
        updatedBy: actor.uid,
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );

    writeTokenAudit(
      txn,
      db,
      pandalId,
      festivalId,
      actor.uid,
      snap.exists() ? "edited" : "created",
      "tokenLadduConfig",
      "current",
      {
        oldValue: snap.exists() ? { totalTokens: previousTotal, amountPerToken: current?.amountPerToken ?? 0 } : null,
        newValue: { totalTokens: input.totalTokens, amountPerToken },
        reason: input.reason?.trim() || undefined,
      }
    );
  });
}

export type RegisterTokenLadduInput = {
  participantName: string;
  mobile?: string;
  quantity: number;
  amount: number;
  paymentMethod: PaymentMethod;
  /** From the pandal's printed receipt book. Not the ledger's receipt number. */
  receiptNumberPhysical: string;
  date: string;
  collectorId?: string;
  notes?: string;
  /** Idempotency key, created once per form mount. Becomes the document id. */
  clientOpId: string;
};

export type RegisterTokenLadduResult = {
  registrationId: string;
  /** The codes created, in order, for the confirmation screen. */
  tokenCodes: string[];
  receiptNumber?: string;
  /** True when the registration already existed and nothing was written. */
  alreadyRegistered: boolean;
};

/**
 * Registers a purchase and creates one draw-eligible token per laddu.
 *
 * Everything lands in one transaction, so a failure leaves nothing behind —
 * no half-registered receipt, no tokens without money, no money without tokens.
 */
export async function registerTokenLaddu(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: RegisterTokenLadduInput
): Promise<RegisterTokenLadduResult> {
  await requireOpenFestival(db, pandalId, festivalId);

  const registrationId = input.clientOpId.trim();
  if (!registrationId) throw new Error("Could not identify this registration. Try again.");

  const collectorId = await resolveTokenCollectorId(db, pandalId, actor.uid, input.collectorId ?? "");
  const participantName = input.participantName.trim();
  const receiptNumberPhysical = input.receiptNumberPhysical.trim();
  const amount = money(input.amount);

  return runTransaction(db, async (txn) => {
    const registrationRef = pathRef(db, [
      ...festivalCol(pandalId, festivalId, "tokenLadduRegistrations"),
      registrationId,
    ]);

    // Idempotency, the same way `addCollection` does it: the client op id is
    // the document id, so a double tap or a retry finds its own write and
    // stops. Scenario 3.
    const existing = await txn.get(registrationRef);
    if (existing.exists()) {
      const data = existing.data();
      const year = Number(data.festivalYear ?? new Date().getFullYear());
      const numbers = Array.isArray(data.tokenNumbers) ? (data.tokenNumbers as number[]) : [];
      return {
        registrationId,
        tokenCodes: numbers.map((n) => formatTokenCode(year, n)),
        receiptNumber: typeof data.receiptNumber === "string" ? data.receiptNumber : undefined,
        alreadyRegistered: true,
      };
    }

    const configRef = pathRef(db, tokenLadduConfigDoc(pandalId, festivalId));
    const configSnap = await txn.get(configRef);
    const config = readConfig(configSnap.data());

    // Read inside the transaction so a concurrent registration cannot slip past
    // the same capacity check. Scenario 5.
    validateTokenRegistration({
      quantity: input.quantity,
      amount,
      participantName,
      receiptNumberPhysical,
      config,
    });

    const festivalSnap = await txn.get(pathRef(db, festivalDoc(pandalId, festivalId)));
    const year = Number(festivalSnap.data()?.year ?? new Date().getFullYear());

    // The ledger's own receipt number, allocated exactly like a collection's.
    const summaryRef = pathRef(db, summaryDoc(pandalId, festivalId));
    const summarySnap = await txn.get(summaryRef);
    const nextReceiptSeq = Number(summarySnap.data()?.nextReceiptNumber ?? 0) + 1;
    const receiptNumber = formatCollectionReceipt(year, nextReceiptSeq);

    const nextTokenNumber = Number(config?.nextTokenNumber ?? 0);
    const tokenNumbers = allocateTokenNumbers(nextTokenNumber, input.quantity);
    const tokenCodes = tokenNumbers.map((n) => formatTokenCode(year, n));
    const shares = splitAmountAcrossTokens(amount, input.quantity);

    // The money. An ordinary collection row, so festival totals come from the
    // existing derive — the Token Laddu documents carry no money of their own
    // and must never join LEDGER_SUBCOLLECTIONS.
    const collectionId = `tkn-${registrationId}`;
    txn.set(
      pathRef(db, [...festivalCol(pandalId, festivalId, "collections"), collectionId]),
      omitUndefined({
        donorName: participantName,
        mobile: input.mobile?.trim() || undefined,
        amount,
        paymentMethod: input.paymentMethod,
        collectorId,
        receiptNumber,
        clientOpId: collectionId,
        notes: `Token Laddu · ${input.quantity} × receipt ${receiptNumberPhysical}`,
        date: input.date,
        ledgerType: "COLLECTION",
        purposeType: "collection",
        purposeCategory: "other",
        direction: "in",
        voided: false,
        createdBy: actor.uid,
        createdAt: serverTimestamp(),
        updatedBy: actor.uid,
        updatedAt: serverTimestamp(),
      })
    );

    txn.set(
      registrationRef,
      omitUndefined({
        participantName,
        mobile: input.mobile?.trim() || undefined,
        quantity: input.quantity,
        amount,
        paymentMethod: input.paymentMethod,
        receiptNumberPhysical,
        receiptNumber,
        collectionId,
        collectorId,
        date: input.date,
        clientOpId: registrationId,
        notes: input.notes?.trim() || undefined,
        tokenNumbers,
        // Stored so a later read can rebuild the codes without the festival doc.
        festivalYear: year,
        voided: false,
        createdBy: actor.uid,
        createdAt: serverTimestamp(),
        updatedBy: actor.uid,
        updatedAt: serverTimestamp(),
      })
    );

    // One document per laddu. The code is the document id, so two registrations
    // cannot land on the same one — the second create would fail and take the
    // whole transaction with it. Scenarios 1, 2 and 4.
    tokenNumbers.forEach((tokenNumber, index) => {
      txn.set(
        pathRef(db, [
          ...festivalCol(pandalId, festivalId, "tokenLadduTokens"),
          tokenCodes[index],
        ]),
        omitUndefined({
          tokenNumber,
          status: "eligible",
          registrationId,
          participantName,
          mobile: input.mobile?.trim() || undefined,
          receiptNumberPhysical,
          date: input.date,
          amount: shares[index],
          paymentMethod: input.paymentMethod,
          createdBy: actor.uid,
          createdAt: serverTimestamp(),
          updatedBy: actor.uid,
          updatedAt: serverTimestamp(),
        })
      );
    });

    txn.set(
      configRef,
      omitUndefined({
        nextTokenNumber: nextTokenNumber + input.quantity,
        registeredCount: Number(config?.registeredCount ?? 0) + input.quantity,
        updatedBy: actor.uid,
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );

    txn.set(
      summaryRef,
      { nextReceiptNumber: nextReceiptSeq, updatedAt: serverTimestamp() },
      { merge: true }
    );

    writeTokenActivity(txn, db, pandalId, festivalId, {
      title: participantName,
      subtitle: `${input.quantity} Token ${input.quantity === 1 ? "Laddu" : "Laddus"} · Added by ${actor.displayName}`,
      amount,
      actorId: actor.uid,
      entityType: "tokenLadduRegistration",
      entityId: registrationId,
    });
    writeTokenAudit(
      txn,
      db,
      pandalId,
      festivalId,
      actor.uid,
      "created",
      "tokenLadduRegistration",
      registrationId,
      {
        newValue: {
          participantName,
          quantity: input.quantity,
          amount,
          receiptNumberPhysical,
          receiptNumber,
          tokenCodes,
        },
      }
    );

    return { registrationId, tokenCodes, receiptNumber, alreadyRegistered: false };
  });
}

export type OpenDrawSessionInput = {
  /** Idempotency key, so a double tap cannot open two sessions. */
  clientOpId: string;
};

/**
 * Opens the draw session.
 *
 * The number of draws is frozen here from the configuration, and the rules
 * refuse to let it change afterwards: a public draw's terms cannot be edited
 * once it has started. Committing results is the trusted endpoint's job — this
 * only sets the stage.
 */
export async function openTokenDrawSession(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: OpenDrawSessionInput
): Promise<{ sessionId: string; alreadyOpen: boolean }> {
  await requireOpenFestival(db, pandalId, festivalId);
  const sessionId = input.clientOpId.trim();
  if (!sessionId) throw new Error("Could not identify this draw. Try again.");

  return runTransaction(db, async (txn) => {
    const sessionRef = pathRef(db, [
      ...festivalCol(pandalId, festivalId, "tokenDrawSessions"),
      sessionId,
    ]);
    const existing = await txn.get(sessionRef);
    if (existing.exists()) return { sessionId, alreadyOpen: true };

    const configSnap = await txn.get(pathRef(db, tokenLadduConfigDoc(pandalId, festivalId)));
    const config = readConfig(configSnap.data());
    const plannedDraws = Number(config?.totalTokens ?? 0);
    if (plannedDraws <= 0) {
      throw new Error("Set the number of Token Laddus before starting the draw.");
    }

    txn.set(
      sessionRef,
      omitUndefined({
        status: "open",
        startedAt: serverTimestamp(),
        startedBy: actor.uid,
        startedByName: actor.displayName,
        // The snapshot KAN-125 asks for. Rules keep both out of the update
        // allowlist, so what the committee announced stays what happened.
        configuredTokens: plannedDraws,
        plannedDraws,
        completedDraws: 0,
        createdBy: actor.uid,
        createdAt: serverTimestamp(),
        updatedBy: actor.uid,
        updatedAt: serverTimestamp(),
      })
    );

    writeTokenAudit(txn, db, pandalId, festivalId, actor.uid, "created", "tokenDrawSession", sessionId, {
      newValue: { plannedDraws },
    });

    return { sessionId, alreadyOpen: false };
  });
}

/**
 * Closes a draw session early.
 *
 * Results already committed stay committed and visible — KAN-125 forbids
 * deleting history, and a winner announced to a crowd cannot be withdrawn by
 * closing the session they were drawn in.
 */
export async function closeTokenDrawSession(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: { sessionId: string; reason: string }
): Promise<void> {
  await requireOpenFestival(db, pandalId, festivalId);
  const reason = input.reason.trim();
  if (!reason) throw new Error("Give a reason for ending the draw.");

  await runTransaction(db, async (txn) => {
    const sessionRef = pathRef(db, [
      ...festivalCol(pandalId, festivalId, "tokenDrawSessions"),
      input.sessionId,
    ]);
    const snap = await txn.get(sessionRef);
    if (!snap.exists()) throw new Error("That draw session no longer exists.");
    if (snap.data().status !== "open") return;

    txn.update(sessionRef, {
      status: "cancelled",
      cancelReason: reason,
      completedAt: serverTimestamp(),
      completedBy: actor.uid,
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });

    writeTokenAudit(
      txn,
      db,
      pandalId,
      festivalId,
      actor.uid,
      "cancelled",
      "tokenDrawSession",
      input.sessionId,
      { oldValue: { status: "open" }, newValue: { status: "cancelled" }, reason }
    );
  });
}

export type CancelTokenLadduInput = {
  registrationId: string;
  reason: string;
};

/**
 * Cancels a registration and takes its tokens out of the draw.
 *
 * Nothing is deleted and no token id is freed for reuse: KAN-125 requires the
 * history survive, and a code that has been handed to a participant must never
 * reappear against someone else. The money is left to the existing void flow —
 * reversing a ledger row is `voidFinancialRecord`'s job, not this module's, and
 * doing it here would double-reverse.
 */
export async function cancelTokenLadduRegistration(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: CancelTokenLadduInput
): Promise<{ cancelledTokens: number }> {
  await requireOpenFestival(db, pandalId, festivalId);
  const reason = input.reason.trim();
  if (!reason) throw new Error("Give a reason for cancelling this registration.");

  return runTransaction(db, async (txn) => {
    const registrationRef = pathRef(db, [
      ...festivalCol(pandalId, festivalId, "tokenLadduRegistrations"),
      input.registrationId,
    ]);
    const snap = await txn.get(registrationRef);
    if (!snap.exists()) throw new Error("That registration no longer exists.");
    const data = snap.data();
    if (data.voided === true) {
      // Already cancelled: stop rather than decrement the counters twice.
      return { cancelledTokens: 0 };
    }

    const year = Number(data.festivalYear ?? new Date().getFullYear());
    const numbers = Array.isArray(data.tokenNumbers) ? (data.tokenNumbers as number[]) : [];
    const codes = numbers.map((n) => formatTokenCode(year, n));

    // Read every token before writing any: a token that has already won is
    // terminal, and cancelling it would contradict a result the committee has
    // announced.
    const tokenRefs = codes.map((code) =>
      pathRef(db, [...festivalCol(pandalId, festivalId, "tokenLadduTokens"), code])
    );
    const tokenSnaps = await Promise.all(tokenRefs.map((ref) => txn.get(ref)));
    const winners = tokenSnaps.filter((tokenSnap) => tokenSnap.data()?.status === "winner");
    if (winners.length > 0) {
      throw new Error("This registration has a winning Token Laddu and cannot be cancelled.");
    }

    // Read before any write: Firestore requires every read in a transaction to
    // happen before the first write, so the counter is fetched here rather than
    // beside the update that uses it.
    const configRef = pathRef(db, tokenLadduConfigDoc(pandalId, festivalId));
    const configSnap = await txn.get(configRef);

    let cancelledTokens = 0;
    tokenSnaps.forEach((tokenSnap, index) => {
      if (!tokenSnap.exists() || tokenSnap.data()?.status !== "eligible") return;
      cancelledTokens += 1;
      txn.update(tokenRefs[index], {
        status: "cancelled",
        cancelReason: reason,
        cancelledBy: actor.uid,
        cancelledAt: serverTimestamp(),
        updatedBy: actor.uid,
        updatedAt: serverTimestamp(),
      });
    });

    txn.update(registrationRef, {
      voided: true,
      voidReason: reason,
      voidedBy: actor.uid,
      voidedAt: serverTimestamp(),
      cancelReason: reason,
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });

    if (cancelledTokens > 0) {
      txn.set(
        configRef,
        {
          // `registeredCount` is not wound back: it is what the allocator and
          // the capacity check are measured against, and a cancelled token
          // still occupies the number it was given.
          cancelledCount: Number(configSnap.data()?.cancelledCount ?? 0) + cancelledTokens,
          updatedBy: actor.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    writeTokenAudit(
      txn,
      db,
      pandalId,
      festivalId,
      actor.uid,
      "cancelled",
      "tokenLadduRegistration",
      input.registrationId,
      {
        oldValue: { status: "active", tokenCodes: codes },
        newValue: { status: "cancelled", cancelledTokens },
        reason,
      }
    );

    return { cancelledTokens };
  });
}

/**
 * Mirrors `resolveCollectorId` in `ganeshWrites`: cash attribution falls back to
 * the actor rather than failing, and never names a removed or suspended member.
 */
async function resolveTokenCollectorId(
  db: Firestore,
  pandalId: string,
  actorUid: string,
  requested: string
): Promise<string> {
  const candidate = requested.trim() || actorUid;
  if (!candidate) throw new Error("Choose who collected this.");
  if (candidate === actorUid) return candidate;
  try {
    const snap = await getDoc(doc(db, "pandals", pandalId, "members", candidate));
    if (!snap.exists()) return actorUid;
    const status = snap.data().status;
    if (status === "removed" || status === "suspended") return actorUid;
    return candidate;
  } catch {
    return actorUid;
  }
}
