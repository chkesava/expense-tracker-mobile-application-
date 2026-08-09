import { useCallback, useEffect, useState } from "react";
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
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { scheduleIdleWork } from "@/shared/utils/scheduleIdle";
import type {
  Holding,
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
 */
export function usePortfolio(options?: { enabled?: boolean }) {
  const { user } = useAuth();
  const db = getFirestoreDb();
  const enabled = options?.enabled ?? true;

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [orders, setOrders] = useState<PortfolioOrder[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [settings, setSettings] = useState<PortfolioSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !db) {
      setHoldings([]);
      setTransactions([]);
      setWatchlist([]);
      setOrders([]);
      setAlerts([]);
      setSnapshots([]);
      setSettings(null);
      setLoading(false);
      return;
    }

    if (!enabled) {
      setLoading(false);
      return;
    }

    const uid = user.uid;
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
        console.error("Failed to load holdings", error);
        setLoading(false);
      }),
    ];

    // Secondary collections after idle — avoid snapshot fan-out on dashboard
    let secondaryUnsubs: Array<() => void> = [];
    const cancelIdle = scheduleIdleWork(
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
              console.error("Failed to load portfolio snapshots", error);
            }
          ),
        ];
      },
      { fallbackDelayMs: 900, timeoutMs: 2500 }
    );

    return () => {
      cancelIdle();
      primaryUnsubs.forEach((unsubscribe) => unsubscribe());
      secondaryUnsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [db, user, enabled]);

  const addHolding = useCallback(async (holding: CreateHoldingInput): Promise<string | null> => {
    if (!user || !db) return null;
    try {
      const created = await addDoc(
        collection(db, "users", user.uid, "holdings"),
        stripUndefined({ ...holding, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      );
      toast.success("Holding added");
      return created.id;
    } catch (error) {
      console.error("Failed to add holding", error);
      toast.error("Failed to add holding");
      return null;
    }
  }, [db, user]);

  const updateHolding = useCallback(async (id: string, updates: Partial<CreateHoldingInput>) => {
    if (!user || !db) return false;
    try {
      await updateDoc(
        doc(db, "users", user.uid, "holdings", id),
        stripUndefined({ ...updates, updatedAt: serverTimestamp() })
      );
      return true;
    } catch (error) {
      console.error("Failed to update holding", error);
      toast.error("Failed to update holding");
      return false;
    }
  }, [db, user]);

  const deleteHolding = useCallback(async (id: string) => {
    if (!user || !db) return false;
    try {
      await deleteDoc(doc(db, "users", user.uid, "holdings", id));
      toast.success("Holding removed");
      return true;
    } catch (error) {
      console.error("Failed to delete holding", error);
      toast.error("Failed to remove holding");
      return false;
    }
  }, [db, user]);

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
      console.error("Failed to import holdings", error);
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
      console.error("Failed to add to watchlist", error);
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
      console.error("Failed to remove watchlist item", error);
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
      console.error("Failed to create alert", error);
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
      console.error("Failed to update alert", error);
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
      console.error("Failed to delete alert", error);
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
      console.error("Failed to save portfolio settings", error);
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
      console.error("Failed to save portfolio snapshot", error);
      return false;
    }
  }, [db, user]);

  const executeMockBuy = useCallback(async (holdingId: string, quantity: number, price: number, fees = 0) => {
    if (!user || !db) return false;
    if (!(quantity > 0) || !(price > 0) || fees < 0) return false;
    const holdingRef = doc(db, "users", user.uid, "holdings", holdingId);
    const settingsRef = doc(db, "users", user.uid, "portfolioSettings", SETTINGS_DOC_ID);
    const transactionRef = doc(collection(db, "users", user.uid, "portfolioTransactions"));
    try {
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
      });
      toast.success("Mock buy executed");
      return true;
    } catch (error) {
      console.error("Failed to execute mock buy", error);
      toast.error(error instanceof Error ? error.message : "Failed to execute buy");
      return false;
    }
  }, [db, user]);

  const executeMockSell = useCallback(async (holdingId: string, quantity: number, price: number, fees = 0) => {
    if (!user || !db) return false;
    if (!(quantity > 0) || !(price > 0) || fees < 0 || quantity * price < fees) return false;
    const holdingRef = doc(db, "users", user.uid, "holdings", holdingId);
    const settingsRef = doc(db, "users", user.uid, "portfolioSettings", SETTINGS_DOC_ID);
    const transactionRef = doc(collection(db, "users", user.uid, "portfolioTransactions"));
    try {
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
      });
      toast.success("Mock sell executed");
      return true;
    } catch (error) {
      console.error("Failed to execute mock sell", error);
      toast.error(error instanceof Error ? error.message : "Failed to execute sell");
      return false;
    }
  }, [db, user]);

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
      console.error("Failed to place limit order", error);
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
      console.error("Failed to cancel order", error);
      toast.error("Failed to cancel order");
      return false;
    }
  }, [db, user]);

  const depositCash = useCallback(async (amount: number, note?: string) => {
    if (!user || !db || !(amount > 0)) return false;
    const settingsRef = doc(db, "users", user.uid, "portfolioSettings", SETTINGS_DOC_ID);
    const transactionRef = doc(collection(db, "users", user.uid, "portfolioTransactions"));
    try {
      await runTransaction(db, async (firestoreTransaction) => {
        const settingsSnapshot = await firestoreTransaction.get(settingsRef);
        const currentBalance = Number(settingsSnapshot.data()?.cashBalance ?? 0);
        firestoreTransaction.set(
          settingsRef,
          {
            cashBalance: currentBalance + amount,
            updatedAt: serverTimestamp(),
            createdAt: settingsSnapshot.data()?.createdAt ?? serverTimestamp(),
          },
          { merge: true }
        );
        firestoreTransaction.set(transactionRef, {
          holdingId: "cash",
          symbol: "CASH",
          type: "BUY",
          quantity: 1,
          price: amount,
          fees: 0,
          notes: note || "Cash deposit to Stocks Demat",
          date: todayKey(),
          orderStatus: "executed",
          createdAt: serverTimestamp(),
        });
      });
      toast.success("Cash deposited to Stocks Demat");
      return true;
    } catch (error) {
      console.error("Failed to deposit cash", error);
      toast.error("Failed to deposit cash");
      return false;
    }
  }, [db, user]);

  const withdrawCash = useCallback(async (amount: number, note?: string) => {
    if (!user || !db || !(amount > 0)) return false;
    const settingsRef = doc(db, "users", user.uid, "portfolioSettings", SETTINGS_DOC_ID);
    const transactionRef = doc(collection(db, "users", user.uid, "portfolioTransactions"));
    try {
      await runTransaction(db, async (firestoreTransaction) => {
        const settingsSnapshot = await firestoreTransaction.get(settingsRef);
        const currentBalance = Number(settingsSnapshot.data()?.cashBalance ?? 0);
        if (currentBalance < amount) {
          throw new Error("Insufficient cash balance");
        }
        firestoreTransaction.set(
          settingsRef,
          {
            cashBalance: currentBalance - amount,
            updatedAt: serverTimestamp(),
            createdAt: settingsSnapshot.data()?.createdAt ?? serverTimestamp(),
          },
          { merge: true }
        );
        firestoreTransaction.set(transactionRef, {
          holdingId: "cash",
          symbol: "CASH",
          type: "SELL",
          quantity: 1,
          price: amount,
          fees: 0,
          notes: note || "Cash withdrawal from Stocks Demat",
          date: todayKey(),
          orderStatus: "executed",
          createdAt: serverTimestamp(),
        });
      });
      toast.success("Cash withdrawn from Stocks Demat");
      return true;
    } catch (error) {
      console.error("Failed to withdraw cash", error);
      toast.error(error instanceof Error ? error.message : "Failed to withdraw cash");
      return false;
    }
  }, [db, user]);

  return {
    holdings,
    transactions,
    watchlist,
    orders,
    alerts,
    snapshots,
    settings,
    loading,
    addHolding,
    updateHolding,
    deleteHolding,
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
