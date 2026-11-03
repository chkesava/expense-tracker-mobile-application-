# SPENDLY-587 spike: client writes and realtime under Firebase-shaped tokens

**Not a migration.** This is a throwaway prototype of `rm_client_apply` (SPENDLY-669) and the realtime ping (SPENDLY-593). It runs **only against a local Docker Supabase**.

## Run it

```sh
cp -r supabase-readmodel/supabase /tmp/spike/            # a copy, so supabase/.temp stays out of the repo
sed -i 's/^project_id = .*/project_id = "spendly-rm-spike"/' /tmp/spike/supabase/config.toml
cd /tmp/spike && npx supabase start --workdir . -x studio,imgproxy,mailpit,inbucket,storage-api,edge-runtime,logflare,vector,supavisor,postgres-meta
docker exec -i supabase_db_spendly-rm-spike psql -U postgres -d postgres -v ON_ERROR_STOP=1 < <repo>/supabase-readmodel/drills/spike-587/spike.sql
eval "$(npx supabase status --workdir . -o env | grep -E '^(API_URL|ANON_KEY|JWT_SECRET)=')"
SB_URL=$API_URL SB_ANON=$ANON_KEY SB_JWT_SECRET=$JWT_SECRET node <repo>/supabase-readmodel/drills/spike-587/spike.mjs
npx supabase stop --workdir . --no-backup
```

## About the tokens

The tokens are signed HS256 with the **local** JWT secret, but carry exactly a Firebase ID token's claims: `iss`, `aud`, `sub` and `role`, the last added by `readmodel-claims`. They test every database-side rule:
- `readmodel_auth.uid()`;
- the `rm_client_apply` checks;
- `realtime.messages` RLS.

What they **don't** test is Supabase's third-party verification of a real RS256 Firebase token. That is checked on the hosted project when the first collection goes to `shadow` (SPENDLY-593/673).

Result on 2026-11-03: **17/17 passed** (`docs/SPENDLY-586-adr.md` §3).
