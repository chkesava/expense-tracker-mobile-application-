# SPENDLY-550 (Phase 6c): Splits, Trips and public payment pages

Story under epic SPENDLY-531. Branch: `feature/SPENDLY-550-splits-trips-pay`, cut from the epic at `a1dcf7b` (which includes SPENDLY-496 and 561). It does not include SPENDLY-549, which is still awaiting its epic merge.

UI only. Split, claim, payment-request and trip writes are unchanged, as are their Firestore rules. `hooks/useSplits.ts` is untouched.

## What changed
| Ticket finding | Fix |
|---|---|
| 71 hardcoded colours | None left in `components/splits`, `components/trips`, `components/collect`, `app/split/[slug]` or `app/payment/[slug]`.<br>• Green, red, amber and blue become `success`/`destructive`/`warning`/`info`.<br>• Tints become `withAlpha(token)`.<br>• The eight sheet backdrops use `theme.colors.scrim`.<br>• Hero-card shadows use `theme.elevation[4]`.<br>• Icons and text on primary use `primaryForeground`; the check on a settled share uses `successForeground`.<br>• The QR card's share button uses the QR's own paper colour, so it contrasts with its ink by construction.<br>• Payment-request swatch rings and dots use `card`. |
| "20 `Amount`s without `ghostable`" | **Overcounted.** The props sit on the next line, so a one-line grep missed them. Every in-app `Amount` already had exactly one `ghostable`, and each element was verified. The real ghost bug was the opposite one, below. |
| Ghost on public pages | `app/split/[slug]` (2) and `app/payment/[slug]` (4) marked their amounts `ghostable`. A signed-in owner with ghost mode on would have sent a masked page to themselves, and the ticket says ghost never applies there. **Removed.** `PublicSplitClaimRow` keeps its plain `formatAmount`, the "one plain formatAmount" finding, deliberately: it's payer-facing. |
| Raw money text in trips | "₹n remaining", "/ ₹limit" and "of ₹budget" now go through `useGhostMoney`. |
| Owed/owing in words and signs | The splits hub shows **+₹n** "You are owed" (success tone) and **−₹n** "You owe" (amber), via `FinancialAmount`. The words and arrows are kept. |

**Bug fixed on the way: unreadable input text.** The eight hand-rolled RN `Modal` sheets portal outside `SpendlyUIScope` on web, so their Gluestack `Input`s and `Button`s lost the theme variables. Typed text was dark on dark (the split title, amounts, the trip destination), and "Cancel" was a white pill. That's the same root cause SPENDLY-542 fixed for `common/Modal`. Each sheet now re-applies `useSpendlyScopeVars()` on its backdrop. The sheets affected: create, edit, add-participant and gift-money split sheets; split detail; create trip; trip detail; payment request.

## QA
**Setup:** web, on an isolated emulator suite at `127.0.0.2` with Expo on `:8093`, because another agent may be using the default `127.0.0.1` suite. Data was created through the app.
- **Split:** "Weekend BBQ", ₹1,800 between You and Ravi, made with the create sheet. It produced a public share at `/split/pkf3g25roj`.
- **Payment request:** ₹2,500 "July rent share", made with the create sheet, at `/payment/4836e0d9d2`. It first needed a receiving UPI ID, then failed: see the bug below.
- **Trip:** "Goa long weekend", ₹15,000 with two category limits. It was written in the exact shape `useTrips.createTrip` uses, because its 3-step wizard needs date-picker scripting; only its backdrop changed.

| Check | Result |
|---|---|
| In-app figures | Split ₹1,800 → ₹900 each, "You are owed **+₹900**", 50% settled. Trip ₹15,000, category limits ₹1,000 and ₹6,000. Request ₹2,500. All correct. |
| Ghost mode (setting on) | No ₹ amount visible on the splits, travel or collect tabs, or the split and trip detail (3/7/2/9/2 masked). |
| Public pages, signed out | `/split/…` shows ₹1,800, ₹900 and ₹900 with the claim UI. `/payment/…` shows ₹2,500. |
| Public pages, **owner signed in with ghost on** | Still shows ₹1,800, ₹900, ₹900 and ₹2,500, as the ticket requires. These were masked before. |
| Input text in sheets | Readable after the scope fix: "2500" and "July rent share" in the request sheet. |
| Themes and widths | Midnight Emerald 390 and 320, Light 390: no page errors, no NaN. |

**Checks run:**
- `npm test`: 382 files, 5,710 tests passed.
- `npm run typecheck:shared`: passed.
- `npx tsc -p tsconfig.json --noEmit`: passed.
- No new unit tests: the story has no pure logic. The ghost and public rule was verified end to end above.

**Not done:** native device QA.

## Found, not fixed (outside this UI story)
- **P1: users without a profile photo can't create a payment request.** `CreatePaymentRequestModal` sends `payeePhotoUrl: user?.photoURL || undefined`. Firestore rejects `undefined` (`invalid-argument … payeePhotoUrl`), so every email/password user without a photo gets "failed". Fix: omit the field when there's no photo. It's a write-path change, so it needs its own ticket. In QA it was worked around by giving the emulator user a photo.
- React logged one "Encountered two children with the same key" while the create-split sheet was open, probably duplicate category names in its picker. It didn't recur and wasn't traced.
- `CreateTripModal`'s budget preview still prints the typed budget with `toLocaleString`. That's the user's own input, so it's left unmasked.
