# Closing the Ganesh Seva storage hole (GS-001) — manual runbook

**Status as of 2026-08-27: Steps 2, 3 and 5 are done. The bucket is locked in
production and the client change has landed in this repo (commit `1d51b4e`), but
that commit has not reached a shipped build yet.**

This happened out of the order this document recommends — the policies were
locked before a build carrying the client fix was in anyone's hands. That means
**every photo upload, view and delete in the live app is broken right now**, for
every installed copy, until Step 4 below (build and ship) completes. That is not
a future risk this document is warning you about; it is the current state.

**What is left:** Step 4 (build a release and get it installed) and Step 6
(verify). Steps 0, 1 and 2 in this document are historical at this point — skip to
Step 4.

Ticket: **GS-001** in `GANESH_SEVA_AUDIT_TICKETS.md`. Related: **GS-036** (size and
MIME enforced only on the client — Step 2 below fixes it), **GS-096** (signed URL
TTL), **GS-069** (no cleanup path).

---

## What is actually wrong

All four RLS policies on the `ganesh-files` bucket are granted `to anon,
authenticated` with a predicate that checks only the bucket name and the first
path segment:

```sql
bucket_id = 'ganesh-files' and split_part(name, '/', 1) = 'pandals'
```

Firebase Auth is not a Supabase session, so every request from the app arrives as
the `anon` role. The publishable key (`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) is
inlined into the release bundle by Metro and is trivially extractable from the
APK. So with the key and no account at all, anyone can list every pandal's object
paths, sign a URL for any of them, overwrite any receipt (`upsert: true`), and
delete the entire bucket.

The application-layer checks in `services/ganesh/storage/storageAuth.ts` and
`storagePaths.ts` are well written, but they are not on the attacker's path.

**RLS alone cannot fix this.** There is no identity for a policy to gate on. It
needs a trusted server component, which is what Step 3 adds.

---

## Decide this first

**Do you lock the bucket now and break photos, or leave it exposed until the new
build ships?**

Locking now (Step 5 alone, skipping the rest) takes two minutes and stops the
exposure immediately — at the cost of every receipt, contribution, sponsor and
asset photo failing to upload or open, in every installed copy of the app, until
you complete the rest and ship a build.

Doing it in order (Steps 1–6) means no user-visible breakage, but the bucket stays
public for as long as that takes.

There is no third option where the old APKs keep working after lockdown. Old
builds call Supabase Storage directly; that is exactly what is being revoked.

If the bucket holds real donor documents right now, consider locking first and
accepting the outage.

---

## Step 0 — See what you are dealing with (5 minutes)

In the Supabase SQL editor:

```sql
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'ganesh-files';
```

`public` **must** be `false`. If it is `true`, everything below is pointless until
you fix it — a public bucket serves objects with no signed URL at all. Change it in
**Storage → ganesh-files → Configuration**.

Then see how much is exposed:

```sql
select count(*), pg_size_pretty(sum((metadata->>'size')::bigint))
from storage.objects
where bucket_id = 'ganesh-files';
```

And check for anything already written outside the expected shape — the old policy
allowed any path under `pandals/`, so this is worth a look:

```sql
select name, created_at
from storage.objects
where bucket_id = 'ganesh-files'
  and array_length(string_to_array(name, '/'), 1) not in (5, 7)
order by created_at desc
limit 50;
```

Expected shapes are only:
- `pandals/{pandalId}/festivals/{festivalId}/{expenses|contributions|documents}/{recordId}/{file}` (7 segments)
- `pandals/{pandalId}/assets/{assetId}/{file}` (5 segments)
- `pandals/{pandalId}/sponsors/{sponsorId}/{file}` (5 segments)

Anything else was not written by this app.

---

## Step 1 — Turn on the bucket's own limits (5 minutes, closes GS-036)

This is independent of everything else and safe to do immediately — it only
rejects uploads the app already refuses on the client.

**Storage → ganesh-files → Configuration:**

- **File size limit:** `5 MB` — matches `MAX_UPLOAD_BYTES` in
  `services/ganesh/storage/storageTypes.ts`.
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp` — matches
  `ALLOWED_IMAGE_TYPES` in the same file.

Today both are checked only in `imageRules.ts`, on the client, which a crafted
client skips entirely. Setting them here makes Storage enforce them.

Verify:

```sql
select file_size_limit, allowed_mime_types from storage.buckets where id = 'ganesh-files';
```

---

## Step 2 — Get the Supabase CLI ready

```bash
npm install -g supabase
```

```bash
supabase login
```

```bash
supabase link --project-ref <your-project-ref>
```

The project ref is the subdomain in your `EXPO_PUBLIC_SUPABASE_URL`
(`https://<project-ref>.supabase.co`).

---

## Step 3 — Deploy the Edge Function

The function is already written at
[`supabase/functions/ganesh-files/index.ts`](../supabase/functions/ganesh-files/index.ts).
Read it before deploying — in particular the comment explaining why it does not
need a Firebase service account.

**How it decides you are allowed:** it takes your Firebase ID token, reads the uid
out of it *without* verifying the signature, and then asks the Firestore REST API
for `pandals/{pandalId}/members/{uid}` **as you**, passing your token straight
through. Firestore verifies the token and applies the Ganesh security rules. A
forged or expired token gets a 401 from Firestore; a valid token for a non-member
returns nothing, because that member document does not exist. So "document exists
and `status == active`" is exactly "active member of this pandal", with no service
account and no second copy of the permission model.

Only then does it use the Supabase **service-role key** — which bypasses RLS and
never leaves the function — to mint a short-lived signed URL.

Set the one secret it needs (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically):

```bash
supabase secrets set FIREBASE_PROJECT_ID=expenseapp-27f94
```

Deploy it. `--no-verify-jwt` is required: the caller presents a *Firebase* token,
not a Supabase one, so Supabase's own JWT gate would reject every request before
the function ran.

```bash
supabase functions deploy ganesh-files --no-verify-jwt
```

Watch it while you test:

```bash
supabase functions logs ganesh-files
```

### Verify the function before touching anything else

Get a real Firebase ID token from a signed-in device (in the app, `getIdToken()`
on the current user — or add a temporary log), then:

```bash
curl -i -X POST "https://<project-ref>.supabase.co/functions/v1/ganesh-files" -H "Authorization: Bearer <firebase-id-token>" -H "content-type: application/json" -d '{"operation":"download","path":"pandals/<your-pandal-id>/assets/<asset-id>/<file>.jpg"}'
```

Expect `200` with a `signedUrl`. Then confirm it actually refuses things:

| Try this | Expect |
| --- | --- |
| A path under a pandal you are **not** a member of | `403` |
| `"path":"pandals/../../etc"` or any other shape | `400 Invalid storage path` |
| No `Authorization` header | `401` |
| A garbage token | `403` |
| A token from a **removed** member | `403` |

If any of these returns `200`, stop and fix the function before continuing.

---

## Step 4 — Point the app at the function (code change, needs a release)

This is the part I have **not** written, deliberately: applying it before the
function is live would break photos on the next build with no way to tell it was
the cause. Say the word and I will do it.

The change is confined to `services/ganesh/storage/supabaseStorage.ts`, whose
three exported functions are the only places the app touches Storage:

- `uploadObject(path, uri, mimeType)` — call the function with
  `operation: "upload"`, then `uploadToSignedUrl(path, token, bytes, { contentType })`.
  The bytes go straight to Supabase, so the Edge Function request-size limit does
  not apply.
- `createObjectSignedUrl(path)` — call with `operation: "download"` and return the
  `signedUrl`.
- `removeObject(path)` — call with `operation: "delete"`.

Each call needs `Authorization: Bearer <firebase id token>` from the current user.
`friendlyStorageError` already maps 401/403 to "You do not have permission to store
this file", so the error copy still works.

Two things that come along with it:

- The signed-URL TTL drops from 30 minutes to 5 (`DOWNLOAD_URL_TTL_SECONDS`).
  That is half of **GS-096**; the other half is the never-evicting cache map in the
  client, which should be shortened to match.
- `@supabase/supabase-js` must be new enough for `createSignedUploadUrl(path, { upsert: true })`.
  Check the installed version before relying on the upsert.

Then build and ship. **Wait until the build is actually in users' hands.**

---

## Step 5 — Revoke the public grants (the actual fix)

Only now. Run
[`supabase/ganesh-files.policies.locked.sql`](../supabase/ganesh-files.policies.locked.sql)
in the SQL editor. It drops the four policies and creates nothing: with RLS on and
no policy, `anon` and `authenticated` can do nothing with the bucket. Signed URLs
keep working because Storage validates those itself, outside RLS.

If `DROP POLICY` is refused (the `storage.objects` table is owned by
`supabase_storage_admin`), remove the four policies by name in
**Storage → ganesh-files → Policies**.

Then delete the old file so no one re-applies it by accident:

```bash
git rm supabase/ganesh-files.policies.sql
```

```bash
git mv supabase/ganesh-files.policies.locked.sql supabase/ganesh-files.policies.sql
```

---

## Step 6 — Prove it is closed

These are GS-001's acceptance criteria. Run them from a machine with **only** the
publishable key — no Firebase session.

```bash
curl -i "https://<project-ref>.supabase.co/storage/v1/object/list/ganesh-files" -H "apikey: <publishable-key>" -H "Authorization: Bearer <publishable-key>" -H "content-type: application/json" -d '{"prefix":"pandals","limit":100}'
```

Expect an empty list or a `4xx`. **A populated list means the lockdown did not take.**

```bash
curl -i "https://<project-ref>.supabase.co/storage/v1/object/ganesh-files/pandals/<any-pandal-id>/assets/<asset-id>/<file>.jpg" -H "apikey: <publishable-key>" -H "Authorization: Bearer <publishable-key>"
```

Expect `400`/`403`, not the image bytes.

Checklist from the ticket:

- [ ] Reading an object under `pandals/{A}/…` with only the publishable key is refused.
- [ ] Writing and deleting under another pandal's prefix is refused.
- [ ] Enumerating the bucket with the publishable key returns nothing.
- [ ] An active member of pandal A can still upload and view that pandal's receipts, assets, contribution and sponsor photos.
- [ ] The bucket's `public` flag is `false` (Step 0).
- [ ] `supabase/ganesh-files.policies.sql` no longer grants `anon` any privilege.

Then walk the app on a real device: add an expense receipt, a contribution photo,
a sponsor photo and an asset photo; open each one back up; delete one.

---

## If you need to roll back

Re-apply the original policies from git history:

```bash
git show HEAD:supabase/ganesh-files.policies.sql
```

Paste into the SQL editor. That restores photo features for old builds — and
restores the hole. Only do it if the outage is worse than the exposure, and only
as a bridge.

---

## What this does not fix

- **GS-069** — no cleanup path. Orphaned objects still accumulate; nothing deletes
  a file when its expense or contribution is voided. The Edge Function is the
  natural place to add a sweeper later.
- **GS-097** — each upload still reads the image into memory three times on the
  client.
- **Existing objects.** Nothing here re-permissions or audits what is already in
  the bucket. If you believe the key has been extracted, assume everything
  currently stored has been readable and decide separately whether that needs
  disclosing to your committee.
