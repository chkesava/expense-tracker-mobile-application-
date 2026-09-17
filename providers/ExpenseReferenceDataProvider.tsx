/**
 * One Firestore listener per reference collection for the Expense app shell.
 * Screens read this context instead of attaching their own onSnapshot watches.
 */

import {
  collection,
  doc,
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

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler, type LoadFailure } from "@/lib/firestoreErrors";
import {
  forgetSnapshotPath,
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
  goals: FinancialGoal[];
  goalsLoading: boolean;
  goalsError: LoadFailure | null;
  retryGoals: () => void;
};

const ExpenseReferenceDataContext = createContext<ExpenseReferenceData | undefined>(
  undefined
);

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
    const unsub = onSnapshot(
      query(collection(db, "users", uid, "categories")),
      (snap) => {
        logQuerySnapshot(path, snap);
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
    return () => {
      forgetSnapshotPath(path);
      unsub();
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
    const unsub = onSnapshot(
      query(collection(db, "users", uid, "subscriptions"), orderBy("name", "asc")),
      (snap) => {
        logQuerySnapshot(path, snap);
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

  useEffect(() => {
    if (!uid || !db) {
      setSpaces([]);
      setSpacesLoading(false);
      return;
    }
    setSpacesLoading(true);
    const path = `users/${uid}/spaces`;
    const unsub = onSnapshot(
      query(collection(db, "users", uid, "spaces"), orderBy("name")),
      (snap) => {
        logQuerySnapshot(path, snap);
        setSpaces(
          snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<Space, "id">),
          }))
        );
        setSpacesError(null);
        setSpacesLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.spaces",
        (failure) => {
          setSpacesError(failure);
          setSpacesLoading(false);
        },
        "Couldn't load your spaces."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsub();
    };
  }, [uid, db, spacesAttempt, setSpacesError]);

  useEffect(() => {
    if (!uid || !db) {
      setRules([]);
      setRulesLoading(false);
      return;
    }
    setRulesLoading(true);
    const path = `users/${uid}/categorizationRules`;
    const unsub = onSnapshot(
      query(
        collection(db, "users", uid, "categorizationRules"),
        orderBy("createdAt", "asc")
      ),
      (snap) => {
        logQuerySnapshot(path, snap);
        setRules(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as CategorizationRule))
        );
        setRulesError(null);
        setRulesLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.categorizationRules",
        (failure) => {
          setRulesError(failure);
          setRulesLoading(false);
        },
        "Couldn't load your categorization rules."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsub();
    };
  }, [uid, db, rulesAttempt, setRulesError]);

  useEffect(() => {
    if (!uid || !db) {
      setBudgets([]);
      setBudgetsLoading(false);
      return;
    }
    setBudgetsLoading(true);
    const path = `users/${uid}/categoryBudgets`;
    const unsub = onSnapshot(
      query(
        collection(db, "users", uid, "categoryBudgets"),
        orderBy("month", "desc")
      ),
      (snap) => {
        logQuerySnapshot(path, snap);
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
  }, [uid, db, budgetsAttempt, setBudgetsError]);

  useEffect(() => {
    if (!uid || !db) {
      setGoals([]);
      setGoalsLoading(false);
      return;
    }
    setGoalsLoading(true);
    const path = `users/${uid}/financialGoals`;
    const unsub = onSnapshot(
      query(
        collection(db, "users", uid, "financialGoals"),
        orderBy("createdAt", "asc")
      ),
      (snap) => {
        logQuerySnapshot(path, snap);
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
  }, [uid, db, goalsAttempt, setGoalsError]);

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
      goals,
      goalsLoading,
      goalsError,
      retryGoals,
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
      goals,
      goalsLoading,
      goalsError,
      retryGoals,
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
