import { doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { newId } from "@/lib/id";
import { commitWrite } from "@/lib/firestoreWrite";
import { loadCashEntries, ledgerCashForTrade, mockTradeCost, canAfford, buildEntryDoc } from "@/services/portfolio/investmentCash";
import type { Holding, PortfolioTransaction } from "@/shared/features/portfolio/types";
import { roundMoney } from "@/shared/utils/money";
import { isValidDateKey, todayDateKey } from "@/shared/utils/dates";

const SETTINGS_DOC_ID = "main";
const INVESTMENT_CASH_COLLECTION = "investmentCashTransactions";
const HOLDINGS_COLLECTION = "holdings";
const TRANSACTIONS_COLLECTION = "portfolioTransactions";
const ADJUSTMENTS_COLLECTION = "holdingAdjustments";

function requireDb() {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore not initialized");
  return db;
}

function requireUid(uid: string) {
  if (!uid) throw new Error("Unauthenticated");
  return uid;
}

export interface MissingAcquisitionInput {
  holdingId: string;
  quantity: number;
  price: number;
  fees?: number;
  date: string;
  fundingSource: "investment_cash" | "external" | "other";
  reason: string;
  sourceNote?: string;
}

export interface CostBasisAdjustmentInput {
  holdingId: string;
  actualInvestedValue: number;
  date: string;
  reason: string;
  sourceNote?: string;
}

export async function executeMissingAcquisitionAdjustment(
  uid: string,
  input: MissingAcquisitionInput
) {
  const quantity = Number(input.quantity);
  const price = Number(input.price);
  const fees = Number(input.fees ?? 0);
  if (!(quantity > 0) || !(price >= 0) || fees < 0) {
    throw new Error("Quantity must be positive and price/fees must be non-negative");
  }
  if (!isValidDateKey(input.date)) throw new Error("Invalid acquisition date");

  const db = requireDb();
  const owner = requireUid(uid);
  const cost = mockTradeCost(quantity, price, fees);
  const deducts = input.fundingSource === "investment_cash";

  const holdingRef = doc(db, "users", owner, HOLDINGS_COLLECTION, input.holdingId);
  const settingsRef = doc(db, "users", owner, "portfolioSettings", SETTINGS_DOC_ID);
  
  const [holdingSnap, settingsSnap, cashEntries] = await Promise.all([
    getDoc(holdingRef),
    getDoc(settingsRef),
    loadCashEntries(owner),
  ]);
  
  if (!holdingSnap.exists()) throw new Error("Holding not found");
  const holding = holdingSnap.data() as Omit<Holding, "id">;
  
  if (deducts) {
    const settings = settingsSnap.data();
    const available = ledgerCashForTrade(settings, cashEntries);
    if (!canAfford(available, cost).ok) {
      throw new Error("Insufficient cash balance");
    }
  }

  const existingQuantity = Number(holding.quantity) || 0;
  const nextQuantity = roundMoney(existingQuantity + quantity);
  const existingInvestedValue = roundMoney(existingQuantity * (Number(holding.averageBuyPrice) || 0));
  const newInvestedValue = roundMoney(existingInvestedValue + cost);
  const averageBuyPrice = roundMoney(newInvestedValue / nextQuantity);

  const adjustmentId = newId();
  const transactionId = newId();
  const cashEntryId = deducts ? newId() : null;

  const outcome = await commitWrite(async () => {
    const batch = writeBatch(db);
    batch.update(holdingRef, {
      quantity: nextQuantity,
      averageBuyPrice,
      updatedAt: serverTimestamp(),
    });
    
    if (cashEntryId) {
      batch.set(
        doc(db, "users", owner, INVESTMENT_CASH_COLLECTION, cashEntryId),
        buildEntryDoc(
          {
            type: "PURCHASE",
            amount: cost,
            direction: "debit",
            date: input.date,
            holdingId: input.holdingId,
            symbol: holding.symbol,
            quantity,
            price,
            note: `Manual acquisition: ${quantity} ${holding.symbol}`,
            source: "app",
          },
          cashEntryId
        )
      );
    }
    
    batch.set(
      doc(db, "users", owner, TRANSACTIONS_COLLECTION, transactionId),
      {
        holdingId: input.holdingId,
        ...(holding.profileId ? { profileId: holding.profileId } : {}),
        symbol: holding.symbol,
        type: "BUY",
        quantity,
        price,
        fees,
        date: input.date,
        orderStatus: "executed",
        notes: `Manual Adjustment: ${input.reason}`,
        createdAt: serverTimestamp(),
      } as any
    );

    batch.set(
      doc(db, "users", owner, ADJUSTMENTS_COLLECTION, adjustmentId),
      {
        holdingId: input.holdingId,
        ...(holding.profileId ? { profileId: holding.profileId } : {}),
        userId: owner,
        type: "add_missing_acquisition",
        previousQuantity: existingQuantity,
        previousAveragePrice: holding.averageBuyPrice ?? 0,
        previousInvestedValue: existingInvestedValue,
        newQuantity: nextQuantity,
        newAveragePrice: averageBuyPrice,
        newInvestedValue: newInvestedValue,
        transactionIds: [transactionId],
        cashEntryIds: cashEntryId ? [cashEntryId] : [],
        reason: input.reason,
        fundingSource: input.fundingSource,
        sourceNote: input.sourceNote ?? "",
        createdAt: serverTimestamp(),
        createdBy: "user",
      }
    );

    return batch;
  });

  return { outcome, adjustmentId };
}

export async function executeCostBasisAdjustment(
  uid: string,
  input: CostBasisAdjustmentInput
) {
  const actualInvestedValue = Number(input.actualInvestedValue);
  if (!(actualInvestedValue >= 0)) throw new Error("Invested value must be non-negative");
  if (!isValidDateKey(input.date)) throw new Error("Invalid adjustment date");

  const db = requireDb();
  const owner = requireUid(uid);
  const holdingRef = doc(db, "users", owner, HOLDINGS_COLLECTION, input.holdingId);
  const holdingSnap = await getDoc(holdingRef);
  if (!holdingSnap.exists()) throw new Error("Holding not found");
  const holding = holdingSnap.data() as Omit<Holding, "id">;

  const existingQuantity = Number(holding.quantity) || 0;
  if (existingQuantity === 0 && actualInvestedValue > 0) {
    throw new Error("Cannot set a non-zero cost basis for a zero-quantity holding without an acquisition");
  }

  const existingInvestedValue = roundMoney(existingQuantity * (Number(holding.averageBuyPrice) || 0));
  const newAveragePrice = existingQuantity > 0 ? roundMoney(actualInvestedValue / existingQuantity) : 0;
  const costDifference = roundMoney(actualInvestedValue - existingInvestedValue);

  const adjustmentId = newId();
  const transactionId = newId();

  const outcome = await commitWrite(async () => {
    const batch = writeBatch(db);
    batch.update(holdingRef, {
      averageBuyPrice: newAveragePrice,
      updatedAt: serverTimestamp(),
    });
    
    batch.set(
      doc(db, "users", owner, TRANSACTIONS_COLLECTION, transactionId),
      {
        holdingId: input.holdingId,
        ...(holding.profileId ? { profileId: holding.profileId } : {}),
        symbol: holding.symbol,
        type: "ADJUSTMENT",
        quantity: 0,
        price: costDifference,
        fees: 0,
        date: input.date,
        orderStatus: "executed",
        notes: `Cost Basis Correction: ${input.reason}`,
        createdAt: serverTimestamp(),
      } as any
    );

    batch.set(
      doc(db, "users", owner, ADJUSTMENTS_COLLECTION, adjustmentId),
      {
        holdingId: input.holdingId,
        ...(holding.profileId ? { profileId: holding.profileId } : {}),
        userId: owner,
        type: "correct_cost_basis",
        previousQuantity: existingQuantity,
        previousAveragePrice: holding.averageBuyPrice ?? 0,
        previousInvestedValue: existingInvestedValue,
        newQuantity: existingQuantity,
        newAveragePrice: newAveragePrice,
        newInvestedValue: actualInvestedValue,
        transactionIds: [transactionId],
        cashEntryIds: [],
        reason: input.reason,
        sourceNote: input.sourceNote ?? "",
        createdAt: serverTimestamp(),
        createdBy: "user",
      }
    );

    return batch;
  });

  return { outcome, adjustmentId };
}
