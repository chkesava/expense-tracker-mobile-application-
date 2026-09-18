/**
 * Client-side SIP executor (SPENDLY-16).
 *
 * SIPs are virtual — they never touch Investment Cash. Execution used to mint a
 * random sipTransactions id and write computed plan totals, so two taps both
 * ran, and a missing quote recorded units at ₹100. Doc ids are the scheduled
 * date, plan totals use increment(), and a failed quote writes a failed row.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite } from "@/lib/firestoreWrite";
import { fetchMarketQuote } from "@/services/marketDataService";
import type { InstrumentType } from "@/shared/features/portfolio/types";
import type { SipPlan, SipTransactionStatus, VirtualPosition } from "@/shared/features/sip/types";
import {
  applyExecuteToVirtualPosition,
  chunkSipOps,
  decideSipRun,
  isSipDue,
  isSipEnded,
  sipScheduledKey,
  sipTransactionId,
  type SipRunOp,
} from "@/shared/features/sip/utils/sipExecution";

function requireDb() {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore is not available");
  return db;
}

function requireUid(uid: string) {
  if (!uid.trim()) throw new Error("Not authenticated");
  return uid;
}

function asPlan(id: string, data: Record<string, unknown>): SipPlan {
  return { id, ...data } as SipPlan;
}

function applyOp(
  batch: ReturnType<typeof writeBatch>,
  uid: string,
  op: SipRunOp,
  positions: Map<string, VirtualPosition>
) {
  const db = requireDb();
  const planRef = doc(db, "users", uid, "sipPlans", op.planId);

  if (op.kind === "complete") {
    batch.update(planRef, { status: "completed", updatedAt: serverTimestamp() });
    return;
  }

  if (op.kind === "skip") {
    batch.update(planRef, {
      skipNextExecution: false,
      nextExecutionDate: op.nextExecutionDate,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "users", uid, "notifications", op.notificationId), {
      id: op.notificationId,
      type: "sip_skipped",
      title: "SIP Skipped",
      body: `Skipped execution for ${op.assetName}`,
      read: false,
      createdAt: serverTimestamp(),
      meta: { sipId: op.planId },
    });
    return;
  }

  if (op.kind === "fail") {
    batch.set(doc(db, "users", uid, "sipTransactions", op.txId), {
      id: op.txId,
      sipId: op.planId,
      date: op.scheduledKey,
      assetType: op.assetType,
      symbol: op.symbol,
      quoteKey: op.quoteKey,
      assetName: op.assetName,
      marketPrice: 0,
      investmentAmount: op.amount,
      unitsPurchased: 0,
      totalUnitsAfterPurchase: 0,
      averageBuyPriceAfter: 0,
      status: "failed",
      message: op.reason,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, "users", uid, "notifications", op.notificationId), {
      id: op.notificationId,
      type: "sip_failed",
      title: "SIP Failed",
      body: `Could not price ${op.assetName}. No units were recorded.`,
      read: false,
      createdAt: serverTimestamp(),
      meta: { sipId: op.planId, symbol: op.symbol },
    });
    return;
  }

  const existingVp = positions.get(op.vpId);
  const nextVp = applyExecuteToVirtualPosition(existingVp, op);
  positions.set(op.vpId, { ...nextVp, updatedAt: undefined });

  batch.set(doc(db, "users", uid, "sipTransactions", op.txId), {
    id: op.txId,
    sipId: op.planId,
    date: op.scheduledKey,
    assetType: op.assetType,
    symbol: op.symbol,
    quoteKey: op.quoteKey,
    assetName: op.assetName,
    marketPrice: op.price,
    investmentAmount: op.amount,
    unitsPurchased: op.units,
    totalUnitsAfterPurchase: op.totalUnitsAfter,
    averageBuyPriceAfter:
      op.totalUnitsAfter > 0 ? op.totalInvestedAfter / op.totalUnitsAfter : 0,
    status: "executed",
    message: "Manual execution",
    createdAt: serverTimestamp(),
  });
  batch.set(
    doc(db, "users", uid, "virtualPositions", op.vpId),
    { ...nextVp, updatedAt: serverTimestamp() },
    { merge: true }
  );
  batch.update(planRef, {
    totalInvested: increment(op.amount),
    totalUnits: increment(op.units),
    executionCount: increment(1),
    lastExecutionDate: op.scheduledKey,
    nextExecutionDate: op.nextExecutionDate,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, "users", uid, "notifications", op.notificationId), {
    id: op.notificationId,
    type: "sip_executed",
    title: "SIP Executed",
    body: `Successfully invested ${op.currency} ${op.amount} in ${op.assetName}`,
    read: false,
    createdAt: serverTimestamp(),
    meta: {
      sipId: op.planId,
      amount: op.amount,
      units: op.units,
      price: op.price,
      symbol: op.symbol,
    },
  });
}

export type ExecuteDueSipsResult = {
  executed: number;
  failed: number;
  skipped: number;
  completed: number;
};

export async function executeDueSips(
  uid: string,
  today: Date = new Date()
): Promise<ExecuteDueSipsResult> {
  const db = requireDb();
  const owner = requireUid(uid);
  const planSnap = await getDocs(collection(db, "users", owner, "sipPlans"));
  const vpSnap = await getDocs(collection(db, "users", owner, "virtualPositions"));
  const positions = new Map<string, VirtualPosition>(
    vpSnap.docs.map((item) => [item.id, { id: item.id, ...item.data() } as VirtualPosition])
  );

  const ops: SipRunOp[] = [];
  for (const item of planSnap.docs) {
    const plan = asPlan(item.id, item.data() as Record<string, unknown>);
    if (plan.status !== "active" || !isSipDue(plan.nextExecutionDate, today)) continue;

    const scheduledKey = sipScheduledKey(plan.nextExecutionDate);
    if (isSipEnded(plan.endDate, scheduledKey)) {
      ops.push({ kind: "complete", planId: plan.id });
      continue;
    }
    const txSnap = await getDoc(
      doc(db, "users", owner, "sipTransactions", sipTransactionId(plan.id, scheduledKey))
    );
    const existingTxStatus = txSnap.exists()
      ? ((txSnap.data()?.status as SipTransactionStatus | undefined) ?? undefined)
      : undefined;

    let price: number | undefined;
    if (!plan.skipNextExecution && existingTxStatus !== "executed" && existingTxStatus !== "skipped") {
      const quote = await fetchMarketQuote(plan.symbol, plan.assetType as InstrumentType);
      const live = Number(quote?.currentPrice);
      if (live > 0) price = live;
    }

    const op = decideSipRun(plan, { today, price, existingTxStatus });
    if (op) ops.push(op);
  }

  for (const chunk of chunkSipOps(ops)) {
    await commitWrite(() => {
      const batch = writeBatch(db);
      for (const op of chunk) applyOp(batch, owner, op, positions);
      return batch.commit();
    }, { label: "sip execute" });
  }

  return {
    executed: ops.filter((op) => op.kind === "execute").length,
    failed: ops.filter((op) => op.kind === "fail").length,
    skipped: ops.filter((op) => op.kind === "skip").length,
    completed: ops.filter((op) => op.kind === "complete").length,
  };
}
