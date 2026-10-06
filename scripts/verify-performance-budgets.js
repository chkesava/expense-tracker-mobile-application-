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
      'SmsReceiverProvider',
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

module.exports = { verifyStartupGuardrails };
