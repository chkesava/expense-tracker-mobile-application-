# SPENDLY-562: Payment request fails for users without a profile photo

- **Type:** bug, with no epic.
- **Branch:** `feature/SPENDLY-562-payment-request-photo`, cut from `main` at `7d35fe3f`.
- **Found in:** SPENDLY-550 web QA.

## Cause
- `CreatePaymentRequestModal` passed `payeePhotoUrl: user?.photoURL || undefined`.
- `createPaymentRequest` (in `hooks/usePaymentRequests.ts`) spread its input straight into `setDoc(paymentRequests/{slug})`.
- Firestore rejects `undefined` values, because `ignoreUndefinedProperties` is not enabled. So every user without a profile photo saw "Failed", and nothing was written. That includes every email/password sign-up.

## Fix
- **New pure builder** `shared/utils/paymentRequestDoc.ts`, `buildPaymentRequestDoc(input, ctx)`:
  - it builds the `paymentRequests/{slug}` document with the existing `omitUndefined` (`shared/utils/firestorePayload.ts`);
  - optional fields the caller doesn't have are left out instead of being sent as `undefined`;
  - identity fields (`slug`, `createdBy`, `createdAt`, `status`) always come from the context;
  - the QR-style and currency fallbacks are unchanged.
- `createPaymentRequest` uses the builder.
- `CreatePaymentRequestModal` adds `payeePhotoUrl` only when the user has a photo.
- **Other create paths checked:** the split flows (`CreateSplitModal`, `SplitDetailModal`, `useSplits`) pass the same `|| undefined` value. They build their requests through `buildParticipantShareRequests`, which already wraps the payload in `omitUndefined`, so they were not affected and are unchanged.
- **Rules:** `firestore.rules` for `paymentRequests` only checks `createdBy` and `slug`, so a document without `payeePhotoUrl` is allowed. No rules change.
- **Public page:** nothing on `/payment/[slug]` reads `payeePhotoUrl`.

## Tests and checks
- `npx vitest run shared/utils/paymentRequestDoc.test.ts`: 4 passed. Covers:
  - no photo: the field is omitted and the document contains no `undefined`;
  - with a photo: it is stored unchanged;
  - other undefined optional fields are dropped and the fallbacks filled;
  - the input can't override identity fields.
- `npm test`: 5,850 passed.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- **End to end on web, against the Firebase emulator.** The demo user is an email sign-up with no photo; I set a UPI ID on that user in the emulator only.
  - Path: Vaults → Collect → Create Request, ₹750, Generate QR & Link.
  - `paymentRequests/d4d679a576` was written with `amount, note, notePrefix, payeeName, upiId, qrStyleId, slug, createdBy, createdAt, status, currency`, and **no `payeePhotoUrl`**.
  - The Collect list showed the QR code and "Pay via UPI".
  - The public `/payment/d4d679a576` page rendered fully for a signed-out visitor.
- **No control run on the old code:** the ticket's reporter already confirmed the cause, since giving the emulator user a photo made the old flow succeed.

## Rollout
No rules, data or backfill changes. Existing requests are unaffected. Ships with the next web deploy and Android release.
