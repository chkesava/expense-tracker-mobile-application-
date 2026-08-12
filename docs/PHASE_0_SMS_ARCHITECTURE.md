# Phase 0 — SMS Architecture & Safety

> **Date:** 2026-08-10  
> **Scope:** Architecture only. No native SMS reading, permissions UI, or expense write changes.  
> **Constraint:** Do not modify existing expense creation logic unnecessarily.

---

## 1. Project classification

| Question | Answer |
|----------|--------|
| Expo mode | **CNG / prebuild** (Expo SDK 57) — not classic managed Expo Go–only, not bare-checked-in native |
| Evidence | `android/` / `ios/` gitignored; `app.json` plugins; scripts call `expo prebuild`; `"android": "expo run:android"` |
| Implication for SMS | Native SMS APIs require an **Expo config plugin** (or custom native module registered after prebuild). Do **not** hand-edit a committed `android/` tree. |

---

## 2. Android identity

| Field | Value |
|-------|-------|
| Package name | `com.example.expensetracker` |
| Source | `app.json` → `expo.android.package` (matches `google-services.json`) |
| Firebase project | `expenseapp-27f94` |

---

## 3. Firebase expense structure (canonical)

**Path:** `users/{uid}/expenses`

**Write shape used by `ExpenseForm` (canonical for SMS import):**

```ts
{
  amount: number;
  category: string;
  subcategory: string;      // "" → "Other"
  date: string;             // YYYY-MM-DD
  month: string;            // YYYY-MM via monthFromDateKey
  accountId: string | null;
  note: string;
  tags: string[];
  createdAt: serverTimestamp();
}
```

**Income path** (credit SMS → income): `users/{uid}/incomes` with `{ amount, source, date, month, accountId, note, createdAt }`.

**Related:** `CategorizationRule` at `users/{uid}/categorizationRules` can feed auto-category after parse.

There is **no** dedicated `createExpense` service today — writes are inline in `ExpenseForm`, splits, subscriptions, and onboarding. SMS must feed a **thin adapter** that mirrors the ExpenseForm payload, not rewrite those call sites.

---

## 4. Expense creation surfaces (do not disturb)

| Surface | Path | Role |
|---------|------|------|
| `components/ExpenseForm.tsx` | Primary UI create/update | Leave intact |
| `hooks/useExpenses.ts` | Read via `FinanceDataProvider` | Leave intact |
| `hooks/useSplits.ts` | Optional personal expense on split | Leave intact |
| `hooks/useSubscriptions.ts` | Recurring expense batch | Leave intact |
| `hooks/useVaultExpenses.ts` | Vault txs (different collection) | Out of scope for bank SMS |

**SMS integration point:** new adapter under `services/sms/` → same Firestore payload as ExpenseForm.

---

## 5. Authentication & navigation (safety context)

- **Auth:** Firebase email/password + Google Sign-In. No phone/OTP SMS.
- **Duress:** `user.uid` may be `{realUid}_duress` — SMS import must use the **effective finance uid** from `AuthProvider` (same as ExpenseForm), never invent a separate identity.
- **Nav:** expo-router. Protected shell: `app/(app)/_layout.tsx`. No SMS screens in Phase 0.

---

## 6. Target pipeline

```
Android Native Layer (config plugin / SmsModule)
        ↓
SMS Reader (permission-gated, Android-only)
        ↓
Parser Service (bank/UPI templates → structured draft)
        ↓
Transaction Object (SmsParsedTransaction)
        ↓
Expense Adapter (maps to ExpenseForm-compatible payload)
        ↓
Firebase (users/{uid}/expenses | incomes)
```

Existing natural-language helper `shared/utils/magicParser.ts` is **not** the bank SMS parser. Keep it for Magic Add UI; SMS uses a dedicated bank/UPI parser.

---

## 7. `smsTransactions` / processing layer (defined)

### Module map

| Module | Responsibility |
|--------|----------------|
| `shared/types/smsTransaction.ts` | Contracts: raw SMS, parse result, processing status, dedupe key |
| `services/sms/smsReader.ts` | Platform boundary: list/watch SMS (stub → native later) |
| `services/sms/smsParser.ts` | Pure-ish parse: body → `SmsParsedTransaction` |
| `services/sms/smsDedupe.ts` | Fingerprint + local seen-set |
| `services/sms/expenseAdapter.ts` | Map parse → Expense/Income payload (same shape as ExpenseForm) |
| `services/sms/smsPipeline.ts` | Orchestrate: read → parse → dedupe → adapt → (later) write |

### Status machine

`received → parsed → skipped | pending_review → committed | failed`

- `skipped`: non-transaction SMS, low confidence, duplicate
- `pending_review`: optional Phase 1+ UX gate (not required in Phase 0)
- `committed`: Firebase expense/income id stored locally for audit

---

## 8. Local vs Firebase data

### Stay **local** (device / AsyncStorage / SecureStore)

| Data | Why |
|------|-----|
| Raw SMS body / address / timestamp | Privacy; not needed in cloud |
| Android SMS `_id` / thread id | Platform-specific |
| Permission grant state | Device UX |
| Sync cursor (`lastProcessedSmsId` / timestamp) | Resume without re-scan |
| Dedupe fingerprints (`smsFingerprint`) | Fast offline dedupe |
| Processing queue + status | Recovery / retries |
| Parse confidence / match template id | Debug; optional UI |

### Go to **Firebase**

| Data | Where |
|------|-------|
| Final expense or income | Existing collections, canonical fields only |
| Optional additive metadata | Prefer **local-only** linkage first. If product later needs cloud dedupe: optional `source: "sms"` + `smsFingerprint` on the expense doc (additive; never rewrite ExpenseForm) |

**Rule:** Do **not** upload raw SMS content to Firestore.

---

## 9. Safety constraints (locked for later phases)

1. **Android-only** feature; iOS stubs return unsupported.
2. Require explicit user opt-in + runtime `READ_SMS` / `RECEIVE_SMS` (or equivalent) before any read.
3. Never run SMS pipeline under duress session without an explicit product decision (default: **disable** SMS import in duress).
4. Respect `settings.lockPastMonths` before commit (same as ExpenseForm).
5. Deduplicate before any Firestore write.
6. Config plugins / native modules only via Expo CNG — regenerate with prebuild; do not commit `android/` edits as source of truth.
7. Reuse categorization rules when mapping merchant → category; fall back to `"Other"`.

---

## 10. Phase 0 deliverables

- This document
- Types: `shared/types/smsTransaction.ts`
- Stubs: `services/sms/*` (no native calls, no Firestore writes yet)
- Barrel export from `shared/index.ts`

**Out of scope:** native module, permissions UI, background receiver, Firestore writes, ExpenseForm changes.
