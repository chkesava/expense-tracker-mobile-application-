# KAN-40 — Assets, Donors & Document Vault

| Field | Value |
| --- | --- |
| Jira | [KAN-40](https://kesavach.atlassian.net/browse/KAN-40) |
| Feature | 07 — Assets, Donors & Document Vault |
| Type | Feature |
| Status | In Progress |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Parent | [KAN-33](https://kesavach.atlassian.net/browse/KAN-33) |
| Branch | `feat/KAN-40-assets-document-vault` |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules and the `ganesh-files` Edge Function are.

## Ticket

Gap-close on the already-shipped Assets stack, then add a Document Vault metadata index and browser UI. Do not invent a Donor collection — donated assets keep `relatedContributionId` + `sourceName`. Vendors (Feature 07 §§28–38) are out of scope for this ticket.

Assets stay Pandal-scoped. Festival money stays festival-scoped. Vault rows point at the same Supabase object as the entity attachment; they are not a second upload.

## Live schema

| Ticket name | Actual path |
| --- | --- |
| Asset | `pandals/{pandalId}/assets/{assetId}` |
| Asset audit | `pandals/{pandalId}/assetAudits/{auditId}` |
| Document vault index | `pandals/{pandalId}/documents/{documentId}` |
| Document audit | `pandals/{pandalId}/documentAudits/{auditId}` |
| Storage | Supabase bucket `ganesh-files` via Edge Function |

Entity attachment paths (unchanged):

- `pandals/{pandalId}/festivals/{festivalId}/expenses/{expenseId}/…`
- `pandals/{pandalId}/festivals/{festivalId}/contributions/{contributionId}/…`
- `pandals/{pandalId}/festivals/{festivalId}/documents/{documentId}/…` (standalone festival docs)
- `pandals/{pandalId}/assets/{assetId}/…`
- `pandals/{pandalId}/sponsors/{sponsorId}/…`

Vault index id for entity slots is deterministic: `{entityType}_{entityId}` so a replace updates the same row. Standalone festival docs use a fresh id; `entityType` is `festival` and `entityId` equals the document id.

## Canonical operations

| Concern | Implementation |
| --- | --- |
| Create / update / dispose asset | existing `createPandalAsset`, `updatePandalAsset`, `setAssetStatus`, `adjustAssetQuantity` |
| Purchase = expense + asset | existing `addAssetPurchase` — now also sets `acquiredFestivalId` |
| Donation link | `relatedContributionId` + `sourceName`; contribution `addAsAsset` sets `acquiredFestivalId` |
| Attach entity photo/receipt | existing `attach*` + vault upsert in the same batch |
| Create standalone festival doc | `createFestivalDocument` then queue `festivalDocument` upload |
| Attach / replace vault file | `attachDocumentFile` |
| Archive document | `archivePandalDocument` (soft; no hard delete) |
| List / detail | `usePandalDocuments`, `usePandalDocument` |
| Idempotency | `clientOpId` as document id where applicable |

## Existing code to start from

- `shared/types/ganesh.ts`
- `shared/utils/ganeshAssets.ts`
- `services/ganesh/ganeshAssets.ts`
- `services/ganesh/ganeshWrites.ts` (`addAssetPurchase`, attach helpers)
- `services/ganesh/storage/*`
- `app/(ganesh)/assets.tsx`, `add-asset.tsx`, `asset/[id].tsx`
- `hooks/usePandalAssets.ts`, `hooks/useGaneshWrites.ts`

## How to implement

1. Add `acquiredFestivalId` on assets; set on purchase and festival-context create/donate.
2. Clarify donated asset detail copy (linked contribution is the donor link).
3. Add `documents.*` permissions, Firestore rules, storageAuth for category `documents`.
4. Add vault service + upsert from entity attach paths.
5. Add festivalDocument upload target and screens under Pandal Property / Admin.
6. Tests for purchase `acquiredFestivalId`, vault upsert from receipt attach, archive.

## Implementation status

- [x] Inspected existing code
- [x] Worktree + branch from main
- [x] Jira In Progress
- [x] Asset `acquiredFestivalId` + donated-link clarity
- [x] Document types / permissions / rules / storageAuth
- [x] Vault service + entity attach index + festivalDocument upload
- [x] Documents list / detail / add + nav
- [x] Tests + manual guide
- [ ] Jira leftovers comment after merge-ready

## After merge

Deploy Firestore rules (and the `documentAudits` composite index). Edge Function path shape for `documents` already existed; confirm deploy if auth keys changed. No second storage bucket. Run `ensurePandalRoles` (opens Admin/Assets) so builtin roles pick up `documents.*`.

## Manual testing guide

Hot reload is enough if `npx expo start` is already running against this worktree. No separate install command beyond the worktree's own `npm install` if `node_modules` was missing.

1. Expense Tracker and Nutrition still open and behave as before after sign-in.
2. As treasurer/admin: Pandal → Document vault opens. Admin → Pandal property also lists Document vault.
3. Add document: pick category + photo + description → Save. Vault list shows the row. God Fund / Available unchanged.
4. Open the document: preview loads, description edits, Archive moves it off Active.
5. Add expense with receipt (or replace receipt): vault gains/updates `expense_receipt` for that expense; only one Storage object for that path.
6. Asset purchase still creates expense + asset; asset detail shows Bought during / `acquiredFestivalId` festival. Donated asset with contribution link shows Donor copy and opens the contribution.
7. Viewer can read vault; cannot add/archive. Member can add festival docs; cannot archive unless granted `documents.delete`.
8. Failed optional upload (offline cancel) does not create a ledger row. Double-tap Save on add-document: one shell (`clientOpId` / one id).

## Leftovers

- Vendors entity / UI / expense `vendorId` (Feature 07 §§28–38)
- Formal inventory-check workflow (spec §19)
- PDF / non-image vault types (MVP is jpeg/png/webp via existing image prepare)
- Backfill vault index rows for historical receipts/photos already on disk
