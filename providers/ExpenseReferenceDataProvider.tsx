/**
 * One Firestore listener per reference collection for the Expense app shell.
 * Screens read this context instead of attaching their own onSnapshot watches.
 */

import {
  collection,
  doc,
  getDocs,
  getDocsFromCache,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "@/lib/firestore";
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
import { notifyReadModelSnapshot } from "@/lib/readModelPush";
import { commitWrite } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
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
import { readCategoriesLoadRecord, writeCategoriesLoadRecord } from "@/lib/categoryRevision";
import { categoriesRevisionOf, loadCategoriesByRevision } from "@/shared/utils/categoryRevision";
import {
  canAutoPostSubscriptions,
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
  /** SPENDLY-613: goals with a write not yet acknowledged by the server. */
  pendingGoalIds: ReadonlySet<string>;
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
  const [pendingGoalIds, setPendingGoalIds] = useState<ReadonlySet<string>>(() => new Set());

  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(true);
  // SPENDLY-525: true until a subscriptions snapshot is confirmed by the
  // server. Due-posting never runs on cache-only data.
  const [subscriptionsFromCache, setSubscriptionsFromCache] = useState(true);
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

  // SPENDLY-660: categories are a near-static catalogue (~190 docs per user),
  // so instead of a live listener (re-billed in full after every 30-minute
  // gap) this listens to `meta/categories` (1 doc) and loads the catalogue
  // when its revision changes: from the Firestore cache when this device
  // already loaded that revision from the server, else from the server.
  // Writers bump the revision (lib/categoryRevision.ts).
  useEffect(() => {
    if (!uid || !db) {
      setCategories([]);
      setCategoriesLoading(false);
      return;
    }
    setCategoriesLoading(true);
    const path = `users/${uid}/categories`;
    const metaPath = `users/${uid}/meta/categories`;
    const categoriesQuery = query(collection(db, "users", uid, "categories"), limit(500));
    // A retry (categoriesAttempt > 0) skips the cache once.
    let force = categoriesAttempt > 0;
    let cancelled = false;
    let loadedRevision: number | null = null;
    let loadSeq = 0;
    let unsub: (() => void) | null = null;
    const toCategories = (snap: { docs: { id: string; data(): unknown }[] }) =>
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as Category));
    const fail = (failure: LoadFailure) => {
      if (cancelled) return;
      setCategoriesError(failure);
      setCategoriesLoading(false);
    };

    const apply = (seq: number, revision: number, loaded: Category[], fromCache: boolean) => {
      if (cancelled || seq !== loadSeq) return;
      perfEvent("firestore_first_snapshot", { collection: "categories", docCount: loaded.length, fromCache });
      loadedRevision = revision;
      setCategories(loaded);
      setCategoriesError(null);
      setCategoriesLoading(false);
    };

    // This device's own edit: the cache already holds it, and the list was
    // current before it, so re-read the cache (no billed reads). The saved
    // server record stays at the old revision, so the next launch confirms
    // with the server once. Another device's concurrent edit arrives as a
    // later server snapshot with a different revision and reloads normally.
    const loadOwnWrite = (revision: number) => {
      const seq = ++loadSeq;
      getDocsFromCache(categoriesQuery)
        .then((snap) => apply(seq, revision, toCategories(snap), true))
        .catch(() => {
          if (!cancelled && seq === loadSeq) load(revision);
        });
    };

    const load = (revision: number) => {
      const seq = ++loadSeq;
      const forceThis = force;
      force = false;
      loadCategoriesByRevision<Category>({
        revision,
        force: forceThis,
        nowMs: Date.now(),
        readRecord: () => readCategoriesLoadRecord(uid),
        writeRecord: (record) => writeCategoriesLoadRecord(uid, record),
        fromCache: async () => {
          const snap = await getDocsFromCache(categoriesQuery);
          return { docs: toCategories(snap), fromCache: true };
        },
        fromServer: async () => {
          const snap = await getDocs(categoriesQuery);
          logDirectRead(path, snap.docs.length, snap.metadata.fromCache ? "cache" : "server", {
            feature: "reference",
            queryShape: "categories",
          });
          return { docs: toCategories(snap), fromCache: snap.metadata.fromCache };
        },
      })
        .then(({ categories: loaded, source }) => apply(seq, revision, loaded, source === "cache"))
        .catch(snapshotErrorHandler("snapshot.categories", fail, "Couldn't load your categories."));
    };

    const cancelIdle = scheduleIdleWork(() => {
      perfEvent("firestore_listener_start", { collection: "categories" });
      unsub = onSnapshot(
        doc(db, "users", uid, "meta", "categories"),
        (snap) => {
          logQuerySnapshot(metaPath, snap, { feature: "reference", queryShape: "categories revision" });
          const revision = categoriesRevisionOf(snap.data());
          if (revision === loadedRevision) return;
          if (snap.metadata.hasPendingWrites && loadedRevision !== null) loadOwnWrite(revision);
          else load(revision);
        },
        snapshotErrorHandler("snapshot.categoriesRevision", fail, "Couldn't load your categories.")
      );
    });
    return () => {
      cancelled = true;
      cancelIdle();
      forgetSnapshotPath(metaPath);
      if (unsub) unsub();
    };
  }, [uid, db, categoriesAttempt, setCategoriesError]);

  useEffect(() => {
    if (!uid || !db) {
      setSubscriptions([]);
      setSubscriptionsLoading(false);
      return;
    }
    setSubscriptionsLoading(true);
    setSubscriptionsFromCache(true);
    const path = `users/${uid}/subscriptions`;
    perfEvent("firestore_listener_start", { collection: "subscriptions" });
    let seenFirst = false;
    const unsub = onSnapshot(
      // SPENDLY-412: defensive bound (observed <25 docs) — stays realtime,
      // subscriptions drive the due-subscription auto-posting side effect below.
      query(
        collection(db, "users", uid, "subscriptions"),
        orderBy("name", "asc"),
        limit(200)
      ),
      // SPENDLY-525: metadata changes too, so the cache → server transition
      // is seen even when the data didn't change. Auto-posting waits for it.
      // Metadata-only events cost no reads.
      { includeMetadataChanges: true },
      (snap) => {
        setSubscriptionsFromCache(snap.metadata.fromCache);
        if (seenFirst && snap.docChanges().length === 0) return;
        seenFirst = true;
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
    let seenFirst = false;
    const unsub = onSnapshot(
      query(
        collection(db, "users", uid, "financialGoals"),
        orderBy("createdAt", "asc")
      ),
      // SPENDLY-613: metadata changes too, so a goal's "waiting to sync"
      // state clears when the server acknowledges the write.
      { includeMetadataChanges: true },
      (snap) => {
        const pending = snap.docs.filter((d) => d.metadata.hasPendingWrites).map((d) => d.id);
        setPendingGoalIds((prev) =>
          prev.size === pending.length && pending.every((id) => prev.has(id)) ? prev : new Set(pending)
        );
        // Metadata-only events (pending → synced, cache → server) change no
        // goal and cost no reads: don't rebuild goals or count them as reads.
        if (seenFirst && snap.docChanges().length === 0) return;
        seenFirst = true;
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
    if (
      !canAutoPostSubscriptions({
        loading: subscriptionsLoading,
        fromCache: subscriptionsFromCache,
        count: subscriptions.length,
      })
    ) {
      return;
    }
    return scheduleIdleWork(() => {
      void processDueSubscriptions();
    }, { timeoutMs: 3000, fallbackDelayMs: 1500 });
  }, [
    subscriptionsLoading,
    subscriptionsFromCache,
    subscriptions.length,
    processDueSubscriptions,
  ]);

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
      pendingGoalIds,
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
      pendingGoalIds,
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
