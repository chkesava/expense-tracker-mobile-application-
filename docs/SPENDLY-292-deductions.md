# SPENDLY-292: Deductions and tax-saving investment tracker

**Epic:** SPENDLY-288 ([tracker](SPENDLY-288-tax-itr-readiness.md), [plan](SPENDLY-288-plan.md)).

**Branch:** `feature/SPENDLY-292-deductions`, from the epic branch.

## What the user sees

**Tax center → Deductions (`/tax/{fy}/deductions`)**, grouped:
- tax-saving investments and payments;
- pension (NPS);
- health insurance and medical;
- loan interest;
- rent and housing;
- donations;
- interest earned;
- disability;
- other.

Each group shows the total recorded.

- **Each line shows:** what it is, its section (see below), where it came from, proof status (attached / still to get / not needed, or "N proofs"), its state in words and the amount.
- **Line states:**
  - **Counted:** derived, not yet confirmed.
  - **Claimed:** confirmed, or not eligibility-sensitive.
  - **Confirm you're eligible:** an eligibility-sensitive claim not yet confirmed.
  - **Check again:** changed after the user decided.
  - **Not claimed**, or **Replaced**.
- **EPF (your share):** worked out from the user's EPF records. They can claim it, not claim it, replace it with their own entry (e.g. the Form 16 figure), or undo.
- **Add a deduction:** the category, the amount for the year, an optional link to a Spendly investment (linked, not copied), proof status, a note, and attached proofs from Documents. If no proof status is picked, it follows the attachments.
- **Your own claims:** edit, delete (soft), "I'm eligible for this claim" and undo it.
- **Notices:**
  - totals are what's recorded, and limits and regime rules are applied in the estimate;
  - EPF counted twice (with "Replace" as the fix);
  - claims to check;
  - EPF months still expected;
  - offline.
- **States:** empty, loading and error.

## Rules (`shared/features/tax/utils/deductions.ts`)

- **EPF:** the employee share of the year's contributions whose money actually moved (`confirmed`, `credited`, `partial`), bucketed by wage month as the EPF screens do. Archived rows are out. `expected` and `draft` months are left out and counted separately, so the figure never includes money not yet deducted.
  - One derived item per year: `{ kind: "epf_contribution", id: "employee-share" }`.
  - Counted by default, and resolved through the usual review rules.
- **Claims:** `taxEntries` of kind `deduction`. A linked Spendly record goes in `sourceRef`, which the duplicate key includes, so the same investment claimed twice is flagged.
- **Eligibility:** a claim in an eligibility-sensitive category stays `needs_review` (`confirm_eligibility`) until there's a `tax_entry` review that confirms it. The review records the amount, so a later change asks again (`source_changed`).
- **No caps, no regime rules, no suggestions:** the totals are sums of what's recorded. SPENDLY-295 applies versioned, cited rules.
- **Overlaps:** a category counted from both Spendly and an entry is flagged.

**Categories:** `shared/features/tax/data/deductionCategories.ts` has descriptive metadata only. Ids are persisted and append-only.
- **Section labels:** the 1961 Act's labels (80C, 80CCD(1B), 80D, 24(b)…) are shown for FY ≤ 2025-26. For a 2025-Act year the label reads "Section: see your return form", rather than guessing renumbered sections.

## Saving (`services/tax/taxDeductionStore.ts`)

- **EPF decision:** re-reads the year's contributions from Firestore (a bounded range on `month`) and recomputes the share. If it differs from what was shown, nothing is written (R4.3a). Then it writes the review through `commitMutations`.
- **Eligibility:** reloads the claim from Firestore. If it's gone, deleted or the amount changed, nothing is written. Otherwise it writes a `tax_entry` review with that amount.
- **Undo** deletes the review.

**Reads:** while the screen is open only (SPENDLY-406). EPF contributions come through their switch as display-only (`readFrom: "copy"`); investments for linking; the year's entries and reviews.

**Guard:** `lib/readModelLocal/providerSwitch.test.ts` keeps the list of hooks allowed to read EPF from the copy, and that test also checks that none of them takes an EPF writer. `hooks/useTaxDeductions.ts` was added to that list with its reason: it is display-only, and its decisions re-read EPF from Firestore. The guard itself wasn't loosened.

**Reused:** the generic form (`ENTRY_FORMS.deduction`) gained a `sourceRef` field type, with options supplied at runtime and stored as `{ kind, id }`, and a `complete` hook. `TaxLineRow` takes a screen's own status, hint and detail line.

## Demo data (local test only)

The year that ended last gets ELSS (proof still to get), PPF (no proof needed) and health insurance for parents (to confirm eligibility). The demo has no EPF records, so the EPF line doesn't appear there.

## Tests

| File | Covers |
|---|---|
| `deductions.test.ts` | Category ids are storable and unique; 1961 section labels, none guessed for 2025; EPF counts only money deducted, by wage month (expected/missed/archived out); one counted candidate per year; group totals; not-claimed EPF; eligibility asked, confirmed, re-asked on a changed amount; EPF overlap and replace; deleted and other-year claims ignored; the form links without copying, fills proof from attachments, round-trips, refuses a malformed link; the same investment twice gets the same duplicate key |
| `services/tax/taxDeductionStore.test.ts` | EPF decision written with Firestore's share, and refused when it differs; eligibility written against Firestore's amount, and refused when the claim changed or is gone |
| navigation and route-restoration tests | `/tax/{fy}/deductions` |
