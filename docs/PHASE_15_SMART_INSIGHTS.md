# Phase 15 — Smart Insights

> **Date:** 2026-08-12  
> **Scope:** Sentence-style insights from collected expenses (SMS + manual).  
> **Out of scope:** AI Q&A (16), push/FCM, replacing Quick Insights or Daily Pace widgets.

---

## Copy

```
📈 Food spending increased 24% this week.

💰 You spent ₹8,420 this week.

⚠️ You're approaching your monthly budget.
```

- **Week** = last 7 days (including today), compared with the 7 days before that.
- Category line uses the short name (`Food & Dining` → **Food**) and needs a last-week baseline and a ≥10% move.
- Budget warning at **80%** of the monthly target; **exceeded** at 100%+.
- The card hides when there is nothing to say.

---

## Files

- `shared/utils/smartInsights.ts`
- `shared/utils/smartInsights.test.ts`
- `components/dashboard/SmartInsightsWidget.tsx`
- `app/(app)/dashboard.tsx` — shown with Quick Insights

---

## Commands

```bash
npm test -- shared/utils/smartInsights.test.ts
```

No native rebuild required.

---

## Manual Testing Guide

1. Keep the app running (`npx expo start`). No extra install.
2. Open **Dashboard**. If you already have spend this week, **Smart Insights** should appear under Quick Insights.
3. Confirm the week-total line matches the last 7 days of expenses (₹ amount).
4. If a category (e.g. Food) is up or down ≥10% vs the prior 7 days, confirm the 📈 / 📉 sentence.
5. Set a monthly budget in Settings so current-month spend is between 80% and 100%. Confirm **⚠️ You're approaching your monthly budget.**
6. Raise spend above the budget (or lower the budget). Confirm **⚠️ You've exceeded your monthly budget.**
7. On a profile with no expenses this week and spend well under budget, confirm the Smart Insights card is hidden.
