# SPENDLY-793: Low-balance alerts before auto-debits — epic tracker

**Goal:** N days before an auto-debit, check whether the paying account can cover it. The auto-debits covered are:
- a subscription, EMI or recurring transfer from its `accountId`;
- a credit-card autopay from its linked bank account.

If it can't cover it, push once a day until it is topped up, the debit posts, or the due day passes.

**Epic branch:** `feature/SPENDLY-793-low-balance-alerts`. Each story branch is cut from it, in its own worktree under `C:\dev\worktrees\`.

| Story | Scope | State |
|---|---|---|
| SPENDLY-794 | S1 Data model + dual write | Merged into the epic (8a2b9389) |
| SPENDLY-795 | S2 Pure per-account cumulative shortfall engine | Merged into the epic (844722fd) |
| SPENDLY-796 | S3 Server job → `serverResults/autoDebitShortfall` (`autodebit-daily`, daily + save queue) | Merged into the epic (52d1f7fc) |
| SPENDLY-797 | S4 `lowBalance` push source + category, switch `lowBalanceAlerts.enabled`, inbox row, index | Built on its branch; awaiting merge approval |
| SPENDLY-798 | S5 App UI (lead days, card autopay, banners, dashboard) | To Do |
| SPENDLY-799 | S6 Local-notification fallback | To Do |

## Decisions (owner, 2026-11-20)
- **Scope:** recurring items that have an `accountId`, plus card autopay. SMS-sourced, paused and completed items are skipped.
- **Lead days:** a default of 3, with a per-item override from 0 to 15.
- **Shortfall:** cumulative per account. Every debit due up to a date counts against that account.
- **Available balance:** `currentBalance` minus the group-fund money held in that account. An untrusted balance sends no push and shows "needs reconciliation".
- **Push:** once a day until the shortfall is resolved. It uses a new `lowBalance` category, ON by default, on a high-importance channel.
- **Card amount:** the user picks Full or Minimum.
- **Where it shows:** push, the inbox, banners, a dashboard card, and a local fallback.
- **The server computes everything** (epic 735 rule). The app only shows the stored results.
- **S1:** the new fields stay in the `doc` jsonb (R2.2), so no migration is needed.

## Go-live order
1. Rules and indexes.
2. Supabase migration `20261121000000` (the auto-debit run queue).
3. Dry-run the S3 job, then set `AUTODEBIT_DAILY_ENABLED`, then redeploy the Worker.
4. Turn the push on.
5. App release.

Each step needs approval.
