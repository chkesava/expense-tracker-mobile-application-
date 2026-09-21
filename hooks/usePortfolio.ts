import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import {
  INVESTMENT_CASH_COLLECTION,
  createHoldingWithCash,
  deleteHoldingWithOptionalRefund,
  ensureCashBaseline,
  executeMockBuy as commitMockBuy,
  executeMockSell as commitMockSell,
  overwriteHoldingsPreservingIds,
} from "@/services/portfolio/investmentCash";
import { usePortfolioMutations } from "@/hooks/usePortfolioMutations";
import { scheduleIdleWork } from "@/shared/utils/scheduleIdle";
import { todayDateKey } from "@/shared/utils/dates";
import {
  availableInvestmentCash,
  computeInvestmentCashBalance,
  holdingPurchaseAmount,
  netHoldingCashOutlay,
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

/**
 * Portfolio data repository. Every path intentionally matches the existing web
 * app, so a signed-in user sees the same portfolio on web and mobile.
 *
 * @param options.enabled When false, skips snapshot listeners (ledger tabs already unmount portfolio/SIP when inactive).
 * @param options.includeSecondary When false, only settings + holdings (enough for net worth).
 */
function usePortfolioState(options?: {
  enabled?: boolean;
  includeSecondary?: boolean;
}) {
  const { user } = useAuth();
  const uid = user?.uid;
  const db = getFirestoreDb();
  const { settings: appSettings } = useSettings();
  const today = todayDateKey(appSettings.timezone);
  const enabled = options?.enabled ?? true;
  const includeSecondary = options?.includeSecondary !== false;
  const { depositCash, withdrawCash } = usePortfolioMutations();

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
        date: options?.date ?? (holding.datePurchased || today),
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
  }, [db, user, settings, today]);

  const updateHolding = useCallback(async (id: string, updates: Partial<CreateHoldingInput>) => {
    if (!user || !db) return false;
    const { quantity: _quantity, averageBuyPrice: _averageBuyPrice, ...safe } = updates;
    if (Object.keys(safe).length === 0) {
      toast.error("Quantity and average price can only change through a trade");
      return false;
    }
    try {
      await updateDoc(
        doc(db, "users", user.uid, "holdings", id),
        stripUndefined({ ...safe, updatedAt: serverTimestamp() })
      );
      return true;
    } catch (error) {
      logError("portfolio.updateHolding", error);
      toast.error("Failed to update holding");
      return false;
    }
  }, [db, user, today]);

  /**
   * Removes a holding, optionally returning the cash still tied to it.
   *
   * Refund + delete are one batch. The refund is net purchases minus sales
   * minus reversals, and opt-in: removing a holding must never silently put
   * spent money back on the balance (KAN-77 / SPENDLY-37).
   */
  const deleteHolding = useCallback(async (
    id: string,
    options?: { refundCash?: boolean }
  ) => {
    if (!user || !db) return false;
    try {
      const holding = holdings.find((item) => item.id === id);
      const result = await deleteHoldingWithOptionalRefund(user.uid, {
        holdingId: id,
        refundCash: options?.refundCash,
        date: today,
        symbol: holding?.symbol,
        cashEntries,
      });
      toast.success(
        writeSavedMessage(
          result.outcome,
          result.refunded > 0 ? "Holding removed and cash returned" : "Holding removed"
        )
      );
      return true;
    } catch (error) {
      logError("portfolio.deleteHolding", error);
      toast.error(friendlyErrorMessage(error, "Failed to remove holding"));
      return false;
    }
  }, [cashEntries, db, holdings, user, today]);

  /** Outstanding cash still tied to a holding, if it was funded in-app. */
  const findHoldingPurchase = useCallback(
    (holdingId: string) => {
      const amount = netHoldingCashOutlay(cashEntries, holdingId);
      if (!(amount > 0)) return null;
      const purchase = cashEntries.find(
        (entry) => entry.type === "PURCHASE" && entry.holdingId === holdingId
      );
      return {
        id: purchase?.id ?? holdingId,
        amount,
        symbol: purchase?.symbol,
        type: "PURCHASE" as const,
        holdingId,
      };
    },
    [cashEntries]
  );

  const overwriteHoldings = useCallback(async (nextHoldings: CreateHoldingInput[]) => {
    if (!user || !db) return false;
    try {
      await overwriteHoldingsPreservingIds(user.uid, {
        existing: holdings,
        nextHoldings,
        cashEntries,
        date: today,
      });
      toast.success("Holdings imported");
      return true;
    } catch (error) {
      logError("portfolio.importHoldings", error);
      toast.error("Failed to import CSV");
      return false;
    }
  }, [cashEntries, db, holdings, user, today]);

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
  }, [db, user, today]);

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
  }, [db, user, today]);

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
  }, [db, user, today]);

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
  }, [db, user, today]);

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
    const date = today;
    const ref = doc(db, "users", user.uid, "portfolioSnapshots", date);
    try {
      if ((await getDoc(ref)).exists()) return true;
      await setDoc(ref, { ...snapshot, date, createdAt: serverTimestamp() });
      return true;
    } catch (error) {
      logError("portfolio.savePortfolioSnapshot", error);
      return false;
    }
  }, [db, user, today]);

  const executeMockBuy = useCallback(async (holdingId: string, quantity: number, price: number, fees = 0) => {
    if (!user || !db) return false;
    try {
      const result = await commitMockBuy(user.uid, {
        holdingId,
        quantity,
        price,
        fees,
        date: today,
      });
      toast.success(writeSavedMessage(result.outcome, "Mock buy executed"));
      return true;
    } catch (error) {
      logError("portfolio.executeMockBuy", error);
      toast.error(friendlyErrorMessage(error, "Couldn't complete the buy order."));
      return false;
    }
  }, [db, user, today]);

  const executeMockSell = useCallback(async (holdingId: string, quantity: number, price: number, fees = 0) => {
    if (!user || !db) return false;
    try {
      const result = await commitMockSell(user.uid, {
        holdingId,
        quantity,
        price,
        fees,
        date: today,
      });
      toast.success(writeSavedMessage(result.outcome, "Mock sell executed"));
      return true;
    } catch (error) {
      logError("portfolio.executeMockSell", error);
      toast.error(friendlyErrorMessage(error, "Couldn't complete the sell order."));
      return false;
    }
  }, [db, user, today]);

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
  }, [db, user, today]);

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
    cancelOrder,
    depositCash,
    withdrawCash,
  };
}

type PortfolioApi = ReturnType<typeof usePortfolioState>;

const PortfolioContext = createContext<PortfolioApi | null>(null);

/** One 8-listener set for the Investments tab. Nested holdings/cash UI reads this. */
export function PortfolioDataProvider({ children }: { children: ReactNode }) {
  const value = usePortfolioState();
  return createElement(PortfolioContext.Provider, { value }, children);
}

export function usePortfolio(options?: {
  enabled?: boolean;
  includeSecondary?: boolean;
}) {
  const ctx = useContext(PortfolioContext);
  const enabled = options?.enabled ?? true;
  const includeSecondary = options?.includeSecondary !== false;
  const shareParent = Boolean(ctx && enabled && includeSecondary);
  const local = usePortfolioState(
    shareParent ? { enabled: false, includeSecondary: false } : options
  );
  return shareParent && ctx ? ctx : local;
}
