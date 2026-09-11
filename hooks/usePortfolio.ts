import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { newId } from "@/lib/id";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import {
  INVESTMENT_CASH_COLLECTION,
  createHoldingWithCash,
  ensureCashBaseline,
  recordInvestmentCashEntry,
  reverseInvestmentCashEntry,
} from "@/services/portfolio/investmentCash";
import { scheduleIdleWork } from "@/shared/utils/scheduleIdle";
import {
  availableInvestmentCash,
  computeInvestmentCashBalance,
  holdingPurchaseAmount,
} from "@/shared/features/portfolio/utils/investmentCash";
import type { HoldingFundingSource } from "@/shared/features/portfolio/schemas";
import type {
  Holding,
  InvestmentCashEntry,
  InvestmentCashSource,
  PortfolioOrder,
  PortfolioSettings,
  PortfolioSnapshot,
  PortfolioTransaction,
  PriceAlert,
  WatchlistItem,
} from "@/shared/features/portfolio/types";

type CreateHoldingInput = Omit<Holding, "id" | "createdAt" | "updatedAt">;
type CreateAlertInput = Omit<PriceAlert, "id" | "createdAt" | "isActive" | "triggeredAt">;
type CreateSnapshotInput = Omit<PortfolioSnapshot, "id" | "date" | "createdAt">;

const SETTINGS_DOC_ID = "config";

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const result = { ...value };
  for (const key of Object.keys(result)) {
    if (result[key] === undefined) delete result[key];
  }
  return result;
}

function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Portfolio data repository. Every path intentionally matches the existing web
 * app, so a signed-in user sees the same portfolio on web and mobile.
 *
 * @param options.enabled When false, skips snapshot listeners (ledger tabs already unmount portfolio/SIP when inactive).
 * @param options.includeSecondary When false, only settings + holdings (enough for net worth).
 */
export function usePortfolio(options?: {
  enabled?: boolean;
  includeSecondary?: boolean;
}) {
  const { user } = useAuth();
  const uid = user?.uid;
  const db = getFirestoreDb();
  const enabled = options?.enabled ?? true;
  const includeSecondary = options?.includeSecondary !== false;

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [orders, setOrders] = useState<PortfolioOrder[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [settings, setSettings] = useState<PortfolioSettings | null>(null);
  const [cashEntries, setCashEntries] = useState<InvestmentCashEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid || !db) {
      setHoldings([]);
      setTransactions([]);
      setWatchlist([]);
      setOrders([]);
      setAlerts([]);
      setSnapshots([]);
      setSettings(null);
      setCashEntries([]);
      setLoading(false);
      return;
    }

    if (!enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const settingsRef = doc(db, "users", uid, "portfolioSettings", SETTINGS_DOC_ID);

    // Critical: settings + holdings for first paint
    const primaryUnsubs = [
      onSnapshot(settingsRef, (snapshot) => {
        setSettings(
          snapshot.exists()
            ? ({ id: snapshot.id, ...snapshot.data() } as PortfolioSettings)
            : null
        );
      }),
      onSnapshot(query(collection(db, "users", uid, "holdings")), (snapshot) => {
        setHoldings(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() } as Holding))
            .sort((a, b) => a.symbol.localeCompare(b.symbol))
        );
        setLoading(false);
      }, (error) => {
        logError("portfolio.loadHoldings", error);
        setLoading(false);
      }),
      // Primary, not secondary: useUnifiedNetWorth subscribes with
      // includeSecondary:false and still needs the cash balance.
      onSnapshot(
        query(collection(db, "users", uid, INVESTMENT_CASH_COLLECTION)),
        (snapshot) => {
          setCashEntries(
            snapshot.docs.map(
              (item) => ({ id: item.id, ...item.data() } as InvestmentCashEntry)
            )
          );
        },
        (error) => {
          logError("portfolio.loadInvestmentCash", error);
        }
      ),
    ];

    // Secondary collections after idle — skip for net-worth-only consumers
    let secondaryUnsubs: Array<() => void> = [];
    const cancelIdle = includeSecondary
      ? scheduleIdleWork(
      () => {
        secondaryUnsubs = [
          onSnapshot(query(collection(db, "users", uid, "portfolioTransactions")), (snapshot) => {
            setTransactions(
              snapshot.docs
                .map((item) => ({ id: item.id, ...item.data() } as PortfolioTransaction))
                .sort((a, b) => b.date.localeCompare(a.date))
            );
          }),
          onSnapshot(query(collection(db, "users", uid, "watchlist")), (snapshot) => {
            setWatchlist(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as WatchlistItem)));
          }),
          onSnapshot(query(collection(db, "users", uid, "portfolioOrders")), (snapshot) => {
            setOrders(
              snapshot.docs
                .map((item) => ({ id: item.id, ...item.data() } as PortfolioOrder))
                .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
            );
          }),
          onSnapshot(query(collection(db, "users", uid, "alerts")), (snapshot) => {
            setAlerts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as PriceAlert)));
          }),
          onSnapshot(
            query(collection(db, "users", uid, "portfolioSnapshots")),
            (snapshot) => {
              setSnapshots(
                snapshot.docs
                  .map((item) => ({ id: item.id, ...item.data() } as PortfolioSnapshot))
                  .sort((a, b) => a.date.localeCompare(b.date))
              );
            },
            (error) => {
              logError("portfolio.loadPortfolioSnapshots", error);
            }
          ),
        ];
      },
      { fallbackDelayMs: 900, timeoutMs: 2500 }
    )
      : undefined;

    return () => {
      cancelIdle?.();
      primaryUnsubs.forEach((unsubscribe) => unsubscribe());
      secondaryUnsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [db, uid, enabled, includeSecondary]);

  /**
   * The authoritative Investment Cash Balance: the captured baseline plus every
   * ledger movement. `settings.cashBalance` is only a cache for the web app that
   * shares this Firestore project — reading it here is what let a purchase leave
   * spent money looking available (KAN-77).
   */
  const cashBalance = useMemo(() => {
    // Before the baseline is captured the ledger is empty by construction, and the
    // scalar is all there is. Folding entries onto the scalar instead would
    // double-count them for the moment between the baseline write and the ledger
    // write arriving from the local cache.
    if (!settings?.cashBaseline) return Number(settings?.cashBalance ?? 0);
    return computeInvestmentCashBalance(settings.cashBaseline, cashEntries);
  }, [settings, cashEntries]);

  /** What may actually be spent — never negative, however far the balance drifted. */
  const availableCash = useMemo(() => availableInvestmentCash(cashBalance), [cashBalance]);

  /**
   * Adds a holding and, when it is funded from investment cash, deducts the
   * purchase in the same batch.
   *
   * `fundingSource: "external"` records a holding bought outside the app and moves
   * no cash — the CSV import and the "I already have holdings" onboarding path both
   * rely on that, since those holdings were never funded through the app.
   */
  const addHolding = useCallback(async (
    holding: CreateHoldingInput,
    options?: {
      fundingSource?: HoldingFundingSource;
      /** Minted once by the caller and reused across retries. */
      entryId?: string;
      holdingId?: string;
      date?: string;
      source?: InvestmentCashSource;
    }
  ): Promise<string | null> => {
    if (!user || !db) return null;
    const fundingSource = options?.fundingSource ?? "investment_cash";
    const purchaseAmount = holdingPurchaseAmount(holding.quantity, holding.averageBuyPrice);
    try {
      if (fundingSource === "investment_cash" && purchaseAmount > 0) {
        // Freeze the legacy scalar as the opening balance before the first ledger
        // entry lands, or that entry would be double-counted against it.
        await ensureCashBaseline(user.uid, settings?.cashBalance ?? 0);
      }
      const result = await createHoldingWithCash(user.uid, {
        holding,
        fundingSource,
        purchaseAmount,
        entryId: options?.entryId,
        holdingId: options?.holdingId,
        date: options?.date ?? (holding.datePurchased || todayKey()),
        source: options?.source,
      });
      toast.success(
        writeSavedMessage(
          result.outcome,
          result.entryId ? "Holding added and cash deducted" : "Holding added"
        )
      );
      return result.holdingId;
    } catch (error) {
      logError("portfolio.addHolding", error);
      toast.error(friendlyErrorMessage(error, "Failed to add holding"));
      return null;
    }
  }, [db, user, settings]);

  const updateHolding = useCallback(async (id: string, updates: Partial<CreateHoldingInput>) => {
    if (!user || !db) return false;
    try {
      await updateDoc(
        doc(db, "users", user.uid, "holdings", id),
        stripUndefined({ ...updates, updatedAt: serverTimestamp() })
      );
      return true;
    } catch (error) {
      logError("portfolio.updateHolding", error);
      toast.error("Failed to update holding");
      return false;
    }
  }, [db, user]);

  /**
   * Removes a holding, optionally returning the cash its purchase consumed.
   *
   * The refund is opt-in and writes a new REVERSAL entry rather than deleting the
   * original PURCHASE, so history keeps showing that the money was spent and then
   * came back. Deleting a holding must never silently restore cash — that is the
   * behaviour KAN-77 exists to prevent.
   */
  const deleteHolding = useCallback(async (
    id: string,
    options?: { refundCash?: boolean }
  ) => {
    if (!user || !db) return false;
    try {
      if (options?.refundCash) {
        const purchase = cashEntries.find(
          (entry) => entry.type === "PURCHASE" && entry.holdingId === id
        );
        if (purchase) {
          await reverseInvestmentCashEntry(user.uid, purchase, {
            date: todayKey(),
            reason: `Refund for removing ${purchase.symbol ?? "a holding"}`,
          });
        }
      }
      await deleteDoc(doc(db, "users", user.uid, "holdings", id));
      toast.success(
        options?.refundCash ? "Holding removed and cash returned" : "Holding removed"
      );
      return true;
    } catch (error) {
      logError("portfolio.deleteHolding", error);
      toast.error(friendlyErrorMessage(error, "Failed to remove holding"));
      return false;
    }
  }, [db, user, cashEntries]);

  /** The purchase entry a holding's cash came from, if it was funded in-app. */
  const findHoldingPurchase = useCallback(
    (holdingId: string) =>
      cashEntries.find(
        (entry) => entry.type === "PURCHASE" && entry.holdingId === holdingId
      ) ?? null,
    [cashEntries]
  );

  const overwriteHoldings = useCallback(async (nextHoldings: CreateHoldingInput[]) => {
    if (!user || !db) return false;
    try {
      const batch = writeBatch(db);
      holdings.forEach((holding) => batch.delete(doc(db, "users", user.uid, "holdings", holding.id)));
      nextHoldings.forEach((holding) => {
        batch.set(
          doc(collection(db, "users", user.uid, "holdings")),
          stripUndefined({ ...holding, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        );
      });
      await batch.commit();
      return true;
    } catch (error) {
      logError("portfolio.importHoldings", error);
      toast.error("Failed to import CSV");
      return false;
    }
  }, [db, holdings, user]);

  const addToWatchlist = useCallback(async (item: Omit<WatchlistItem, "id" | "createdAt">) => {
    if (!user || !db) return false;
    if (watchlist.some((current) => current.yahooSymbol === item.yahooSymbol)) {
      toast.info("Already in watchlist");
      return false;
    }
    try {
      await addDoc(collection(db, "users", user.uid, "watchlist"), {
        ...item,
        createdAt: serverTimestamp(),
      });
      toast.success("Added to watchlist");
      return true;
    } catch (error) {
      logError("portfolio.addWatchlist", error);
      toast.error("Failed to add to watchlist");
      return false;
    }
  }, [db, user, watchlist]);

  const removeFromWatchlist = useCallback(async (id: string) => {
    if (!user || !db) return false;
    try {
      await deleteDoc(doc(db, "users", user.uid, "watchlist", id));
      toast.success("Removed from watchlist");
      return true;
    } catch (error) {
      logError("portfolio.removeWatchlistItem", error);
      toast.error("Failed to remove from watchlist");
      return false;
    }
  }, [db, user]);

  const addAlert = useCallback(async (alert: CreateAlertInput) => {
    if (!user || !db) return false;
    try {
      await addDoc(collection(db, "users", user.uid, "alerts"), {
        ...alert,
        isActive: true,
        createdAt: serverTimestamp(),
      });
      toast.success("Alert created");
      return true;
    } catch (error) {
      logError("portfolio.createAlert", error);
      toast.error("Failed to create alert");
      return false;
    }
  }, [db, user]);

  const toggleAlert = useCallback(async (id: string, isActive: boolean) => {
    if (!user || !db) return false;
    try {
      await updateDoc(doc(db, "users", user.uid, "alerts", id), { isActive });
      return true;
    } catch (error) {
      logError("portfolio.updateAlert", error);
      toast.error("Failed to update alert");
      return false;
    }
  }, [db, user]);

  const deleteAlert = useCallback(async (id: string) => {
    if (!user || !db) return false;
    try {
      await deleteDoc(doc(db, "users", user.uid, "alerts", id));
      toast.success("Alert removed");
      return true;
    } catch (error) {
      logError("portfolio.deleteAlert", error);
      toast.error("Failed to remove alert");
      return false;
    }
  }, [db, user]);

  const saveSettings = useCallback(async (updates: Partial<PortfolioSettings>) => {
    if (!user || !db) return false;
    try {
      await setDoc(
        doc(db, "users", user.uid, "portfolioSettings", SETTINGS_DOC_ID),
        stripUndefined({ ...updates, updatedAt: serverTimestamp(), createdAt: settings?.createdAt ?? serverTimestamp() }),
        { merge: true }
      );
      return true;
    } catch (error) {
      logError("portfolio.savePortfolioSettings", error);
      toast.error("Failed to save portfolio setup");
      return false;
    }
  }, [db, settings?.createdAt, user]);

  const saveDailySnapshot = useCallback(async (snapshot: CreateSnapshotInput) => {
    if (!user || !db) return false;
    const date = todayKey();
    const ref = doc(db, "users", user.uid, "portfolioSnapshots", date);
    try {
      if ((await getDoc(ref)).exists()) return true;
      await setDoc(ref, { ...snapshot, date, createdAt: serverTimestamp() });
      return true;
    } catch (error) {
      logError("portfolio.savePortfolioSnapshot", error);
      return false;
    }
  }, [db, user]);

  const executeMockBuy = useCallback(async (holdingId: string, quantity: number, price: number, fees = 0) => {
    if (!user || !db) return false;
    if (!(quantity > 0) || !(price > 0) || fees < 0) return false;
    const holdingRef = doc(db, "users", user.uid, "holdings", holdingId);
    const settingsRef = doc(db, "users", user.uid, "portfolioSettings", SETTINGS_DOC_ID);
    const transactionRef = doc(collection(db, "users", user.uid, "portfolioTransactions"));
    const cashEntryId = newId();
    const cashEntryRef = doc(db, "users", user.uid, INVESTMENT_CASH_COLLECTION, cashEntryId);
    try {
      await ensureCashBaseline(user.uid, settings?.cashBalance ?? 0);
      await runTransaction(db, async (firestoreTransaction) => {
        const [holdingSnapshot, settingsSnapshot] = await Promise.all([
          firestoreTransaction.get(holdingRef),
          firestoreTransaction.get(settingsRef),
        ]);
        if (!holdingSnapshot.exists()) throw new Error("Holding not found");
        const holding = holdingSnapshot.data() as Omit<Holding, "id">;
        const cashBalance = Number(settingsSnapshot.data()?.cashBalance ?? 0);
        const cost = quantity * price + fees;
        if (cashBalance < cost) throw new Error("Insufficient cash balance");
        const existingQuantity = Number(holding.quantity);
        const nextQuantity = existingQuantity + quantity;
        const averageBuyPrice = ((Number(holding.averageBuyPrice) * existingQuantity) + (quantity * price + fees)) / nextQuantity;

        firestoreTransaction.update(holdingRef, { quantity: nextQuantity, averageBuyPrice, updatedAt: serverTimestamp() });
        firestoreTransaction.set(settingsRef, { cashBalance: cashBalance - cost, updatedAt: serverTimestamp() }, { merge: true });
        firestoreTransaction.set(transactionRef, {
          holdingId,
          symbol: holding.symbol,
          type: "BUY",
          quantity,
          price,
          fees,
          date: todayKey(),
          orderStatus: "executed",
          createdAt: serverTimestamp(),
        });
        // Written inside the same transaction as the scalar it mirrors, so a mock
        // trade can never move one without the other.
        firestoreTransaction.set(cashEntryRef, {
          type: "PURCHASE",
          amount: cost,
          direction: "debit",
          date: todayKey(),
          holdingId,
          symbol: holding.symbol,
          quantity,
          price,
          note: `Bought ${quantity} ${holding.symbol}`,
          correlationId: cashEntryId,
          source: "app",
          createdAt: serverTimestamp(),
          createdAtMs: Date.now(),
        });
      });
      toast.success("Mock buy executed");
      return true;
    } catch (error) {
      logError("portfolio.executeMockBuy", error);
      logError("portfolio.buy", error);
      toast.error(friendlyErrorMessage(error, "Couldn't complete the buy order."));
      return false;
    }
  }, [db, user, settings]);

  const executeMockSell = useCallback(async (holdingId: string, quantity: number, price: number, fees = 0) => {
    if (!user || !db) return false;
    if (!(quantity > 0) || !(price > 0) || fees < 0 || quantity * price < fees) return false;
    const holdingRef = doc(db, "users", user.uid, "holdings", holdingId);
    const settingsRef = doc(db, "users", user.uid, "portfolioSettings", SETTINGS_DOC_ID);
    const transactionRef = doc(collection(db, "users", user.uid, "portfolioTransactions"));
    const cashEntryId = newId();
    const cashEntryRef = doc(db, "users", user.uid, INVESTMENT_CASH_COLLECTION, cashEntryId);
    try {
      await ensureCashBaseline(user.uid, settings?.cashBalance ?? 0);
      await runTransaction(db, async (firestoreTransaction) => {
        const [holdingSnapshot, settingsSnapshot] = await Promise.all([
          firestoreTransaction.get(holdingRef),
          firestoreTransaction.get(settingsRef),
        ]);
        if (!holdingSnapshot.exists()) throw new Error("Holding not found");
        const holding = holdingSnapshot.data() as Omit<Holding, "id">;
        if (Number(holding.quantity) < quantity) throw new Error("Insufficient holdings quantity");
        const cashBalance = Number(settingsSnapshot.data()?.cashBalance ?? 0);
        const nextQuantity = Number(holding.quantity) - quantity;
        if (nextQuantity === 0) firestoreTransaction.delete(holdingRef);
        else firestoreTransaction.update(holdingRef, { quantity: nextQuantity, updatedAt: serverTimestamp() });
        firestoreTransaction.set(settingsRef, { cashBalance: cashBalance + (quantity * price - fees), updatedAt: serverTimestamp() }, { merge: true });
        firestoreTransaction.set(transactionRef, {
          holdingId,
          symbol: holding.symbol,
          type: "SELL",
          quantity,
          price,
          fees,
          date: todayKey(),
          orderStatus: "executed",
          createdAt: serverTimestamp(),
        });
        firestoreTransaction.set(cashEntryRef, {
          type: "SALE",
          amount: quantity * price - fees,
          direction: "credit",
          date: todayKey(),
          holdingId,
          symbol: holding.symbol,
          quantity,
          price,
          note: `Sold ${quantity} ${holding.symbol}`,
          correlationId: cashEntryId,
          source: "app",
          createdAt: serverTimestamp(),
          createdAtMs: Date.now(),
        });
      });
      toast.success("Mock sell executed");
      return true;
    } catch (error) {
      logError("portfolio.executeMockSell", error);
      logError("portfolio.sell", error);
      toast.error(friendlyErrorMessage(error, "Couldn't complete the sell order."));
      return false;
    }
  }, [db, user, settings]);

  const placeLimitBuyOrder = useCallback(async (holding: Holding, quantity: number, targetPrice: number) => {
    if (!user || !db || !(quantity > 0) || !(targetPrice > 0)) return false;
    try {
      await setDoc(doc(collection(db, "users", user.uid, "portfolioOrders")), {
        holdingId: holding.id,
        symbol: holding.symbol,
        yahooSymbol: holding.yahooSymbol,
        name: holding.name,
        exchange: holding.exchange,
        instrumentType: holding.instrumentType,
        type: "BUY",
        orderType: "LIMIT",
        quantity,
        targetPrice,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      toast.success("Limit buy order placed");
      return true;
    } catch (error) {
      logError("portfolio.placeLimitOrder", error);
      toast.error("Failed to place limit order");
      return false;
    }
  }, [db, user]);

  const cancelOrder = useCallback(async (id: string) => {
    if (!user || !db) return false;
    try {
      await updateDoc(doc(db, "users", user.uid, "portfolioOrders", id), { status: "cancelled", updatedAt: serverTimestamp() });
      toast.success("Order cancelled");
      return true;
    } catch (error) {
      logError("portfolio.cancelOrder", error);
      toast.error("Failed to cancel order");
      return false;
    }
  }, [db, user]);

  /**
   * Money arriving from a bank account.
   *
   * Now a ledger entry rather than a read-modify-write of the scalar, and it keeps
   * the date the user picked — the old path overwrote it with today's, so a
   * back-dated transfer landed on the wrong day.
   */
  const depositCash = useCallback(async (
    amount: number,
    note?: string,
    options?: { date?: string; entryId?: string; accountId?: string; accountEntryId?: string }
  ) => {
    if (!user || !db || !(amount > 0)) return false;
    try {
      await ensureCashBaseline(user.uid, settings?.cashBalance ?? 0);
      const result = await recordInvestmentCashEntry(
        user.uid,
        {
          type: "TOP_UP",
          amount,
          direction: "credit",
          date: options?.date ?? todayKey(),
          note: note || "Cash deposit to Stocks Demat",
          accountId: options?.accountId,
          accountEntryId: options?.accountEntryId,
        },
        options?.entryId
      );
      toast.success(writeSavedMessage(result.outcome, "Cash deposited to Stocks Demat"));
      return true;
    } catch (error) {
      logError("portfolio.depositCash", error);
      toast.error(friendlyErrorMessage(error, "Failed to deposit cash"));
      return false;
    }
  }, [db, user, settings]);

  /** Money returning to a bank account. Guarded against overdrawing the wallet. */
  const withdrawCash = useCallback(async (
    amount: number,
    note?: string,
    options?: { date?: string; entryId?: string; accountId?: string; accountEntryId?: string }
  ) => {
    if (!user || !db || !(amount > 0)) return false;
    if (amount > availableCash) {
      toast.error("Insufficient cash balance");
      return false;
    }
    try {
      await ensureCashBaseline(user.uid, settings?.cashBalance ?? 0);
      const result = await recordInvestmentCashEntry(
        user.uid,
        {
          type: "WITHDRAWAL",
          amount,
          direction: "debit",
          date: options?.date ?? todayKey(),
          note: note || "Cash withdrawal from Stocks Demat",
          accountId: options?.accountId,
          accountEntryId: options?.accountEntryId,
        },
        options?.entryId
      );
      toast.success(writeSavedMessage(result.outcome, "Cash withdrawn from Stocks Demat"));
      return true;
    } catch (error) {
      logError("portfolio.withdrawCash", error);
      toast.error(friendlyErrorMessage(error, "Couldn't withdraw the cash."));
      return false;
    }
  }, [db, user, settings, availableCash]);

  return {
    holdings,
    transactions,
    watchlist,
    orders,
    alerts,
    snapshots,
    settings,
    /** Investment Cash ledger movements, newest-first rendering is the caller's job. */
    cashEntries,
    /** Authoritative Investment Cash Balance — derived, not the stored scalar. */
    cashBalance,
    /** `cashBalance` clamped at zero: what may actually be spent. */
    availableCash,
    loading,
    addHolding,
    updateHolding,
    deleteHolding,
    findHoldingPurchase,
    overwriteHoldings,
    addToWatchlist,
    removeFromWatchlist,
    addAlert,
    toggleAlert,
    deleteAlert,
    saveSettings,
    saveDailySnapshot,
    executeMockBuy,
    executeMockSell,
    placeLimitBuyOrder,
    cancelOrder,
    depositCash,
    withdrawCash,
  };
}
