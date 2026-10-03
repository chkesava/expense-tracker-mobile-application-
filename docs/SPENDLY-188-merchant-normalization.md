# SPENDLY-188: India-first transaction normalization and merchant alias registry

**Ticket:** [SPENDLY-188](https://kesavach.atlassian.net/browse/SPENDLY-188) (Story)
**Epic:** [SPENDLY-186](https://kesavach.atlassian.net/browse/SPENDLY-186). See the [epic record](SPENDLY-186-merchant-intelligence.md).
**Branch:** `feature/SPENDLY-188-merchant-normalization`, cut from the epic branch after 187 was merged.
**Scope:** pure logic and bundled data. No UI, no Firestore, no rules, and no change to `services/sms/*`.

---

## 1. Normalizer: `shared/utils/merchantNormalize.ts`
`normalizeMerchantText(raw)` returns these fields:

| Field | Meaning |
|---|---|
| `raw` | The input, untouched |
| `rail` | `upi`, `upi_qr`, `card`, `gateway`, `neft`, `imps`, `rtgs`, `atm` or `other` |
| `display` | The cleaned name. It's empty when there is no safe name, such as a bare VPA or an ATM withdrawal |
| `normalized` | The folded matching key: lowercase letters and digits, non-Latin scripts kept |
| `tokens` | The words of the cleaned name |
| `gateway` | Set when a known gateway prefix was removed |
| `detail` | The descriptor text after a `*` |
| `vpa` | The VPA handle, plus a non-personal local part. Used for matching only |
| `candidates` | Keys to try when matching, best first |

**Rules, in order:**
1. **Rail detection.**
   - ATM markers are checked first.
   - Then UPI: any `UPI` marker or a VPA. A QR VPA (`paytmqr…`, `bharatpe…`, `q123…@ybl`) or a `QR` marker gives **UPI QR**.
   - Then NEFT, IMPS and RTGS.
   - Then card: `POS`/`ECOM`/`VPS`…, a masked card number, or `CARD`.
   - Then a gateway prefix. Anything else is `other`.
2. **SMS notes** (`Swiggy · UPI · HDFC Bank · A/c 1234`): the first `·` segment is the name, and the whole note is used for the rail.
3. **Rail-delimited narrations** (`UPI/…`, `UPI-…`, `NEFT CR-…`, `BY TRANSFER-UPI/…`): split on `/` or `-`. The name is the first segment that isn't noise. Noise segments are:
   - rail and direction words;
   - bank codes and IFSCs;
   - masked numbers and references (anything with a digit run of 5 or more);
   - VPAs and bank names;
   - stock remarks (`PAYMENT`, `Payment from Ph…`, `NA`).
4. **Name cleanup:**
   - On the card rail only, leading card markers are removed.
   - Domains go: `WWW.SWIGGY.COM` → `SWIGGY`.
   - Gateway prefixes go, but only when followed by a separator. `PYU*SWIGGY` → `SWIGGY` (PayU), while `PAYTM MALL` stays as it is.
   - For `X*Y`, the name is `X` and `Y` is kept as `detail`.
5. **Trailing noise**, never removed down to nothing:
   - store numbers: `#1234`, `123`, `STORE 123`;
   - legal suffixes: `PVT`, `LTD`, `LIMITED`, `LLP`, `INC`, `CORP`, `CO`, and a dangling `&`;
   - on card descriptors only, a country code (`IN`) and **one** trailing city.
6. **Casing.** All-caps descriptors are title-cased. Short or vowel-less words stay as acronyms (MG, KFC), and connecting words are lowercased (of, and). Text the user typed keeps its own casing.

**Deliberately kept:**
- semantic words: `INDIA` (Air India), `FOOD`, `STORE` without a number;
- a city at the end of a non-card name: "Taste of Bombay", "Lunch Chennai".

The SMS normalizer strips some of these words. That's one reason this module is separate.

**Privacy:**
- `display` and `tokens` never contain `@`, a VPA, or a digit run of 5 or more. That covers phone, account, card and reference numbers.
- A VPA local part is kept only as a hidden matching hint, and only when it isn't phone-like and isn't a QR id.

**Version:** `MERCHANT_NORMALIZE_VERSION = 1`.

**Model change:** `foldKey` from 187 now keeps non-Latin letters and vowel signs, so Hindi and Tamil notes get a key. ASCII behaviour is unchanged.

## 2. Registry: `shared/data/merchantRegistry.ts`
- **Seeded from the SMS catalog and its category rules.** These are imported read-only and never edited.
  - The alias `mcd` is excluded, because it collides with Municipal Corporation of Delhi.
  - The placeholder category "Miscellaneous / Uncategorized" (Paytm, PhonePe, Google Pay) becomes no category.
- **Enriched** with legal names and aliases, for example Swiggy → Bundl Technologies, Ola → ANI Technologies, and Zepto → Kiranakart.
- **About 90 common Indian merchants added:** food, groceries, shopping, pharmacy, fuel, travel and airlines, OTT, telecom and broadband, DTH, electricity, gas, insurance and investing, education and software. Every category and subcategory is a real taxonomy name.
- **Matching rules:**
  - Aliases are folded keys of at least 3 characters.
  - Short names such as "Vi" match on their longer aliases (`vodafoneidea`).
  - Booking.com was left out because domain stripping would reduce it to the generic word "booking".
- **`buildMerchantAliasIndex(list)`:** builds an alias → id map and an id → merchant map in one pass, and reports conflicts. It accepts any list, so alias additions are data-only.
- **`registryIssues(list)`:** the review gate, run by the tests. It rejects:
  - duplicate or non-slug ids;
  - alias collisions;
  - unfolded or short aliases;
  - unknown categories, and subcategories that aren't under their category.
- **Version:** `MERCHANT_REGISTRY_VERSION = 1`.

## 3. Acceptance criteria
| Criterion | Evidence |
|---|---|
| Representative Indian fixtures normalize correctly | 26 fixtures: UPI (SBI, HDFC, ICICI shapes, P2P, P2M, QR), card, gateway, NEFT, IMPS, RTGS, ATM, SMS notes, legal suffixes, manual notes |
| Gateway and reference noise removed only when confidently identifiable | The separator is required (`PAYTM MALL` is kept); references need a digit run |
| Casing and punctuation variants converge | Nine Swiggy variants give one key |
| Store and city suffixes covered | `#1234`, `STORE 123`, card-only city, one city at most |
| UPI IDs not exposed | Privacy test across all fixtures; phone VPAs dropped |
| False merges covered by negative cases | Air India, Taste of Bombay, Reliance Digital vs Reliance Retail, HP Gas vs HPCL, Paytm Mall, `mcd` |
| Deterministic | Repeated runs compare equal |
| Raw data unchanged | `raw` is returned as-is; nothing writes to transactions |
| Registry changes reviewable and testable | `registryIssues`, SMS-parity test, display and legal-name self-match test |
| Batch performance | 20,000 narrations in about 0.2 s in tests, against a 2 s budget |

**Tests:** `merchantNormalize.test.ts` (34) and `merchantRegistry.test.ts` (5).

## 4. Not in this story
Resolution, confidence and prefix matching come in 189. Categories come in 190, corrections in 191, and UI in 192.
