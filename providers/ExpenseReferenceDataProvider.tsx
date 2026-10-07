/**
 * One Firestore listener per reference collection for the Expense app shell.
 * Screens read this context instead of attaching their own onSnapshot watches.
 */

import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler, type LoadFailure } from "@/lib/firestoreErrors";
import {
  forgetSnapshotPath,
  logDirectRead,
  logQuerySnapshot,
} from "@/lib/firestoreReadDebug";
import { commitWrite } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { rememberHydratedSubscriptions } from "@/services/sms/smsRecurringSync";
import { postDueSubscriptionCharge } from "@/services/subscriptions/duePost";
import type {
  CategorizationRule,
  Category,
  CategoryBudget,
  FinancialGoal,
} from "@/shared/types/expense";
import type { Space } from "@/shared/types/space";
import type { Subscription } from "@/shared/types/subscription";
import { parseLocalDate, todayDateKey } from "@/shared/utils/dates";
import { scheduleIdleWork } from "@/shared/utils/scheduleIdle";
import { perfEvent } from "@/lib/perf";
import {
  evaluateSubscriptionDue,
  planDueSubscriptionPosts,
} from "@/shared/utils/subscriptionProcessor";

export type ExpenseReferenceData = {
  categories: Category[];
  categoriesLoading: boolean;
  categoriesError: LoadFailure | null;
  retryCategories: () => void;
  subscriptions: Subscription[];
  subscriptionsLoading: boolean;
  subscriptionsError: LoadFailure | null;
  retrySubscriptions: () => void;
  spaces: Space[];
  spacesLoading: boolean;
  spacesError: LoadFailure | null;
  retrySpaces: () => void;
  rules: CategorizationRule[];
  rulesLoading: boolean;
  rulesError: LoadFailure | null;
  retryRules: () => void;
  budgets: CategoryBudget[];
  budgetsLoading: boolean;
  budgetsError: LoadFailure | null;
  retryBudgets: () => void;
  registerBudgetsSubscriber: () => () => void;
  goals: FinancialGoal[];
  goalsLoading: boolean;
  goalsError: LoadFailure | null;
  retryGoals: () => void;
  registerGoalsSubscriber: () => () => void;
};

const ExpenseReferenceDataContext = createContext<ExpenseReferenceData | undefined>(
  undefined
);

/** SPENDLY-412: minimum gap between foreground-triggered refetches of the
 * one-shot spaces/categorizationRules collections. */
const FOREGROUND_REFRESH_MIN_INTERVAL_MS = 5 * 60 * 1000;

export function ExpenseReferenceDataProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useAuth();
  const uid = user?.uid;
  const db = getFirestoreDb();
  const { settings } = useSettings();
  const timezone = settings.timezone;

  const [categories, setCategories] = useState<Category[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [goals, setGoals] = useState<FinancialGoal[]>([]);

  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(true);
  const [spacesLoading, setSpacesLoading] = useState(true);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [budgetsLoading, setBudgetsLoading] = useState(true);
  const [goalsLoading, setGoalsLoading] = useState(true);

  const {
    error: categoriesError,
    setError: setCategoriesError,
    retry: retryCategories,
    attempt: categoriesAttempt,
  } = useLoadFailure();
  const {
    error: subscriptionsError,
    setError: setSubscriptionsError,
    retry: retrySubscriptions,
    attempt: subscriptionsAttempt,
  } = useLoadFailure();
  const {
    error: spacesError,
    setError: setSpacesError,
    retry: retrySpaces,
    attempt: spacesAttempt,
  } = useLoadFailure();
  const {
    error: rulesError,
    setError: setRulesError,
    retry: retryRules,
    attempt: rulesAttempt,
  } = useLoadFailure();
  const {
    error: budgetsError,
    setError: setBudgetsError,
    retry: retryBudgets,
    attempt: budgetsAttempt,
  } = useLoadFailure();
  const {
    error: goalsError,
    setError: setGoalsError,
    retry: retryGoals,
    attempt: goalsAttempt,
  } = useLoadFailure();

  const isProcessingDueRef = useRef(false);
  const skippedAccountToastShown = useRef(false);
  const subscriptionsRef = useRef(subscriptions);
  subscriptionsRef.current = subscriptions;

  // SPENDLY-411: budgets/goals are only read from optional, user-configurable
  // dashboard widgets and per-screen planning hooks — unlike categories/
  // subscriptions/spaces/categorizationRules, nothing pervasive depends on
  // them, so they get the same Active-On-Demand gating as Credit Cards/
  // Borrowings/Receivables (SPENDLY-401) instead of listening unconditionally.
  const [shouldListenBudgets, setShouldListenBudgets] = useState(false);
  const budgetsSubscriberCountRef = useRef(0);
  const budgetsTeardownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const registerBudgetsSubscriber = useCallback(() => {
    if (budgetsTeardownTimerRef.current) {
      clearTimeout(budgetsTeardownTimerRef.current);
      budgetsTeardownTimerRef.current = null;
    }
    budgetsSubscriberCountRef.current += 1;
    setShouldListenBudgets(true);
    return () => {
      budgetsSubscriberCountRef.current = Math.max(
        0,
        budgetsSubscriberCountRef.current - 1
      );
      if (budgetsSubscriberCountRef.current === 0) {
        if (budgetsTeardownTimerRef.current) {
          clearTimeout(budgetsTeardownTimerRef.current);
        }
        budgetsTeardownTimerRef.current = setTimeout(() => {
          if (budgetsSubscriberCountRef.current === 0) {
            setShouldListenBudgets(false);
          }
          budgetsTeardownTimerRef.current = null;
        }, 15000);
      }
    };
  }, []);

  const [shouldListenGoals, setShouldListenGoals] = useState(false);
  const goalsSubscriberCountRef = useRef(0);
  const goalsTeardownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const registerGoalsSubscriber = useCallback(() => {
    if (goalsTeardownTimerRef.current) {
      clearTimeout(goalsTeardownTimerRef.current);
      goalsTeardownTimerRef.current = null;
    }
    goalsSubscriberCountRef.current += 1;
    setShouldListenGoals(true);
    return () => {
      goalsSubscriberCountRef.current = Math.max(
        0,
        goalsSubscriberCountRef.current - 1
      );
      if (goalsSubscriberCountRef.current === 0) {
        if (goalsTeardownTimerRef.current) {
          clearTimeout(goalsTeardownTimerRef.current);
        }
        goalsTeardownTimerRef.current = setTimeout(() => {
          if (goalsSubscriberCountRef.current === 0) {
            setShouldListenGoals(false);
          }
          goalsTeardownTimerRef.current = null;
        }, 15000);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (budgetsTeardownTimerRef.current) {
        clearTimeout(budgetsTeardownTimerRef.current);
      }
      if (goalsTeardownTimerRef.current) {
        clearTimeout(goalsTeardownTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    skippedAccountToastShown.current = false;
  }, [uid]);

  useEffect(() => {
    if (!uid || !db) {
      setCategories([]);
      setCategoriesLoading(false);
      return;
    }
    setCategoriesLoading(true);
    const path = `users/${uid}/categories`;
    let unsub: (() => void) | null = null;
    const cancelIdle = scheduleIdleWork(() => {
      perfEvent("firestore_listener_start", { collection: "categories" });
      unsub = onSnapshot(
        // SPENDLY-412: defensive bound — categories are a small, user-curated
        // list (observed <50 docs), not expected to need the full ledger's
        // unbounded shape, but a cap keeps a runaway account from paying for it.
        query(collection(db, "users", uid, "categories"), limit(500)),
        (snap) => {
          logQuerySnapshot(path, snap, { feature: "reference", queryShape: "categories" });
          perfEvent("firestore_first_snapshot", {
            collection: "categories",
            docCount: snap.docs.length,
            fromCache: snap.metadata.fromCache,
          });
          setCategories(
            snap.docs.map((d) => ({ id: d.id, ...d.data() } as Category))
          );
          setCategoriesError(null);
          setCategoriesLoading(false);
        },
        snapshotErrorHandler(
          "snapshot.categories",
          (failure) => {
            setCategoriesError(failure);
            setCategoriesLoading(false);
          },
          "Couldn't load your categories."
        )
      );
    });
    return () => {
      cancelIdle();
      forgetSnapshotPath(path);
      if (unsub) unsub();
    };
  }, [uid, db, categoriesAttempt, setCategoriesError]);

  useEffect(() => {
    if (!uid || !db) {
      setSubscriptions([]);
      setSubscriptionsLoading(false);
      rememberHydratedSubscriptions(null);
      return;
    }
    setSubscriptionsLoading(true);
    const path = `users/${uid}/subscriptions`;
    perfEvent("firestore_listener_start", { collection: "subscriptions" });
    const unsub = onSnapshot(
      // SPENDLY-412: defensive bound (observed <25 docs) — stays realtime,
      // subscriptions drive the due-subscription auto-posting side effect below.
      query(
        collection(db, "users", uid, "subscriptions"),
        orderBy("name", "asc"),
        limit(200)
      ),
      (snap) => {
        logQuerySnapshot(path, snap, { feature: "reference", queryShape: "subscriptions" });
        perfEvent("firestore_first_snapshot", {
          collection: "subscriptions",
          docCount: snap.docs.length,
          fromCache: snap.metadata.fromCache,
        });
        const list = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Subscription, "id">),
        }));
        setSubscriptions(list);
        rememberHydratedSubscriptions(list);
        setSubscriptionsError(null);
        setSubscriptionsLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.subscriptions",
        (failure) => {
          setSubscriptionsError(failure);
          setSubscriptionsLoading(false);
        },
        "Couldn't load your subscriptions."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      rememberHydratedSubscriptions(null);
      unsub();
    };
  }, [uid, db, subscriptionsAttempt, setSubscriptionsError]);

  // SPENDLY-412: spaces are a small (observed <10 docs), slow-changing,
  // non-collaborative list — read-once per session/retry instead of a
  // standing realtime listener. Refetched explicitly after writes
  // (hooks/useSpaces.ts) and on app foreground if stale (below).
  const lastFetchedSpacesAtRef = useRef(0);
  useEffect(() => {
    if (!uid || !db) {
      setSpaces([]);
      setSpacesLoading(false);
      return;
    }
    setSpacesLoading(true);
    const path = `users/${uid}/spaces`;
    let cancelled = false;
    const cancelIdle = scheduleIdleWork(() => {
      getDocs(query(collection(db, "users", uid, "spaces"), orderBy("name"), limit(200)))
        .then((snap) => {
          if (cancelled) return;
          logDirectRead(path, snap.docs.length, snap.metadata.fromCache ? "cache" : "server", {
            feature: "reference",
            queryShape: "spaces",
          });
          lastFetchedSpacesAtRef.current = Date.now();
          setSpaces(
            snap.docs.map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as Omit<Space, "id">),
            }))
          );
          setSpacesError(null);
          setSpacesLoading(false);
        })
        .catch(
          snapshotErrorHandler(
            "snapshot.spaces",
            (failure) => {
              if (cancelled) return;
              setSpacesError(failure);
              setSpacesLoading(false);
            },
            "Couldn't load your spaces."
          )
        );
    });
    return () => {
      cancelled = true;
      cancelIdle();
      forgetSnapshotPath(path);
    };
  }, [uid, db, spacesAttempt, setSpacesError]);

  // SPENDLY-412: categorizationRules are a small (observed <30 docs),
  // slow-changing settings list, read only by foreground UI (ExpenseForm
  // autosuggest, MagicChatModal, the rules-management screen) — read-once
  // per session/retry instead of a standing realtime listener. Refetched
  // explicitly after writes (hooks/useCategorizationRules.ts) and on app
  // foreground if stale (below).
  const lastFetchedRulesAtRef = useRef(0);
  useEffect(() => {
    if (!uid || !db) {
      setRules([]);
      setRulesLoading(false);
      return;
    }
    setRulesLoading(true);
    const path = `users/${uid}/categorizationRules`;
    let cancelled = false;
    const cancelIdle = scheduleIdleWork(() => {
      getDocs(
        query(
          collection(db, "users", uid, "categorizationRules"),
          orderBy("createdAt", "asc"),
          limit(500)
        )
      )
        .then((snap) => {
          if (cancelled) return;
          logDirectRead(path, snap.docs.length, snap.metadata.fromCache ? "cache" : "server", {
            feature: "reference",
            queryShape: "categorizationRules",
          });
          lastFetchedRulesAtRef.current = Date.now();
          setRules(
            snap.docs.map((d) => ({ id: d.id, ...d.data() } as CategorizationRule))
          );
          setRulesError(null);
          setRulesLoading(false);
        })
        .catch(
          snapshotErrorHandler(
            "snapshot.categorizationRules",
            (failure) => {
              if (cancelled) return;
              setRulesError(failure);
              setRulesLoading(false);
            },
            "Couldn't load your categorization rules."
          )
        );
    });
    return () => {
      cancelled = true;
      cancelIdle();
      forgetSnapshotPath(path);
    };
  }, [uid, db, rulesAttempt, setRulesError]);

  // SPENDLY-412: bounded eventual-sync for the two one-shot collections —
  // on app foreground, refetch only if the last fetch is stale (5 min),
  // so backgrounding/foregrounding quickly doesn't cause a read storm.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const now = Date.now();
      if (now - lastFetchedSpacesAtRef.current > FOREGROUND_REFRESH_MIN_INTERVAL_MS) {
        retrySpaces();
      }
      if (now - lastFetchedRulesAtRef.current > FOREGROUND_REFRESH_MIN_INTERVAL_MS) {
        retryRules();
      }
    });
    return () => sub.remove();
  }, [retrySpaces, retryRules]);

  useEffect(() => {
    if (!shouldListenBudgets) {
      if (budgets.length === 0) {
        setBudgetsLoading(false);
      }
      return;
    }
    if (!uid || !db) {
      setBudgets([]);
      setBudgetsLoading(false);
      return;
    }
    setBudgetsLoading(true);
    const path = `users/${uid}/categoryBudgets`;
    perfEvent("firestore_listener_start", { collection: "categoryBudgets" });
    const unsub = onSnapshot(
      query(
        collection(db, "users", uid, "categoryBudgets"),
        orderBy("month", "desc")
      ),
      (snap) => {
        logQuerySnapshot(path, snap, { feature: "reference", queryShape: "categoryBudgets" });
        perfEvent("firestore_first_snapshot", {
          collection: "categoryBudgets",
          docCount: snap.docs.length,
          fromCache: snap.metadata.fromCache,
        });
        setBudgets(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as CategoryBudget))
        );
        setBudgetsError(null);
        setBudgetsLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.categoryBudgets",
        (failure) => {
          setBudgetsError(failure);
          setBudgetsLoading(false);
        },
        "Couldn't load your budgets."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsub();
    };
  }, [uid, db, budgetsAttempt, setBudgetsError, shouldListenBudgets]);

  useEffect(() => {
    if (!shouldListenGoals) {
      if (goals.length === 0) {
        setGoalsLoading(false);
      }
      return;
    }
    if (!uid || !db) {
      setGoals([]);
      setGoalsLoading(false);
      return;
    }
    setGoalsLoading(true);
    const path = `users/${uid}/financialGoals`;
    perfEvent("firestore_listener_start", { collection: "financialGoals" });
    const unsub = onSnapshot(
      query(
        collection(db, "users", uid, "financialGoals"),
        orderBy("createdAt", "asc")
      ),
      (snap) => {
        logQuerySnapshot(path, snap, { feature: "reference", queryShape: "financialGoals" });
        perfEvent("firestore_first_snapshot", {
          collection: "financialGoals",
          docCount: snap.docs.length,
          fromCache: snap.metadata.fromCache,
        });
        setGoals(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as FinancialGoal))
        );
        setGoalsError(null);
        setGoalsLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.financialGoals",
        (failure) => {
          setGoalsError(failure);
          setGoalsLoading(false);
        },
        "Couldn't load your goals."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsub();
    };
  }, [uid, db, goalsAttempt, setGoalsError, shouldListenGoals]);

  const processDueSubscriptions = useCallback(async () => {
    const database = getFirestoreDb();
    const list = subscriptionsRef.current;
    if (!uid || !database || isProcessingDueRef.current || list.length === 0) {
      return;
    }

    isProcessingDueRef.current = true;
    try {
      const now = parseLocalDate(todayDateKey(timezone));
      const plan = planDueSubscriptionPosts(list, now);
      let skippedNoAccount = 0;

      for (const action of plan) {
        if (!action.subscriptionId) continue;
        try {
          const result = await postDueSubscriptionCharge(uid, action);
          if (result.status === "skipped_no_account") {
            skippedNoAccount += 1;
          }
        } catch (err) {
          logError("subscriptions.processingDueSubscriptions", err);
        }
      }

      if (skippedNoAccount > 0 && !skippedAccountToastShown.current) {
        skippedAccountToastShown.current = true;
        toast.warning(
          skippedNoAccount === 1
            ? "A subscription needs an account before it can auto-post"
            : "Some subscriptions need an account before they can auto-post"
        );
      }

      for (const sub of list) {
        if (!sub.id) continue;
        if (sub.source === "sms") continue;
        if (plan.some((a) => a.subscriptionId === sub.id)) continue;
        const evaluation = evaluateSubscriptionDue(sub, now);
        if (evaluation.isCompleted && !sub.isCompleted) {
          const subRef = doc(database, "users", uid, "subscriptions", sub.id);
          try {
            await commitWrite(
              () =>
                updateDoc(subRef, {
                  isCompleted: true,
                  isActive: false,
                }),
              { label: "subscription" }
            );
          } catch (err) {
            logError("subscriptions.processingDueSubscriptions", err);
          }
        }
      }
    } catch (err) {
      logError("subscriptions.processingDueSubscriptions", err);
    } finally {
      isProcessingDueRef.current = false;
    }
  }, [uid, timezone]);

  useEffect(() => {
    if (subscriptionsLoading || subscriptions.length === 0) return;
    return scheduleIdleWork(() => {
      void processDueSubscriptions();
    }, { timeoutMs: 3000, fallbackDelayMs: 1500 });
  }, [subscriptionsLoading, subscriptions.length, processDueSubscriptions]);

  const value = useMemo<ExpenseReferenceData>(
    () => ({
      categories,
      categoriesLoading,
      categoriesError,
      retryCategories,
      subscriptions,
      subscriptionsLoading,
      subscriptionsError,
      retrySubscriptions,
      spaces,
      spacesLoading,
      spacesError,
      retrySpaces,
      rules,
      rulesLoading,
      rulesError,
      retryRules,
      budgets,
      budgetsLoading,
      budgetsError,
      retryBudgets,
      registerBudgetsSubscriber,
      goals,
      goalsLoading,
      goalsError,
      retryGoals,
      registerGoalsSubscriber,
    }),
    [
      categories,
      categoriesLoading,
      categoriesError,
      retryCategories,
      subscriptions,
      subscriptionsLoading,
      subscriptionsError,
      retrySubscriptions,
      spaces,
      spacesLoading,
      spacesError,
      retrySpaces,
      rules,
      rulesLoading,
      rulesError,
      retryRules,
      budgets,
      budgetsLoading,
      budgetsError,
      retryBudgets,
      registerBudgetsSubscriber,
      goals,
      goalsLoading,
      goalsError,
      retryGoals,
      registerGoalsSubscriber,
    ]
  );

  return (
    <ExpenseReferenceDataContext.Provider value={value}>
      {children}
    </ExpenseReferenceDataContext.Provider>
  );
}

export function useExpenseReferenceData(): ExpenseReferenceData {
  const context = useContext(ExpenseReferenceDataContext);
  if (context === undefined) {
    throw new Error(
      "useExpenseReferenceData must be used within an ExpenseReferenceDataProvider"
    );
  }
  return context;
}
