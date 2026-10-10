#!/usr/bin/env node
/**
 * Automated static and architectural guardrail check for Spendly startup performance budgets.
 * Verifies against known startup regressions:
 *  1. Feature-scoped providers are NOT mounted globally without on-demand lifecycle protection.
 *  2. Non-critical Firestore collections remain deferred to idle via scheduleIdleWork.
 *  3. Initial ledger queries enforce limit(300) pagination before idle upgrade.
 *  4. Dashboard widgets maintain React.memo wrapping.
 */

const fs = require('fs');
const path = require('path');
const { ROOT_DIR, failFast } = require('./common');

/**
 * SPENDLY-415: every `onSnapshot(` call's nearest `collection(db, ...)` /
 * `collection(db, ...spread, "name")` argument, by Firestore collection name.
 * A static heuristic (not a parser) — good enough to catch an accidental
 * second listener on the same collection from a different provider file.
 */
function findOnSnapshotCollections(content) {
  const names = new Set();
  const callRe = /onSnapshot\(/g;
  let match;
  while ((match = callRe.exec(content))) {
    const window = content.slice(match.index, match.index + 400);
    const collMatch = window.match(/collection\(\s*db\s*,[^)]*?"([a-zA-Z0-9_]+)"\s*\)/);
    if (collMatch) names.add(collMatch[1]);
  }
  return names;
}

/**
 * SPENDLY-415: flags a Firestore collection name subscribed via `onSnapshot`
 * in more than one `providers/*.tsx` file — each collection in this app is
 * meant to have exactly one shared listener (SPENDLY-408 verified this; this
 * check keeps it true as the codebase grows).
 */
function verifyNoDuplicateListeners() {
  const providersDir = path.join(ROOT_DIR, 'providers');
  if (!fs.existsSync(providersDir)) return [];

  const ownerByCollection = new Map();
  const violations = [];

  for (const file of fs.readdirSync(providersDir)) {
    if (!file.endsWith('.tsx')) continue;
    const filePath = path.join(providersDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    for (const name of findOnSnapshotCollections(content)) {
      const existingFile = ownerByCollection.get(name);
      if (existingFile && existingFile !== file) {
        violations.push({
          rule: 'Duplicate Firestore Listener',
          error: `Collection "${name}" has onSnapshot listeners in both ${existingFile} and ${file}`,
          why: 'Two independent listeners on the same collection double the read cost and can race on writes.',
          fix: `Share one listener for "${name}" through a single provider/context instead of subscribing again in ${file}.`,
        });
      } else {
        ownerByCollection.set(name, file);
      }
    }
  }

  return violations;
}

/**
 * SPENDLY-415: regression guard for the Active-On-Demand gating added by
 * SPENDLY-401/411 — a provider silently losing its `register*Subscriber`
 * gate would revert to an unconditional listener with no other signal.
 */
function verifyOnDemandGatingPresent() {
  const violations = [];
  const expectations = [
    { file: 'providers/CreditCardBillsProvider.tsx', symbol: 'registerSubscriber' },
    { file: 'providers/BorrowingsReceivablesProvider.tsx', symbol: 'registerBorrowingsSubscriber' },
    { file: 'providers/BorrowingsReceivablesProvider.tsx', symbol: 'registerReceivablesSubscriber' },
    { file: 'providers/ExpenseReferenceDataProvider.tsx', symbol: 'registerBudgetsSubscriber' },
    { file: 'providers/ExpenseReferenceDataProvider.tsx', symbol: 'registerGoalsSubscriber' },
  ];

  for (const { file, symbol } of expectations) {
    const filePath = path.join(ROOT_DIR, file);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes(symbol)) {
      violations.push({
        rule: 'Missing On-Demand Listener Gate',
        error: `${symbol} no longer appears in ${file}`,
        why: 'This collection relies on ref-counted on-demand gating (SPENDLY-401/411) instead of an always-on listener; losing the gate silently reverts it to eager.',
        fix: `Restore the ${symbol} ref-counted gate in ${file}, or update this guardrail if the collection was deliberately changed back to eager with a documented reason.`,
      });
    }
  }

  return violations;
}

/**
 * SPENDLY-415: regression guard for the `limit(...)` bounds SPENDLY-412 added
 * to the reference-data queries in `ExpenseReferenceDataProvider.tsx`.
 */
function verifyReferenceQueriesBounded() {
  const violations = [];
  const filePath = path.join(ROOT_DIR, 'providers', 'ExpenseReferenceDataProvider.tsx');
  if (!fs.existsSync(filePath)) return violations;
  const content = fs.readFileSync(filePath, 'utf8');

  const boundedCollections = ['categories', 'subscriptions', 'spaces', 'categorizationRules'];
  for (const col of boundedCollections) {
    if (!isCollectionQueryBounded(content, col)) {
      violations.push({
        rule: 'Un-bounded Reference Query',
        error: `Collection "${col}" query in ExpenseReferenceDataProvider.tsx has no limit(...) nearby`,
        why: 'Reference collections are small and stable by design (SPENDLY-412); losing the bound removes a cheap guardrail against a runaway account.',
        fix: `Add a limit(...) to the "${col}" query in ExpenseReferenceDataProvider.tsx.`,
      });
    }
  }

  return violations;
}

/**
 * SPENDLY-415: true if `collection(db, "users", uid, "<col>")` is followed
 * closely by a `limit(...)` call. Anchored on the actual collection() call
 * site, not just any mention of the name (the perfEvent/logQuerySnapshot
 * attribution tags also carry the bare collection name as a string).
 */
function isCollectionQueryBounded(content, col) {
  const collRe = new RegExp(`collection\\(\\s*db\\s*,\\s*"users"\\s*,\\s*uid\\s*,\\s*"${col}"\\s*\\)`);
  const collMatch = content.match(collRe);
  if (!collMatch) return true; // collection not present at all — not this check's concern
  const window = content.slice(collMatch.index, collMatch.index + 200);
  return /limit\(\d+\)/.test(window);
}

function verifyStartupGuardrails() {
  console.log('⚡ [Verify Performance] Checking startup performance budgets and anti-pattern guardrails...');

  const violations = [];

  // 1. Guardrail: Feature-Scoped Providers must NOT be mounted at root app layout
  const rootLayoutPath = path.join(ROOT_DIR, 'app', '_layout.tsx');
  if (fs.existsSync(rootLayoutPath)) {
    const rootLayoutContent = fs.readFileSync(rootLayoutPath, 'utf8');
    const forbiddenRootProviders = [
      'BorrowingsReceivablesProvider',
      'CreditCardBillsProvider',
    ];
    for (const provider of forbiddenRootProviders) {
      if (rootLayoutContent.includes(`<${provider}>`)) {
        violations.push({
          rule: 'Feature-Scoped Provider at Global Root',
          error: `${provider} is mounted at app/_layout.tsx root`,
          why: 'Mounting feature-scoped providers at global root initializes listeners before auth/dashboard.',
          fix: 'Keep feature-scoped providers scoped inside app/(app)/_layout.tsx with on-demand lifecycle.',
        });
      }
    }
  }

  // 2. Guardrail: Non-critical Firestore collections must remain deferred
  const refDataProviderPath = path.join(ROOT_DIR, 'providers', 'ExpenseReferenceDataProvider.tsx');
  if (fs.existsSync(refDataProviderPath)) {
    const content = fs.readFileSync(refDataProviderPath, 'utf8');
    const deferredCollections = ['categories', 'spaces', 'categorizationRules'];
    for (const col of deferredCollections) {
      // Must be scheduled inside scheduleIdleWork
      const pattern = new RegExp(`scheduleIdleWork[\\s\\S]*?collection\\([\\s\\S]*?["']${col}["']`, 'm');
      if (!pattern.test(content) && !content.includes(`collection: "${col}"`)) {
        violations.push({
          rule: 'Un-deferred Reference Collection',
          error: `Collection "${col}" does not appear deferred via scheduleIdleWork`,
          why: 'Secondary collections must not compete with critical ledger queries during startup.',
          fix: `Wrap the listener for "${col}" inside scheduleIdleWork in ExpenseReferenceDataProvider.tsx.`,
        });
      }
    }
  }

  // 3. Guardrail: FinanceDataProvider must use staged query pagination limit(300)
  const financeDataProviderPath = path.join(ROOT_DIR, 'providers', 'FinanceDataProvider.tsx');
  if (fs.existsSync(financeDataProviderPath)) {
    const content = fs.readFileSync(financeDataProviderPath, 'utf8');
    if (!content.includes('limit(300)') && !content.includes('limit(LEDGER_STAGED_LIMIT)')) {
      violations.push({
        rule: 'Unbounded Initial Query',
        error: 'Initial expenses query does not enforce limit(300) staged paging',
        why: 'Downloading full lifetime ledgers on cold start stalls the JS thread and spikes network payload.',
        fix: 'Ensure initial query uses limit(300) and defers full query to scheduleIdleWork.',
      });
    }
  }

  // 4. Guardrail: Core Dashboard Widgets must remain memoized
  const widgetsToCheck = [
    { file: 'components/dashboard/BudgetAlertsWidget.tsx', name: 'BudgetAlertsWidget' },
    { file: 'components/dashboard/SafeToSpendWidget.tsx', name: 'SafeToSpendWidget' },
    { file: 'components/dashboard/RecentActivityWidget.tsx', name: 'RecentActivityWidget' },
    { file: 'components/dashboard/QuickAddWidget.tsx', name: 'QuickAddWidget' },
    { file: 'components/dashboard/QuickInsightsWidget.tsx', name: 'QuickInsightsWidget' },
    { file: 'components/dashboard/NetWorthWidget.tsx', name: 'NetWorthWidget' },
    { file: 'components/dashboard/GamificationWidget.tsx', name: 'GamificationWidget' },
    { file: 'components/dashboard/TopCategoriesWidget.tsx', name: 'TopCategoriesWidget' },
  ];

  for (const { file, name } of widgetsToCheck) {
    const filePath = path.join(ROOT_DIR, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const isMemoized =
        content.includes(`memo(function ${name}`) ||
        content.includes(`React.memo(function ${name}`) ||
        content.includes(`memo(${name})`) ||
        content.includes(`React.memo(${name})`);
      if (!isMemoized) {
        violations.push({
          rule: 'Unmemoized Dashboard Widget',
          error: `${name} is not wrapped in React.memo`,
          why: 'Unmemoized widgets re-render on every parent update, causing frame drops and JS stalls.',
          fix: `Wrap ${name} in memo(...) in ${file}.`,
        });
      }
    }
  }

  // 5. Guardrail (SPENDLY-415): no two provider files share an onSnapshot
  //    listener on the same collection.
  violations.push(...verifyNoDuplicateListeners());

  // 6. Guardrail (SPENDLY-415): on-demand listener gates (SPENDLY-401/411)
  //    are still present where they were added.
  violations.push(...verifyOnDemandGatingPresent());

  // 7. Guardrail (SPENDLY-415): reference-data queries stay bounded
  //    (SPENDLY-412).
  violations.push(...verifyReferenceQueriesBounded());

  if (violations.length > 0) {
    console.error(`\n❌ Found ${violations.length} startup performance budget violation(s):`);
    for (const v of violations) {
      console.error(`   - [${v.rule}] ${v.error}`);
      console.error(`     Why: ${v.why}`);
      console.error(`     Fix: ${v.fix}\n`);
    }
    failFast({
      step: 'Verify Startup Performance Budgets',
      error: `Detected ${violations.length} performance anti-pattern violation(s).`,
      why: 'Startup budgets protect app_ready and dashboard responsiveness from silent regressions.',
      fix: 'Resolve all listed violations above before proceeding with release build.',
    });
  }

  console.log('   ✅ All startup performance budget guardrails passed.\n');
  return true;
}

if (require.main === module) {
  verifyStartupGuardrails();
}

module.exports = {
  verifyStartupGuardrails,
  verifyNoDuplicateListeners,
  verifyOnDemandGatingPresent,
  verifyReferenceQueriesBounded,
  findOnSnapshotCollections,
  isCollectionQueryBounded,
};
