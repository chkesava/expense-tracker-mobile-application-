> **Approved plan for epic SPENDLY-186** (approved 2026-10-03). It's copied from the agent's private plan file so every agent (Claude Code, Codex) works from the same plan.
> The live per-story status is in [SPENDLY-186-merchant-intelligence.md](SPENDLY-186-merchant-intelligence.md), and the shared rules are in [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md).
> Under **Git setup**, the epic branch already exists, so don't re-create it.

# Plan: Epic SPENDLY-186 Merchant Intelligence, story by story

## Context
[SPENDLY-186](https://kesavach.atlassian.net/browse/SPENDLY-186) is next in the roadmap after Goal Funding.

**Goal:** turn noisy Indian transaction text into stable, recognisable merchants with honest confidence. The text includes:
- UPI and VPA strings, and UPI QR;
- card descriptors;
- gateways (Razorpay, PayU, Paytm);
- NEFT and IMPS references;
- city and store suffixes;
- legal names.

**Built on top of that:**
- merchant-aware category suggestions;
- corrections that are remembered;
- a merchant profile, grouping and search;
- merchant spending patterns.

**Constraints:**
- **Never change the source transaction.** Amount, date, account, direction and category stay as they are.
- **No external AI or enrichment providers.**
- **Performance first.**

**Jira children (all To Do):**
- 187 (model) blocks 188 and 189;
- 188 (normalization and registry) blocks 189;
- 189 (resolution and confidence) blocks 190, 191 and 192;
- 190 (categories) and 192 (profile, grouping and search) block 193 (patterns);
- 191 (corrections), 192 and 193 block 194 (QA).

Nothing outside the epic blocks it.

**What already exists (reuse, don't duplicate):**
- **A small SMS-only merchant layer that is never saved:**
  - `services/sms/smsFieldExtractor.ts` (`extractMerchant`, `cleanMerchantToken`);
  - `smsMerchantNormalizer.ts` (`foldMerchantKey`, `stripKnownSuffixes`, `normalizeMerchantName`, alias exact or prefix);
  - `smsMerchantCatalog.ts` (about 36 entries);
  - `smsCategorizer.ts`;
  - `SMS_MERCHANT_CATEGORY_RULES`.
- **Where the merchant text actually lives:**
  - `Expense` and `Income` have **no merchant field**. The merchant is the first `·` segment of `note` (SMS `buildNote`), the raw narration for statement imports, or free text for manual entries.
  - The raw SMS body is stored on the device only.
- **Category data:**
  - `CATEGORY_SUGGESTIONS` and `suggestCategoryFromNote` in `shared/data/categoryTaxonomy.ts`;
  - user `categorizationRules` (keyword → category), held in the catch-all rule.
  - There's no learning from user edits.
- **Merchant grouping today:**
  - recurring detection (`smsRecurringDetector.ts`) groups by `recurringMerchantKey`;
  - `getTopVendors` (`rangeAnalytics.ts`) groups by exact note text.
- **Search:** `accountActivitySearch.ts` (`buildAccountActivitySearchText`, precomputed `searchText` in `journalActivities.ts`) and filters in `accountActivityFilters.ts`, where a `counterparties` facet sets the pattern to follow.
- **Detail screen:** `app/(app)/transactions/[id].tsx` has a details card with a Counterparty row, which is where a Merchant row would go.
- **Fingerprints:** SMS dedupe keys and statement-import fingerprints include merchant strings, so the **SMS normalizer must not change** in this epic.

**Decisions (2026-10-03):**
- **Base branch:** **origin/main**. This is an independent epic and PR, outside the #212→#213→#214 stack.
- **Storage:** **derive merchants on the fly; store only corrections.** Merchants are resolved deterministically from the transaction text, in memory and cached, and expense and income documents are **never written**. User corrections and aliases go in a new validated `users/{uid}/merchantOverrides` collection.

## Workflow (your standing rules)
1. Each story: move to In Progress → cut `feature/SPENDLY-1xx-<slug>` from the epic branch → implement, test, commit.
2. **Ask before merging** each story, and **before starting the next**.
3. Stories go to Done only on `main`.
4. Each story gets a doc at `docs/SPENDLY-1xx-*.md`, plus the tracker `docs/SPENDLY-186-merchant-intelligence.md`.

**Git setup:**
```
git fetch origin main
git checkout -b feature/SPENDLY-186-merchant-intelligence origin/main --no-track
```

## Architecture
- **187, model (`shared/types/merchant.ts`):**
  - `Merchant { id (slug), displayName, legalName?, aliases[], category?, subcategory?, rails?, logoKey? }`. Logos are bundled keys only; nothing is fetched.
  - `MerchantResolution { merchantId | null, displayName, confidence: high | medium | low | unknown, method: user_override | alias_exact | rule | context | unresolved, rail: upi | upi_qr | card | gateway | neft | imps | rtgs | atm | other, raw, normalized, provenance }`.
  - `MerchantOverride { id, kind: transaction | alias, refKey, merchantId | customName, category?, subcategory?, rejected?, createdAtMs, updatedAtMs }`.
  - The registry and resolver carry a version.
- **188, normalization and registry:**
  - `shared/utils/merchantNormalize.ts` (pure):
    - keeps the raw text;
    - detects the rail;
    - strips UPI/DR/CR prefixes and reference numbers, VPA handles (any `@handle`), QR ids, gateway prefixes (`RAZORPAY*`, `PAYU*`, `PYU*`, `CCAVENUE`, `PAYTM`, `BILLDESK`…), NEFT/IMPS/RTGS references, city and store suffixes, and legal suffixes (`PVT LTD`…);
    - folds case, punctuation and spacing;
    - returns `{ raw, rail, normalized, tokens }`.
  - `shared/data/merchantRegistry.ts`: a versioned canonical registry seeded from `SMS_MERCHANT_CATALOG` and `SMS_MERCHANT_CATEGORY_RULES`, extended with common Indian merchants and their aliases and categories. The SMS modules are **read, not changed**, so fingerprints stay stable.
  - This reuses `foldMerchantKey` / `stripKnownSuffixes` ideas through shared helpers. The SMS files are left as they are.
- **189, resolution (`shared/utils/merchantResolve.ts`)**, a pure, layered and auditable resolver:
  1. the user's transaction override;
  2. the user's alias override;
  3. an exact alias match;
  4. a deterministic rule (prefix or token rules, VPA handle → merchant);
  5. context (category hint plus token overlap, giving medium or low).

  Otherwise the merchant is unresolved and shown with a title-cased cleaned name and confidence `unknown`. Results are memoised by `normalized + overridesVersion`, and `resolveAll(transactions)` makes one pass with a cache. A wrong high-confidence match is treated as worse than "unknown".
- **190, categories:**
  - `merchantCategorySuggestion(resolution)` keeps where the suggestion came from.
  - **The category the user chose always wins.** History is never re-categorised.
  - `ExpenseForm` gets a merchant-aware suggestion only while the category hasn't been touched, using the existing `categoryTouched` gate.
- **191, corrections:**
  - A Merchant row on transaction detail opens a sheet with: Confirm, Change merchant (search the registry or type a custom name), "Always use this for '{alias}'", Not this merchant (reject), set category, and Reset.
  - Writes go to `merchantOverrides` through `commitMutations`, under a strict validated rule with emulator and TS↔rules contract tests.
  - Precedence is documented: transaction override, then alias override, then registry.
- **192, profile, grouping and search:**
  - A `/merchants/[id]` profile shows the name, category, confidence note, period spend, transaction count, recent transactions, the trend, and a recurring indicator.
  - The merchant name is added to the journal `searchText`, and there's a **merchant filter facet** alongside counterparties.
  - `getTopVendors` gets a merchant-grouped variant. The existing function isn't changed.
- **193, patterns (`shared/utils/merchantInsights.ts`):** frequency, spend over time, concentration, month-over-month change, and recurring or subscription-like behaviour (reusing `classifyRecurringCadence`). It's worded as observations, never accusations, and needs a minimum amount of data.
- **194, QA:**
  - a privacy-safe fixture dataset (UPI, card, gateway, bank narration, known and unknown merchants, look-alikes, city variants, aliases, corrections, false positives);
  - measured coverage, high-confidence rate, false-positive rate, unknown rate, fragmentation and category accuracy, **clearly labelled as fixture results, not production accuracy**;
  - performance on a large ledger;
  - an isolation proof that no expense or income writes happen;
  - a QA report, rollout notes and a device checklist.

## Stories (order)
187 → 188 → 189 → 190 → 191 → 192 → 193 → 194. Each one stops for merge approval.

## Verification (every story)
- `npm test`, `npm run typecheck:shared`, and `timeout 600 npx tsc -p tsconfig.json --noEmit`.
- `npm run test:rules` for 191.
- `git diff --stat` against the epic branch:
  - no Ganesh or Nutrition files;
  - **no changes to SMS fingerprints or dedupe, expense or income write paths, or existing financial calculations**.
- A manual guide in each story doc, for Spendly Test on the emulator. Device QA is collected in 194.
- Rollout: deploy the rules only (for `merchantOverrides`) before the app.
