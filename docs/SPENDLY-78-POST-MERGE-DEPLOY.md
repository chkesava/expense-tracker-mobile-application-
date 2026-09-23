# SPENDLY-78 — post-merge deploy runbook

**Status: nothing in this runbook has been run.**

Merging the epic to `main` ships **no** user-visible change on its own. Three of
the thirteen tickets write to places that do not exist yet in production, and
until the steps below are done those three features fail closed for everybody.

This is the complete, ordered, copy-pasteable version. For the reasoning behind
the SPENDLY-88 storage design specifically, see
[`SPENDLY_DOCUMENTS_STORAGE.md`](SPENDLY_DOCUMENTS_STORAGE.md); this document is
the one to actually work through.

**Time:** about 45 minutes, plus the app release.
**Ticket:** SPENDLY-78. **Integration PR:** #174.

---

## Contents

1. [What actually needs deploying](#1-what-actually-needs-deploying)
2. [Before you start](#2-before-you-start)
3. [The order, and why it is not the obvious one](#3-the-order-and-why-it-is-not-the-obvious-one)
4. [Step 1 — Firestore rules](#step-1--firestore-rules)
5. [Step 2 — Create the Supabase bucket](#step-2--create-the-supabase-bucket)
6. [Step 3 — Confirm nothing grants access](#step-3--confirm-nothing-grants-access)
7. [Step 4 — Deploy the Edge Function](#step-4--deploy-the-edge-function)
8. [Step 5 — Prove it refuses what it should](#step-5--prove-it-refuses-what-it-should)
9. [Step 6 — Verify in the app](#step-6--verify-in-the-app)
10. [Step 7 — App release](#step-7--app-release)
11. [Step 8 — Close-out](#step-8--close-out)
12. [Troubleshooting](#troubleshooting)
13. [Rollback](#rollback)

---

## 1. What actually needs deploying

Ten of the thirteen tickets are pure client code and ship with the app build.
Three are not:

| Ticket | Needs | Fails how, if skipped |
|---|---|---|
| **SPENDLY-87** Reconciliation | Firestore rules | Saving a reconciliation is denied |
| **SPENDLY-89** Notes | Firestore rules | Creating a note is denied |
| **SPENDLY-88** Documents | Firestore rules **+** Supabase bucket, RLS check, Edge Function, one secret | Upload and view both fail |

All three write to collections that live rules currently **deny outright** —
they are not in the personal-tree wildcard allowlist, so the denial is the
default, not a bug.

### Everything you will touch

| Thing | Where it lives in the repo |
|---|---|
| Rules (3 new collections) | [`firestore.rules`](../firestore.rules) |
| Bucket creation SQL | [`supabase/spendly-files.bucket-limits.sql`](../supabase/spendly-files.bucket-limits.sql) |
| RLS posture SQL | [`supabase/spendly-files.policies.sql`](../supabase/spendly-files.policies.sql) |
| Edge Function | [`supabase/functions/spendly-files/`](../supabase/functions/spendly-files/) |
| Deploy scripts | `package.json` → `supabase:deploy:spendly-files` |

---

## 2. Before you start

### Access you need

- [ ] **GitHub** — permission to run a `workflow_dispatch` on Actions.
- [ ] **Supabase dashboard** — SQL editor and Edge Function secrets.
- [ ] **Supabase service-role key** — from Project Settings → API. This key
      bypasses RLS entirely. It goes into the function's secrets and **nowhere
      else** — never into `.env`, never prefixed `EXPO_PUBLIC_`.
- [ ] **A real Firebase ID token** for an account you own, for Step 5.

### Tools

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
```

Your project ref is the subdomain of `EXPO_PUBLIC_SUPABASE_URL`
(`https://<project-ref>.supabase.co`).

### Two facts worth knowing before you begin

**The Firebase project is shared between dev and prod.** There is no staging.
Everything below runs against the project real users are on
(`expenseapp-27f94`). The rules step is reversible; read Step 1's dry-run note
before firing it.

**The Supabase project is shared with Ganesh.** `spendly-files` is a new,
separate bucket, but it lives in the same Supabase project as `ganesh-files`,
so the service-role key you put into this function is the same key that can
reach Ganesh's objects. That is inherent to one project, not something this
epic introduced — but it is a reason to keep the key to the function's secrets
and out of anything else.

---

## 3. The order, and why it is not the obvious one

> [!WARNING]
> **Backend first, app last.** This is the opposite of the note in
> `.github/workflows/firestore-rules-deploy.yml`, which says *"new app first,
> then tighten rules"*.
>
> That note is right for **tightening**. This epic only **loosens** — it adds
> three collections that are currently denied. Deploying the rules early grants
> access to collections no released build writes to yet, which is harmless.
> Deploying them late means all three features fail for everyone who already
> updated.
>
> The Supabase half is the same direction for a different reason: the app calls
> the Edge Function, and the function cannot call the app. This is the inverse
> of GS-001, where the server half landed first and broke photos in every
> installed copy — there the client was the dependency; here the server is.

```
Step 1  Firestore rules        ──┐
Step 2  Create bucket            │  backend — before any user has the build
Step 3  Confirm RLS grants none  │
Step 4  Edge Function + secret ──┘
Step 5  Smoke-test refusals
Step 6  Verify in a dev build
Step 7  App release            ──── users get the features
Step 8  Close-out
```

> [!IMPORTANT]
> **Step 1 has a clock on it.** The nightly drift job (`03:17 UTC`, same
> workflow) diffs live rules against the default branch. From the moment the
> epic is on `main`, that job goes **red every night** until the rules deploy
> runs. Do Step 1 the same day you merge.

---

## Step 1 — Firestore rules

Covers **SPENDLY-87, 88 and 89**. Merging never ships rules; this is always
manual.

### 1.1 — Dry run first

1. GitHub → **Actions** → **Deploy Firestore rules**.
2. **Run workflow**, on the branch with the merged epic (`main`).
3. Leave the inputs at their defaults:
   - `dry_run` → **true**
   - `deploy_indexes` → **false**
4. Run it.

The emulator suite runs first and must pass (462 cases). Then the dry run
compiles the rules remotely.

> [!NOTE]
> A `403` on the remote `:test` call during a **dry run** is expected and not a
> failure. The GitHub service account has App Distribution + Datastore roles,
> not Firebase Rules Admin. The emulator job already compiled the rules, so the
> dry run's job is only to surface compiler warnings. The workflow explains this
> in its own comments.

### 1.2 — The real upload

Run the workflow again, changing one input:

- `dry_run` → **false**
- `deploy_indexes` → **false** (leave it)

> [!CAUTION]
> **Never turn on `deploy_indexes` for this epic.** It changes no indexes, and
> this repo's `firestore.indexes.json` is a known **subset** of what is live —
> deploying it would delete the live indexes missing from the file. The workflow
> has an `assert-index-deploy` guard, but there is no reason to go near it here.

### 1.3 — What it grants

| Collection | Validator | Ticket |
|---|---|---|
| `users/{uid}/accountReconciliations/{id}` | `accountReconciliationWellFormed()` | SPENDLY-87 |
| `users/{uid}/accountNotes/{id}` | `accountNoteWellFormed()` | SPENDLY-89 |
| `users/{uid}/accountDocuments/{id}` | `accountDocumentWellFormed()` | SPENDLY-88 |

No existing rule is modified. Each is owner-only, and each refuses any document
carrying `amount` or `date` — notes and documents are context, never money, and
that is enforced by the rule rather than by the client.

### 1.4 — Verify

- [ ] Workflow run is green.
- [ ] Firebase Console → Firestore → Rules shows a new version timestamped now.
- [ ] The three `match` blocks above are present in the published rules.

**Stop here if this failed.** Steps 2–4 are pointless without it: SPENDLY-88
writes its metadata to Firestore before it uploads anything.

---

## Step 2 — Create the Supabase bucket

SPENDLY-88 only. Safe to run at any time — no build has ever uploaded an account
document, which is exactly why the bucket is being created locked down rather
than tightened afterwards.

### 2.1 — Run the SQL

Supabase dashboard → **SQL Editor** → paste the contents of
[`supabase/spendly-files.bucket-limits.sql`](../supabase/spendly-files.bucket-limits.sql)
→ **Run**.

It creates `spendly-files` with:

| Setting | Value | Why |
|---|---|---|
| `public` | **false** | Load-bearing. A public bucket serves objects to anyone holding the path, with no signed URL — which would make the Edge Function, the RLS posture and the ownership check pointless simultaneously. |
| `file_size_limit` | `10485760` (10 MB) | Mirrors `MAX_DOCUMENT_BYTES`. |
| `allowed_mime_types` | pdf, jpeg, png, webp | Mirrors `ALLOWED_DOCUMENT_TYPES`. |

The size and MIME columns are the **real** enforcement. Bytes never pass through
the Edge Function — it mints a signed *upload* URL and the client uploads
straight to Storage — so the function only ever sees what a client *claims*. A
crafted client can declare `application/pdf` and send an executable; the bucket
is what refuses it.

### 2.2 — If the SQL is refused

`storage.buckets` is owned by `supabase_storage_admin` on hosted Supabase, so
the insert may be rejected. Use the dashboard instead:

1. **Storage** → **New bucket**
2. Name: `spendly-files`
3. **Public bucket: OFF**
4. Create, then **Configuration**:
   - File size limit: `10 MB`
   - Allowed MIME types: `application/pdf, image/jpeg, image/png, image/webp`

### 2.3 — Verify

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'spendly-files';
```

- [ ] `public` = **false**
- [ ] `file_size_limit` = `10485760`
- [ ] `allowed_mime_types` = the four types

---

## Step 3 — Confirm nothing grants access

Run [`supabase/spendly-files.policies.sql`](../supabase/spendly-files.policies.sql).

**It deliberately creates no policies.** Firebase Auth is not a Supabase
session, so every request from the app arrives as the `anon` role, and the
publishable key is inlined into the release bundle and trivially extractable
from the APK. Any grant to `anon` or `authenticated` on this bucket would be, in
effect, a **public** grant — over people's bank statements.

So: RLS on, nothing granted, and the only writer is the service-role key inside
the Edge Function.

Signed URLs still work with no policies, because Storage validates a signed URL
itself and does not consult RLS. That is the whole point of routing every read
and write through the function.

The script drops any policy that may have been added by hand during setup, then
prints what is left:

```sql
select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (qual::text like '%spendly-files%' or with_check::text like '%spendly-files%');
```

- [ ] **Expect 0 rows.**

> [!WARNING]
> A non-empty result means something can reach these objects without going
> through the Edge Function. Remove it in **Storage → spendly-files → Policies**
> before continuing. Do not proceed with rows here.

> [!NOTE]
> Do **not** run `alter table storage.objects ...`. That table is owned by
> `supabase_storage_admin` and RLS is already enabled on hosted Supabase.

---

## Step 4 — Deploy the Edge Function

### 4.1 — Read it first

[`supabase/functions/spendly-files/index.ts`](../supabase/functions/spendly-files/index.ts)
is the wiring; every authorization decision is in
[`handler.ts`](../supabase/functions/spendly-files/handler.ts), which has no
Deno and no SDK in it so the repo's Vitest suite can test it directly.

**How it decides you are allowed**, in order:

1. Reads the uid out of the requested path — the path is
   `users/{uid}/accounts/{accountId}/{documentId}/{fileName}`, so ownership is
   derivable from the path alone.
2. Reads the uid out of your Firebase ID token **without verifying the
   signature**, and refuses immediately if the two differ. This is why a foreign
   path never reaches Firestore at all, and therefore why this endpoint cannot
   be used to probe whether another user's account id exists.
3. Asks the Firestore REST API for `users/{uid}/accounts/{accountId}` **as
   you**, passing your token through. Firestore verifies the signature and
   applies the personal-tree rules. A forged or expired token gets a 401; a
   valid token for someone else's account gets nothing back.
4. Only then uses the service-role key — which never leaves the function — to
   mint a signed URL with a **5-minute** TTL. These objects are bank statements;
   a signed URL is a bearer token for one.

### 4.2 — Set the secret

```bash
supabase secrets set FIREBASE_PROJECT_ID=expenseapp-27f94
```

| Secret | Value | Injected automatically? |
|---|---|---|
| `FIREBASE_PROJECT_ID` | `expenseapp-27f94` | ❌ **No — this is the one that gets missed** |
| `SUPABASE_URL` | project URL | ✅ Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key | ✅ Yes |

Without `FIREBASE_PROJECT_ID` the function returns `500 Storage is not
configured.` on **every** request — deliberately, rather than falling back to a
guessed project.

You can also set it in the dashboard: **Edge Functions → spendly-files →
Secrets**.

### 4.3 — Deploy

```bash
npm run supabase:deploy:spendly-files
```

That is `supabase functions deploy spendly-files --no-verify-jwt`, kept as a
script so nobody deploys it without the flag.

> [!IMPORTANT]
> **`--no-verify-jwt` is required, not a shortcut.** The Authorization header
> carries a *Firebase* ID token, not a Supabase JWT. With Supabase's own gate
> on, every legitimate request would be rejected before the function ran. The
> function does its own verification, via Firestore, in step 3 above.

Watch it while you test:

```bash
npm run supabase:logs:spendly-files
```

---

## Step 5 — Prove it refuses what it should

### 5.1 — Get a Firebase ID token

From a signed-in device: `getIdToken()` on the current user, logged
temporarily. Tokens expire in an hour.

You will also need one of your own account ids — visible in the Firestore
console under `users/{your-uid}/accounts`.

### 5.2 — The happy path

```bash
curl -i -X POST "https://<project-ref>.supabase.co/functions/v1/spendly-files" \
  -H "Authorization: Bearer <firebase-id-token>" \
  -H "content-type: application/json" \
  -d '{"operation":"download","path":"users/<your-uid>/accounts/<your-account-id>/doc1/test.pdf"}'
```

A `200` with a `signedUrl` means the whole chain works. (The object need not
exist — signing a key is not the same as reading one.)

### 5.3 — The checks that actually matter

These must **fail**. If any of them succeeds, stop and do not release.

| # | Request | Expect |
|---|---|---|
| 1 | Another user's uid in the path | `403` |
| 2 | `..` in the path | `400` |
| 3 | No `Authorization` header | `401` |
| 4 | An expired token | `401` |
| 5 | An account id you do not own, under **your own** uid | `403` |
| 6 | `"operation":"list"` | `400` |
| 7 | `"contentType":"application/x-msdownload"` on an upload | `415` |
| 8 | `"declaredSize":10485761` on an upload | `413` |

Example — case 1, the one that matters most:

```bash
curl -i -X POST "https://<project-ref>.supabase.co/functions/v1/spendly-files" \
  -H "Authorization: Bearer <firebase-id-token>" \
  -H "content-type: application/json" \
  -d '{"operation":"download","path":"users/some-other-uid/accounts/a1/d1/x.pdf"}'
```

All eight are covered by
[`handler.test.ts`](../supabase/functions/spendly-files/handler.test.ts) (39
cases) and pass in CI. Running them by curl confirms the **deployed** function
matches the tested handler — that the thing in production is the thing that was
reviewed.

### 5.4 — Confirm the bucket is not reachable directly

With only the publishable key — no Firebase token — this must fail:

```bash
curl -i "https://<project-ref>.supabase.co/storage/v1/object/list/spendly-files" \
  -H "apikey: <publishable-key>" \
  -H "Authorization: Bearer <publishable-key>" \
  -H "content-type: application/json" \
  -d '{"prefix":"users","limit":100}'
```

- [ ] Expect `400`/`403`, and **no object listing**. Anything that lists objects
      means Step 3 did not take.

---

## Step 6 — Verify in the app

Against a dev build pointed at the same project, on a real account:

- [ ] **Notes** (SPENDLY-89) — add a note, edit it, pin it, delete it.
- [ ] **Documents** (SPENDLY-88) — upload a small PDF. The row should go from
      *unfinished* to normal. Open it; a viewer should appear.
- [ ] **Documents — the failure path** — turn off networking mid-upload. You
      should get a `pending` row offering retry or remove, **not** a silent
      failure. This is by design: metadata is written before the bytes so a
      failure leaves a visible row rather than an orphaned object nobody can see
      and everybody pays for.
- [ ] **Reconciliation** (SPENDLY-87) — run a reconcile and save it.
- [ ] **Delete a document** — confirm the object is gone from the bucket too
      (Storage → spendly-files).

---

## Step 7 — App release

Only once Steps 1–6 pass.

```bash
npm run release:verify
npm run release:prepare
npm run release:build
```

See `.github/workflows/release-expense.yml`.

**There is no mixed-version hazard.** A user on an older build sees none of
these features and writes none of these collections. Every addition is a new
surface; no existing read or write path changed.

---

## Step 8 — Close-out

- [ ] Move **SPENDLY-79 through 91** to **Done** in Jira. They are all
      *In Progress*, held there by the convention that work on `accounts-v2` is
      not shipped until it reaches `main`.
      *(SPENDLY-81 is already Done — it was moved early and is inconsistent with
      the rest.)*
- [ ] Move the epic **SPENDLY-78** to **Done**.
- [ ] Delete the `accounts-v2` branch.
- [ ] **Remove the SPENDLY-78 integration sections from
      [`CLAUDE.md`](../CLAUDE.md) and [`AGENTS.md`](../AGENTS.md).** Both
      describe a workflow that ends with this merge, and leaving them will send
      the next ticket to a branch that no longer exists. Both carry a note
      saying so. Keep the general *Spendly Epic Integration Strategy* section —
      it still governs SPENDLY-101 and 102.
- [ ] Confirm the **next** nightly drift run is green.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `500 Storage is not configured.` on every request | `FIREBASE_PROJECT_ID` not set | Step 4.2 |
| Every request `401`, even a fresh token | Function deployed without `--no-verify-jwt` | Redeploy via the npm script |
| Your own document `403`s | The account doc is not readable as you — usually rules not deployed | Step 1 |
| Upload `200` from the function but the PUT fails | Bucket MIME/size limits, working as intended | Check the real type and size |
| Upload succeeds but nothing appears in the bucket | Wrote to the wrong project | `supabase link --project-ref` |
| Note/document writes denied in-app, rules look right | Published rules are older than you think | Firebase Console → Rules, check the version timestamp |
| Nightly drift job red | Rules not deployed after the merge | Step 1 |
| Rules workflow `403` on `:test` during **dry run** | Known IAM leftover | Expected — see 1.1 |
| Rules workflow `403` on a **real** upload | SA lacks `roles/firebaserules.admin` | Grant it, then re-run |

---

## Rollback

**Rules.** Re-run the deploy workflow from a commit before the merge. The three
collections become denied again. No existing data is touched, and no other
rule changes.

**Supabase.** The bucket and function are additive and referenced by nothing
else in the app. Leaving them costs nothing. Deleting the function makes the
documents feature fail closed, which is the correct direction for a failure. If
you delete the bucket you also delete whatever users have stored in it — prefer
deleting the function.

**App.** Standard release rollback. No migration ran and nothing in this epic
rewrites existing documents, so there is no data state to unwind.

---

## Appendix — what each ticket needs

| Ticket | Rules | Supabase | App build |
|---|:---:|:---:|:---:|
| SPENDLY-79 Statement export | — | — | ✅ |
| SPENDLY-80 Health metrics | — | — | ✅ |
| SPENDLY-81 Running balance | — | — | ✅ |
| SPENDLY-82 Filters | — | — | ✅ |
| SPENDLY-83 Search | — | — | ✅ |
| SPENDLY-84 Monthly statement | — | — | ✅ |
| SPENDLY-85 Spending insights | — | — | ✅ |
| SPENDLY-86 Balance trend | — | — | ✅ |
| **SPENDLY-87 Reconciliation** | ✅ | — | ✅ |
| **SPENDLY-88 Documents** | ✅ | ✅ | ✅ |
| **SPENDLY-89 Notes** | ✅ | — | ✅ |
| SPENDLY-90 Activity statistics | — | — | ✅ |
| SPENDLY-91 Action center | — | — | ✅ |
