# Account documents storage — deploy runbook (SPENDLY-88)

**Status as of 2026-09-23: nothing in this runbook has been run. The feature is
inert in the app until Steps 1–3 are done.**

This is the setup for Spendly account documents. Unlike
`docs/GANESH_STORAGE_LOCKDOWN.md`, this is not a remediation — it is a
first-time install, written before any object exists so that the permissive
phase GS-001 documents never happens here.

Ticket: **SPENDLY-88**, under epic **SPENDLY-78**.

---

## What is being stood up

Spendly had no file storage at all before this:

- **Firebase Storage** denies clients everything in `storage.rules` except
  reading `/releases`. Nothing in Expense, Nutrition or Spendly uploads to it.
- **Supabase `ganesh-files`** is pandal-scoped and governed by its own Edge
  Function. Reusing it would couple Spendly to Ganesh infrastructure that still
  has open security tickets, against the multi-app isolation rule in
  `CLAUDE.md`.

So this adds a second, independent bucket and function:

| Piece | Where |
|---|---|
| Bucket `spendly-files`, private | `supabase/spendly-files.bucket-limits.sql` |
| RLS posture (grants nothing) | `supabase/spendly-files.policies.sql` |
| Edge Function `spendly-files` | `supabase/functions/spendly-files/` |
| Object path | `users/{uid}/accounts/{accountId}/{documentId}/{fileName}` |
| Metadata | Firestore `users/{uid}/accountDocuments/{id}` |

Binaries never go to Firestore. Firestore holds only the metadata and the
object key; the key is never a URL, because URLs here expire.

### The security model in one paragraph

The bucket grants nobody anything. The only writer is the service-role key,
which lives solely inside the Edge Function. The function reads the uid out of
the requested path, refuses immediately if it is not the caller's own uid, then
asks Firestore — *as the caller* — for the account document that path names.
Firestore verifies the token signature and applies the personal-tree rules, so a
forged or expired token gets a 401 and a valid token for someone else's account
gets nothing back. Only then is a short-lived signed URL minted.

---

## Step 1 — create the bucket

Run `supabase/spendly-files.bucket-limits.sql` in the Supabase SQL editor.

Creates the bucket **private**, with a 10 MB size limit and the four allowed
MIME types. `public = false` is the load-bearing line: a public bucket serves
objects to anyone holding the path, with no signed URL, which would make
everything else here pointless.

If the SQL is refused because `storage.buckets` is owned by
`supabase_storage_admin`, create it in the dashboard instead: **Storage → New
bucket**, name `spendly-files`, Public **off**, then set the file size limit and
MIME types under Configuration.

**Verify:**

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'spendly-files';
```

Expected: `public = false`, `file_size_limit = 10485760`, the four types.

---

## Step 2 — confirm nothing grants access

Run `supabase/spendly-files.policies.sql`.

It creates no policies. It drops any that were added by hand during setup and
then prints what is left. **Expected: 0 rows.** A non-empty result means
something can reach these objects without going through the Edge Function.

---

## Step 3 — deploy the Edge Function

```bash
npm run supabase:deploy:spendly-files
```

`--no-verify-jwt` is set, matching `ganesh-files`: the Authorization header
carries a *Firebase* ID token, not a Supabase JWT, so Supabase's own
verification would reject every legitimate request. The function does its own
verification via Firestore.

### Required function secrets

Set these in **Edge Functions → spendly-files → Secrets** (or
`supabase secrets set`):

| Secret | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | `expenseapp-27f94` |
| `SUPABASE_URL` | the project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | the service-role key |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are normally injected
automatically; `FIREBASE_PROJECT_ID` is not. Without it the function returns
`500 Storage is not configured.` on every request — deliberately, rather than
falling back to a guess.

**The service-role key must never appear anywhere else.** It bypasses RLS
entirely. It is not an `EXPO_PUBLIC_` variable and must not become one.

---

## Step 4 — smoke test

With a real Firebase ID token for an account you own:

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/spendly-files" \
  -H "authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "content-type: application/json" \
  -d '{"operation":"download","path":"users/<uid>/accounts/<accountId>/<docId>/file.pdf"}'
```

Then the checks that actually matter — each must fail:

| Request | Expected |
|---|---|
| Another user's path | `403` |
| A path with `..` in it | `400` |
| No `Authorization` header | `401` |
| An expired token | `401` |
| An account id you do not own, under your own uid | `403` |

These same cases are covered by
`supabase/functions/spendly-files/handler.test.ts`, which runs in `npm test`.
The curl pass confirms the deployed function matches the tested handler.

---

## Step 5 — deploy the Firestore rules

The metadata collection `users/{uid}/accountDocuments/{id}` needs a rules
deploy. Run the **Deploy Firestore rules** workflow manually
(`workflow_dispatch`, `dry_run: false`). Merging never ships rules.

Until this runs, document metadata writes are denied and the feature does
nothing in production even if Steps 1–4 are complete.

---

## What is deliberately not here

- **No orphan sweeper.** A failed upload leaves a `pending` metadata row, which
  the UI shows and offers to retry or remove. That is a visible, user-resolvable
  state rather than a background job reconciling two systems. If pending rows
  accumulate in practice, that is the signal to write one — not before.
- **No documents in statement exports.** SPENDLY-79's PDF and CSV export builds
  from account activities and never reads this collection. The ticket asks for
  that explicitly, and a test in `accountDocuments.test.ts` pins the collections
  as disjoint.
- **No transaction-level attachments.** The ticket lists these as optional. The
  metadata shape has no `activityId`, so adding them later is an additive change
  rather than a migration.
