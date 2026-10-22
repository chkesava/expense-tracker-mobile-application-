# Claude Code handoff prompt

Read `design/references/DESIGN.md` and `design/references/README.md` first. Then inspect the actual reference images relevant to the Jira story I provide.

Implement the requested story end-to-end in the existing Spendly Expo/React Native application. Preserve the current architecture, Firebase services, canonical financial calculation rules, and navigation patterns. Reuse existing UI, chart, icon, and animation dependencies; do not introduce a competing UI kit.

Use the images for layout and interaction guidance only. Do not copy illustrative amounts, merchant names, dates, chart values, or payment history into production. Use actual application data. Keep screens consistent with the shared design tokens and current theme mode.

Avoid unnecessary Firestore reads, full-ledger scans on dashboard first paint, duplicate listeners, duplicate category/transaction flows, and parallel sources of truth. Preserve period/filter/scroll context across drill-downs. Implement loading, empty, offline, error, and insufficient-data states.

Before coding, report which reference images you found and which are missing. After coding, run available lint, type checks, tests, and Android build checks. Capture screenshots and compare to references when supported. Report actual files changed, commands run, results, visual deviations, and remaining limitations. Do not claim a check passed unless it actually ran.
