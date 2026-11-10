# SPENDLY-298: Tax document center (part 1: vault and attach)

**Epic:** SPENDLY-288 ([tracker](SPENDLY-288-tax-itr-readiness.md), [plan](SPENDLY-288-plan.md)).

**Branch:** `feature/SPENDLY-298-tax-documents`, from the epic branch (synced with main, so it includes SPENDLY-711).

**Split (decision D4):** the exportable summary is SPENDLY-710. Account deletion removes these files (SPENDLY-711, on main).

## What the user sees

- **Tax center → Documents (`/tax/{fy}/documents`):** the year's documents grouped by kind. The kinds are Form 16, Form 16A, AIS, TIS, Form 26AS, investment or deduction proof, interest certificate, capital gains statement, tax payment receipt, and other.
  - **Each row** shows the name, size and date, and "Upload not finished" while its file hasn't landed.
  - **Add document:** pick a PDF or image of up to 10 MB, choose its kind, a name and an optional note. Password-protected PDFs are stored as they are; Spendly never asks for or keeps the password.
  - **Ready document:** View (a link that lasts 5 minutes), Edit name or kind, Delete.
  - **Unfinished upload:** Retry upload (pick the file again) or Remove.
  - **States:** empty, loading, error and offline. Adding and viewing need a connection.
- **Income form** (SPENDLY-290): a **Proof** field attaches the year's finished documents to an income entry. An income row shows "1 proof" when one is attached. TDS, deductions and payments will use the same field (`TaxDocumentAttachField`).

## How it works

**Path:** `users/{uid}/tax/{documentId}/{fileName}` in the private `spendly-files` bucket.
- The file name is a sanitised object key (`sanitizeDocumentFileName`, as for account documents).
- The name the user sees is `name`, which keeps their own text.

**Ownership proof:** the document's own metadata row, `users/{uid}/taxDocuments/{documentId}` (SPENDLY-709).
- The `spendly-files` Edge Function now accepts this 5-segment path (`ownerForPath` → `{ uid, taxDocumentId }`). It proves ownership by reading that row with the caller's token, the same as it reads the account or goal for the other paths.
- A foreign uid is refused before any read.
- The Firestore rule already pins `storagePath` to `users/{uid}/tax/{documentId}/{fileName}` (709).

**Adding a document** (`services/tax/taxDocumentStore.ts`):
1. Write the row as `pending`, through `commitMutations` (the dual write).
2. **Only once the row is acknowledged by the server,** upload. The Edge Function needs to read the row, so a queued row would be refused. Offline, the row stays pending and the user is told to retry when back online.
3. Upload through the existing client (`uploadDocumentObject`), then mark the row `ready`.

A failure leaves a visible pending row, never an unreferenced file.

**Retry** uploads to the same path, overwriting its own object.

**Edit** changes the name, note and kind only; the path, year and file are pinned by the rules.

**Delete:**
1. Remove the file. If that fails for a ready document, nothing else changes and the user can retry. A pending row's file may never have landed, so a failed remove there is ignored.
2. Remove the document from every live entry of that year that links it (a correction of each entry, with history). The query uses one `array-contains` filter, served by the automatic index, limited to 50, with the year checked on the device.
3. Delete the row.

**Links:** an entry's `documentIds` is the link. `linkedTaxDocuments` drops ids whose document no longer exists, so a link never shows as a broken file.

**Reads:** `useTaxDocuments(fy)` (709) uses the per-collection switch and is bounded to the year. The income screen mounts it only while the income form is open (SPENDLY-406).

## Production steps (each needs approval)

1. **Deploy the Edge Function:** `npm run supabase:deploy:spendly-files`, to the read-model project. Until then, tax uploads are refused (invalid path); nothing else changes.
2. **Firestore rules** for `taxDocuments` ship with 709's rules deploy.

## Local review

The Spendly Test / local emulator setup never reaches Supabase Storage (`lib/networkGuard.ts`), so uploading, viewing and deleting a file can't complete locally. The demo seed adds two document rows for the year that ended last, so both states can be reviewed:
- "Form 16 – Employer" (finished);
- "AIS download" (unfinished).

## Tests

| File | Covers |
|---|---|
| `supabase/functions/spendly-files/handler.test.ts` (+4) | Tax paths parsed strictly (no extra segments, `..`, spaces, wrong folder); ownership read from `taxDocuments/{id}` as the caller; another user's path refused before any read; a missing row refused; unsafe type refused; download and delete of the user's own document |
| `shared/features/tax/utils/documents.test.ts` | Path and safe key, unsafe ids, allowed files, pending row shape (passes `validateTaxDocument` for the owner, `not_owner` for another), ready, edit never touches the file, stuck after 15 min, grouping order, dropping links to deleted documents |
| `services/tax/taxDocumentStore.test.ts` | Row → upload → ready; no upload while the row is only queued; failed upload stays pending and retry finishes it; refusal before any write; delete order file → entry links → row; a failed delete of a ready file changes nothing; a pending row is cleared even if its file never landed |
| `shared/config/navigation.test.ts`, `routeRestoration.test.ts` | `/tax/{fy}/documents` |
