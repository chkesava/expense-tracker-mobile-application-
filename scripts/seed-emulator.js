#!/usr/bin/env node
/**
 * SPENDLY-175: fills the Firebase Local Emulator Suite with a demo user for
 * "Spendly Test" builds. It NEVER talks to production: it refuses to run
 * unless both emulator hosts point at this machine and the project is a
 * `demo-` project (which cannot exist in Google's cloud).
 *
 *   npm run emulators:local   # in one terminal
 *   npm run emulators:seed    # once; data persists in .emulator-data/
 *
 * Sign in to Spendly Test with DEMO_EMAIL / DEMO_PASSWORD below.
 *
 * Idempotent: it deletes and rebuilds only the demo user. Dates are relative
 * to today, so the Dashboard always shows a current month. Shapes follow what
 * the app reads (FinanceDataProvider, ExpenseReferenceDataProvider,
 * usePortfolio, SettingsProvider) and pass the firestore.rules validators.
 * The app itself seeds the category hierarchy on first sign-in and auto-creates
 * credit card bills from card spend, so neither is written here.
 */

const DEMO_PROJECT_ID = 'demo-spendly';
const DEMO_UID = 'demo-spendly-user';
const DEMO_EMAIL = 'demo@spendly.test';
const DEMO_PASSWORD = 'spendly-demo';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

/** Why seeding must not run, or null. Pure, for tests. */
function seedSafetyBlocker({ firestoreHost, authHost, projectId }) {
  const hostOf = (value) => String(value || '').split(':')[0].trim().toLowerCase();
  if (!firestoreHost || !LOCAL_HOSTS.has(hostOf(firestoreHost))) {
    return 'FIRESTORE_EMULATOR_HOST must point at a local emulator';
  }
  if (!authHost || !LOCAL_HOSTS.has(hostOf(authHost))) {
    return 'FIREBASE_AUTH_EMULATOR_HOST must point at a local emulator';
  }
  if (!String(projectId || '').startsWith('demo-')) {
    return 'the project id must start with "demo-"';
  }
  return null;
}

// ---- Deterministic mock data ------------------------------------------------

/** Small seeded PRNG so every seed produces the same demo data. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/**
 * Recurring spending patterns: [category, subcategory, note, min, max, perMonth, account].
 * `account` is a key into ACCOUNTS. Pairs must exist in CATEGORY_TAXONOMY
 * (checked by lib/localTestMode.test.ts).
 */
const EXPENSE_TEMPLATES = [
  ['Food & Groceries', 'Groceries / Kirana', 'Weekly groceries', 900, 2600, 4, 'bank'],
  ['Food & Groceries', 'Vegetables', 'Vegetables', 150, 450, 6, 'cash'],
  ['Food & Groceries', 'Milk & Dairy', 'Milk', 60, 120, 8, 'cash'],
  ['Food & Groceries', 'Restaurants & Dining', 'Dinner out', 700, 2400, 3, 'card'],
  ['Food & Groceries', 'Food Delivery', 'Swiggy order', 250, 750, 5, 'card'],
  ['Transport & Vehicles', 'Petrol', 'Petrol', 1200, 2500, 2, 'card'],
  ['Transport & Vehicles', 'Cab / Taxi', 'Cab ride', 180, 520, 4, 'bank'],
  ['Transport & Vehicles', 'Metro', 'Metro card top-up', 200, 500, 1, 'bank'],
  ['Home & Household', 'Electricity', 'Electricity bill', 1400, 2600, 1, 'bank'],
  ['Home & Household', 'Household Supplies', 'Household supplies', 300, 1200, 2, 'shopping'],
  ['Bills & Communication', 'Mobile Recharge', 'Mobile recharge', 299, 299, 1, 'bank'],
  ['Shopping & Clothing', 'Online Shopping', 'Amazon order', 499, 3500, 2, 'shopping'],
  ['Shopping & Clothing', 'Clothes', 'Clothes', 900, 3200, 1, 'card'],
  ['Health & Medical', 'Medicines', 'Pharmacy', 180, 900, 1, 'cash'],
  ['Entertainment & Hobbies', 'Movies', 'Movie tickets', 400, 900, 1, 'card'],
  ['Personal Care', 'Haircut', 'Haircut', 250, 450, 1, 'cash'],
];

const ACCOUNT_TYPES = {
  bank: 'Bank Account',
  cash: 'Cash Wallet',
  credit: 'Credit Card',
};

/** [key, name, typeKey, accountTypeId, extra] */
const ACCOUNTS = [
  ['bank', 'HDFC Savings', 'bank', 'bank', { openingBalance: 185000, last4: '4821' }],
  ['cash', 'Cash Wallet', 'cash', 'cash', { openingBalance: 6000, last4: '' }],
  ['card', 'HDFC Regalia Credit Card', 'credit', 'credit_card', { creditLimit: 250000, billGenerationDay: 15, last4: '9034' }],
  ['shopping', 'Amazon Pay ICICI Card', 'credit', 'credit_card', { creditLimit: 120000, billGenerationDay: 5, last4: '7716' }],
];

/** [name, amount, category, subcategory, dayOfMonth, account] */
const SUBSCRIPTIONS = [
  ['Netflix', 649, 'Entertainment & Hobbies', 'OTT', 8, 'card'],
  ['Airtel Broadband', 999, 'Bills & Communication', 'Broadband / WiFi', 3, 'bank'],
  ['Google One', 130, 'Bills & Communication', 'Cloud Storage', 21, 'card'],
];

/** [category, amount] for the current month. */
const BUDGETS = [
  ['Food & Groceries', 18000],
  ['Transport & Vehicles', 7000],
  ['Shopping & Clothing', 8000],
  ['Entertainment & Hobbies', 3000],
];

const HOLDINGS = [
  ['RELIANCE', 'RELIANCE.NS', 'Reliance Industries', 'stock', 12, 2710, 'Energy'],
  ['INFY', 'INFY.NS', 'Infosys', 'stock', 25, 1480, 'IT'],
  ['NIFTYBEES', 'NIFTYBEES.NS', 'Nippon India Nifty 50 BeES', 'etf', 150, 238, 'Index'],
];

/**
 * Builds every document for the demo user, as plain data with JS Dates.
 * `today` is injectable for tests.
 */
function buildDemoData(today = new Date()) {
  const rand = mulberry32(175);
  const between = (min, max) => Math.round(min + rand() * (max - min));
  const start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  const baselineDate = new Date(start.getTime() - 24 * 3600 * 1000);

  const accountTypes = Object.entries(ACCOUNT_TYPES).map(([key, name]) => ({
    id: `type-${key}`,
    data: { name, createdAt: baselineDate },
  }));

  const accounts = ACCOUNTS.map(([key, name, typeKey, accountTypeId, extra]) => ({
    id: `acct-${key}`,
    key,
    data: {
      name,
      displayName: name,
      typeId: `type-${typeKey}`,
      accountTypeId,
      last4: extra.last4,
      accountNumber: extra.last4,
      smsMatchingEnabled: false,
      institutionId: null,
      institutionName: null,
      institutionType: null,
      currency: 'INR',
      balanceInitialized: true,
      balanceAsOfDate: ymd(baselineDate),
      ...(extra.openingBalance !== undefined ? { openingBalance: extra.openingBalance } : { openingBalance: 0 }),
      ...(extra.creditLimit !== undefined
        ? { creditLimit: extra.creditLimit, billGenerationDay: extra.billGenerationDay }
        : {}),
      createdAt: baselineDate,
    },
  }));
  const accountId = (key) => `acct-${key}`;

  const expenses = [];
  const incomes = [];
  for (let m = 0; m < 3; m++) {
    const monthStart = new Date(start.getFullYear(), start.getMonth() + m, 1);
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    const lastDay = m === 2 ? today.getDate() : daysInMonth;

    incomes.push({
      id: `inc-${ym(monthStart)}-salary`,
      data: {
        amount: 98000,
        source: 'Salary',
        date: ymd(monthStart),
        month: ym(monthStart),
        accountId: accountId('bank'),
        note: 'Monthly salary',
        createdAt: new Date(monthStart.getTime() + 10 * 3600 * 1000),
      },
    });

    for (const [category, subcategory, note, min, max, perMonth, account] of EXPENSE_TEMPLATES) {
      for (let i = 0; i < perMonth; i++) {
        const day = 1 + Math.floor(rand() * lastDay);
        const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day, 8 + Math.floor(rand() * 13), Math.floor(rand() * 60));
        if (date > today) continue;
        expenses.push({
          id: `exp-${expenses.length + 1}`,
          data: {
            amount: between(min, max),
            category,
            subcategory,
            date: ymd(date),
            month: ym(date),
            time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
            accountId: accountId(account),
            note,
            tags: [],
            createdAt: date,
          },
        });
      }
    }
  }
  incomes.push({
    id: 'inc-freelance',
    data: {
      amount: 15000,
      source: 'Freelance',
      date: ymd(new Date(start.getFullYear(), start.getMonth() + 1, 18)),
      month: ym(new Date(start.getFullYear(), start.getMonth() + 1, 18)),
      accountId: accountId('bank'),
      note: 'Design project',
      createdAt: new Date(start.getFullYear(), start.getMonth() + 1, 18, 16),
    },
  });

  const currentMonth = ym(today);
  const categoryBudgets = BUDGETS.map(([category, amount], i) => ({
    id: `budget-${i + 1}`,
    data: { category, amount, month: currentMonth, createdAt: baselineDate },
  }));

  // lastProcessed = this month, so the app does not auto-post them on load.
  const subscriptions = SUBSCRIPTIONS.map(([name, amount, category, subcategory, dayOfMonth, account], i) => ({
    id: `sub-${i + 1}`,
    data: {
      name,
      amount,
      category,
      subcategory,
      dayOfMonth,
      frequency: 'monthly',
      isActive: true,
      isCompleted: false,
      lastProcessed: currentMonth,
      type: 'subscription',
      source: 'manual',
      accountId: accountId(account),
      createdAt: baselineDate,
    },
  }));

  const financialGoals = [
    ['goal-1', 'Emergency fund', 300000, 145000, 12],
    ['goal-2', 'Goa trip', 60000, 22000, 5],
  ].map(([id, name, targetAmount, currentAmount, monthsAhead]) => ({
    id,
    data: {
      name,
      targetAmount,
      currentAmount,
      deadline: ymd(new Date(today.getFullYear(), today.getMonth() + monthsAhead, 1)),
      createdAt: baselineDate,
    },
  }));

  const holdings = HOLDINGS.map(([symbol, yahooSymbol, name, instrumentType, quantity, averageBuyPrice, sector]) => ({
    id: `hold-${symbol.toLowerCase()}`,
    data: {
      symbol,
      yahooSymbol,
      name,
      exchange: 'NSE',
      instrumentType,
      quantity,
      averageBuyPrice,
      broker: 'Zerodha',
      datePurchased: ymd(new Date(today.getFullYear() - 1, 5, 10)),
      sector,
      createdAt: baselineDate,
      updatedAt: baselineDate,
    },
  }));

  const portfolioSettings = {
    initialInvestmentAmount: 100000,
    cashBalance: 100000,
    cashBaseline: {
      amount: 100000,
      capturedAt: baselineDate.toISOString(),
      capturedAtMs: baselineDate.getTime(),
      reason: 'Opening balance',
    },
    hasExistingHoldings: true,
    onboardingComplete: true,
    createdAt: baselineDate,
    updatedAt: baselineDate,
  };

  // Settings live on the root doc. The onboarding flags stop the Welcome modal
  // and checklist, so the app opens straight onto the Dashboard.
  const userDoc = {
    email: DEMO_EMAIL,
    displayName: 'Demo User',
    username: 'demo',
    role: 'USER',
    currency: 'INR',
    monthlyBudget: 55000,
    timezone: 'Asia/Kolkata',
    dateFormat: 'DD MMM YYYY',
    numberFormat: 'lakhs',
    firstDayOfWeek: 'monday',
    language: 'en',
    navigationStyle: 'bottom',
    defaultView: 'dashboard',
    enableInvestments: true,
    lockPastMonths: false,
    hapticFeedback: true,
    theme: 'dark',
    themeMode: 'dark',
    accentColor: 'indigo',
    onboarding: {
      welcomeCompleted: true,
      onboardingDismissed: true,
      currencyChosen: true,
      setupStartedAt: '',
      completedSteps: ['milestone_25', 'milestone_50', 'milestone_75', 'milestone_100'],
      visitedScreens: ['dashboard', 'insights'],
    },
  };

  return {
    userDoc,
    collections: {
      accountTypes,
      accounts,
      expenses,
      incomes,
      categoryBudgets,
      subscriptions,
      financialGoals,
      holdings,
    },
    portfolioSettings,
  };
}

// ---- Emulator writes ----------------------------------------------------------

async function seed() {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
  const projectId = process.env.GCLOUD_PROJECT || DEMO_PROJECT_ID;

  const blocker = seedSafetyBlocker({
    firestoreHost: process.env.FIRESTORE_EMULATOR_HOST,
    authHost: process.env.FIREBASE_AUTH_EMULATOR_HOST,
    projectId,
  });
  if (blocker) {
    console.error(`Refusing to seed: ${blocker}. This script only ever writes to a local demo emulator.`);
    process.exit(1);
  }

  // Required lazily, after the emulator env is in place.
  const { initializeApp } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');
  const { getFirestore, Timestamp } = require('firebase-admin/firestore');

  const app = initializeApp({ projectId }, 'spendly-seed');
  const auth = getAuth(app);
  const db = getFirestore(app);

  // Auth user (recreated so the password is always the documented one).
  try {
    await auth.deleteUser(DEMO_UID);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }
  await auth.createUser({ uid: DEMO_UID, email: DEMO_EMAIL, password: DEMO_PASSWORD, displayName: 'Demo User' });

  const userRef = db.collection('users').doc(DEMO_UID);
  await db.recursiveDelete(userRef);

  const toFirestore = (value) => {
    if (value instanceof Date) return Timestamp.fromDate(value);
    if (Array.isArray(value)) return value.map(toFirestore);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toFirestore(v)]));
    }
    return value;
  };

  const data = buildDemoData();
  const writer = db.bulkWriter();
  writer.set(userRef, toFirestore(data.userDoc));
  for (const [collection, docs] of Object.entries(data.collections)) {
    for (const { id, data: docData } of docs) {
      writer.set(userRef.collection(collection).doc(id), toFirestore(docData));
    }
  }
  writer.set(userRef.collection('portfolioSettings').doc('config'), toFirestore(data.portfolioSettings));
  await writer.close();

  const counts = Object.entries(data.collections).map(([name, docs]) => `${name}: ${docs.length}`);
  console.log(`Seeded ${projectId} on ${process.env.FIRESTORE_EMULATOR_HOST}`);
  console.log(`  ${counts.join(', ')}`);
  console.log(`Sign in to Spendly Test as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

if (require.main === module) {
  seed().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_PROJECT_ID,
  EXPENSE_TEMPLATES,
  SUBSCRIPTIONS,
  BUDGETS,
  seedSafetyBlocker,
  buildDemoData,
};
