# SPENDLY-187: Canonical merchant identity, alias and intelligence data model

**Ticket:** [SPENDLY-187](https://kesavach.atlassian.net/browse/SPENDLY-187) (Story)
**Epic:** [SPENDLY-186](https://kesavach.atlassian.net/browse/SPENDLY-186). See the [epic record](SPENDLY-186-merchant-intelligence.md).
**Branch:** `feature/SPENDLY-187-merchant-model`, cut from the epic branch.
**Scope:** contract only. No UI, no Firestore and no rules change.

---

## 1. Principles
- **Derived, not stored.** Merchants are resolved on the fly from a transaction's text and are **never written onto expense or income documents**. The source transaction (amount, date, account, direction, category, note) is never changed. This was decided on 2026-10-03.
- **Only corrections are stored:** the user's `MerchantOverride`s, in 191.
- **Raw text is kept as-is.** Every resolution carries `raw` (the original text, untouched) next to `normalized` (the matching key).
- **No network.** The registry is bundled, and logos are bundled icon keys, never remote URLs. Nothing is sent to an external service.

## 2. Contract (`shared/types/merchant.ts`)
| Type | Holds |
|---|---|
| `Merchant` | Canonical registry entry: `id` (slug), `displayName`, `legalName?`, `aliases[]` (folded keys), `category?`/`subcategory?` (taxonomy names, a suggestion only), `rails?`, `logoKey?` |
| `MerchantResolution` | `merchantId` (registry id, `custom:` id, or null), `displayName`, `confidence`, `method`, `rail`, `raw`, `normalized`, `matchedBy?` (why), `suggestedCategory?`/`suggestedSubcategory?`, `version` |
| `MerchantOverride` | A user correction. `kind`: `transaction` (one transaction, `refKey` = `expense:{id}`) or `alias` (all transactions with that normalized text). Holds `merchantId` **or** `customName`, or `rejected`; optional category and subcategory; timestamps |
| `MerchantSourceText` | What the resolver reads from a transaction: `refKey`, `text`, `kind`, `category?` |

**Rails:** `upi`, `upi_qr`, `card`, `gateway`, `neft`, `imps`, `rtgs`, `atm`, `other`.

**Confidence:**

| Level | Meaning | How it's shown |
|---|---|---|
| **high** | Confirmed by the user, or an exact alias | The merchant name |
| **medium** | A deterministic rule, such as a VPA handle or a prefix | The merchant name |
| **low** | A contextual guess | "might be …" |
| **unknown** | Not recognised | The cleaned text as-is |

A low-confidence match is never shown as fact.

**Methods:** `user_override`, `user_alias`, `alias_exact`, `rule`, `context`, `unresolved`. This is the provenance behind "why this merchant?".

**Version:** `MERCHANT_INTELLIGENCE_VERSION = 1` is stamped on every resolution.

## 3. Helpers (`shared/utils/merchantModel.ts`)
- `foldKey`, `merchantSlug`, `customMerchantId`/`isCustomMerchantId`, `transactionRefKey`, and `merchantOverrideId` (Firestore-safe).
- `validateMerchantOverride`:
  - exactly one of merchant or custom name, unless the override is a rejection;
  - a rejection can't also name a merchant;
  - name and category lengths are checked;
  - a subcategory needs a category.
- `expenseSourceText` / `incomeSourceText` read a transaction without changing it.

## 4. Acceptance criteria
| Criterion | Where |
|---|---|
| Canonical id, display name, legal name, aliases | `Merchant` |
| Source and rail information | `MerchantRail`, `MerchantResolution.rail` |
| Category association | `Merchant.category` and the resolution's suggestion, never applied automatically |
| Confidence and state | `MerchantConfidence`, `MerchantMethod` |
| Trusted metadata only | Bundled `logoKey`; no remote metadata |
| User override and alias | `MerchantOverride` (transaction or alias) |
| Version and provenance | `version`, `method`, `matchedBy` |
| Source transaction never altered | Derived model; tested read-only mapping |

**Tests:** `merchantModel.test.ts`, 4 tests.
