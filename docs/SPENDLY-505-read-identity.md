# SPENDLY-505: read identity (Firebase → Supabase) and RLS

[SPENDLY-505](https://kesavach.atlassian.net/browse/SPENDLY-505) is part of the SPENDLY-494 epic.

- Branch: `feature/SPENDLY-505-firebase-identity-supabase-reads`, cut from the epic branch after it was synced with `main` on 2026-10-22.
- Decision record: ADR §7 (`docs/SPENDLY-494-adr.md`).

## Spike result: option 1 (third-party auth) is chosen

The broker fallback (option 2) is **not needed**.

| Question | Finding |
|---|---|
| Can a Firebase ID token be a Supabase identity without Blaze? | **Yes.** Supabase third-party auth verifies the token against Firebase's public keys. The token must carry the custom claim `role: "authenticated"`; without it, the request runs as `anon`. Setting a custom claim only needs the Admin SDK, which a Netlify function already has (`FIREBASE_SERVICE_ACCOUNT`, used by `delete-account`). No Cloud Functions, Identity Platform or Blaze needed |
| Can the policy layer be proven without Docker / local Supabase? | **Yes.** Docker isn't available here. RLS runs inside Postgres, so `rls_behaviour.sql` impersonates PostgREST exactly: `SET ROLE` plus `request.jwt.claims`. That runs on plain Postgres in CI and on a local throwaway cluster |
| What can only the live gateway prove? | That Supabase rejects tokens not signed by Firebase (forged or malformed) and ones that expired or are for another issuer. `scripts/readmodel-identity-check.ts` checks this live, read-only, after the setup below |
| Why not the broker? | It would put every read through Netlify Free's 300 credits per month. When those run out, the web app pauses too (ADR §7) |

**A note on "another Firebase project's token":** every Firebase project's ID tokens are signed by the **same** Google keys. A token for another project therefore has a valid signature, and only the `iss`/`aud` check stops it. Two layers enforce this:
- Supabase checks the issuer against the configured project.
- `readmodel_auth.uid()` re-checks `iss` and `aud` itself, as defence in depth. The behaviour tests cover it.

## What was built

| Piece | File | What it guarantees |
|---|---|---|
| Read policies | `supabase-readmodel/supabase/migrations/20261022000000_readmodel_read_policies.sql` | See the policy rules below |
| Identity helper | `readmodel_auth.uid()`, in the same migration | Returns the token's `sub` **only** when `iss` and `aud` are `expenseapp-27f94`, `role` is `authenticated`, `exp` is in the future and `sub` is non-empty and not a duress uid. Otherwise it returns null, and null matches no row. `anon` can't call it |
| Claims function | `netlify/functions/readmodel-claims.ts` | See the claims rules below |
| App client | `lib/readModelClient.ts` (`connectReadModel(user)`) | Sends the Firebase ID token through supabase-js `accessToken`, with the publishable key only. It returns **no client** when the read model isn't configured, in a local test build, when signed out, in a duress session, or when the claim can't be obtained. The caller (SPENDLY-511) treats no client as "use Firestore" |
| Env | `lib/env.ts`, `.env.example` | `EXPO_PUBLIC_READMODEL_SUPABASE_URL` and `EXPO_PUBLIC_READMODEL_SUPABASE_PUBLISHABLE_KEY`, both public by design. The storage client (`lib/supabase.ts`) is untouched |
| Live check | `scripts/readmodel-identity-check.ts` | Read-only GETs with the publishable key: no token, a forged Firebase-shaped token, a malformed token, and optionally a real token (own rows only) |

**Policy rules:**
- `authenticated` gets SELECT on the 10 Wave 1 tables, own uid only, and never tombstoned rows (`source_deleted`).
- It also gets SELECT on its own `sync_status` rows, which the "last synced" labels need.
- No insert, update or delete grant or policy exists for any client role.
- `anon` holds nothing.
- `sync_runs`, `sync_checkpoints` and `sync_failures` stay server-only.

**Claims rules:**
- `verifyIdToken(token, true)`, so revoked tokens are refused.
- The uid comes from the token only; a uid in the request body is ignored.
- It keeps the claims the user already has, writes nothing if the role is already set, refuses a duress-shaped uid, and stays under Firebase's 1,000-byte claims limit.

## Duress

A duress session runs under the **real** Firebase user (`createDuressUser` only proxies the uid), so its ID token is the real user's. The server can't tell the two apart, just as Firestore can't.

The guarantee therefore sits in the app, at the same level as today's Firestore duress isolation: `connectReadModel` receives the Auth context `user`. In duress that is the proxy, whose uid ends in `_duress`, so `connect` refuses without making any network call. Switching into duress drops the real user's cached client.

The database adds a second layer: a `*_duress` subject never matches any row.

## Revocation

- The broker path would check revocation on every call. The third-party path can't: Supabase verifies the signature and expiry only.
- **The maximum exposure after revoking a user, or signing them out everywhere, is the remaining lifetime of a token they already hold: at most 1 hour.**
- The claims function itself checks revocation, so a revoked user can't get the claim (re)issued.

## Tests

| Test | Proves |
|---|---|
| `supabase-readmodel/tests/rls_behaviour.sql` (CI and local) | User A sees exactly their 2 live rows per table: not B's, not the tombstone, not the duress tree. B sees only B. See the claims and denials below |
| `supabase-readmodel/tests/assert_security.sql` (updated) | `anon` holds no grants. `authenticated` holds only SELECT, only on the 11 readable tables. Exactly 11 policies, all SELECT, for authenticated, keyed on `readmodel_auth.uid()`. The helper isn't executable by `anon`. New tables still get no grants |
| `scripts/readmodelMigrations.test.ts` (updated) | Statically: policies are SELECT for authenticated only, no write grants to client roles, and no grant of any kind to `anon` |
| `netlify/functions/readmodel-claims.test.ts` (6) | Sets the claim for the verified uid and keeps existing claims; idempotent; 401 for missing, malformed, forged, expired or revoked tokens; ignores a body uid; 403 for a duress uid; CORS and method handling |
| `lib/readModelClient.test.ts` (7) | Uses the ID token as the access token; asks for the claim once, then force-refreshes; no client without the claim; duress gets no client and makes no network call; test mode, unconfigured and signed-out; per-user caching, dropped on sign-out, user change or duress |
| `shared/utils/readModelIdentity.test.ts` (8) | Claim merge, idempotence and size limit; role match; bearer parsing; access decision |
| `scripts/readmodelSecrets.test.ts` (updated) | Only the two publishable read-model names may be `EXPO_PUBLIC_`. No `sb_secret_` key, no JWT whose payload says `service_role`, and no `serviceRole:` option anywhere in the app source or `.env.example` |
| `scripts/readmodelIdentityCheck.test.ts` (3) | The forged token has the right shape; the leak criterion; the script only ever reads |

**In `rls_behaviour.sql`, these claims return zero rows:**
- another project's `iss` or `aud`;
- an expired or non-numeric `exp`;
- a missing or `anon` role;
- an empty or missing `sub`;
- a duress `sub`;
- no claims at all.

**And these are denied:**
- every insert, update and delete by `authenticated`, on all 14 tables;
- `authenticated` reading the sync bookkeeping;
- `anon` reading anything, even holding a valid user's claims.

**The tests catch real mistakes.** I broke the policy six ways on a copy, and every break failed:

| Break | Caught by |
|---|---|
| Dropped the tombstone filter | behaviour test |
| Dropped the `aud` check | behaviour test |
| Dropped the `exp` check | behaviour test |
| Dropped the duress check | behaviour test |
| `using (true)` | assertions |
| Granted INSERT | assertions |

**Results (2026-10-22):**
- The SQL chain (bootstrap → both migrations → assertions → behaviour → assertions) passes on a local Postgres 18 throwaway cluster.
- `npm test`: 400 files, 5,818 tests, all passing.
- `typecheck:shared` passes.
- Full `tsc` passes.

## Setup still needed (the user, in this order)

None of this is done yet, and nothing is deployed.

1. **Apply the migration** to the read-model project `spmsgncjbnbkxvsbpqlu`. In the SQL editor, run `20261022000000_readmodel_read_policies.sql`. Then verify:
   ```sql
   select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' order by 1;
   ```
   Expect 11 rows, all SELECT, all `{authenticated}`.
2. **Enable Firebase third-party auth:** Supabase dashboard → Authentication → Sign In / Providers → Third-Party Auth → **Firebase**, project id `expenseapp-27f94`.
3. **Netlify:** the function deploys with the next web deploy from `main`. It reuses the existing `FIREBASE_SERVICE_ACCOUNT` variable; there is no new secret.
4. **App env:** set `EXPO_PUBLIC_READMODEL_SUPABASE_URL` and `EXPO_PUBLIC_READMODEL_SUPABASE_PUBLISHABLE_KEY` in EAS/GitHub. Nothing reads them until SPENDLY-511.
5. **Live check, read-only:**
   ```
   READMODEL_SUPABASE_URL=https://spmsgncjbnbkxvsbpqlu.supabase.co READMODEL_SUPABASE_PUBLISHABLE_KEY=<publishable> npx tsx scripts/readmodel-identity-check.ts
   ```
   No token, a forged token and a malformed token must all show PASS. The real-token case runs once a token with the claim exists, after step 3.

## Rollback

Any one of these is enough:
- In Supabase: `revoke select on all tables in schema public from authenticated;`. Every client read is then denied.
- Disable the Firebase third-party provider.
- Leave the app env vars empty. `connectReadModel` then returns no client, and screens stay on Firestore.

The custom claim is harmless on its own: nothing in Firestore rules reads `token.role`.

## Not done / open

- The live check (step 5) and the user's security review of the policies, both of which the Definition of Done requires.
- Device QA isn't applicable yet: no screen uses the read model until SPENDLY-511.
