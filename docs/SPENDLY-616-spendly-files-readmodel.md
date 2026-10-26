# SPENDLY-616 — spendly-files moves to the read-model Supabase project

**Why.** Account documents (SPENDLY-88) and goal photos (SPENDLY-614) were
stored in the Ganesh Seva Supabase project, because `spendlyFilesClient` used
`env.supabase`. Spendly data should not depend on Ganesh infrastructure.

**What changed**
- `services/accounts/spendlyFilesClient.ts`: the Edge Function URL and the
  signed-upload client now use `env.readModel` (project `spmsgncjbnbkxvsbpqlu`).
  The client is unconfigured in local test mode, as before.
- `package.json`: `supabase:deploy:spendly-files` pins `--project-ref
  spmsgncjbnbkxvsbpqlu`. `supabase/` is linked to Ganesh, so a bare deploy
  would land there.
- `docs/READ_MODEL_RULES.md` R1.1: the `spendly-files` bucket is the one
  documented write exception. It holds non-rebuildable binaries and no tables.
- `docs/SPENDLY_DOCUMENTS_STORAGE.md`: project note plus the cutover order.
- Tests: `services/accounts/spendlyFilesClient.test.ts`.

**Unchanged:** the Edge Function code, bucket SQL, object paths, Firestore
metadata and rules.

**Manual setup (read-model project)**
1. `supabase/spendly-files.bucket-limits.sql`, then
   `supabase/spendly-files.policies.sql` (expect 0 rows).
2. `npm run supabase:deploy:spendly-files`.
3. Secret `FIREBASE_PROJECT_ID=expenseapp-27f94`.
4. Smoke test (runbook Step 4) against the read-model URL.

**Open:** copying objects already in the Ganesh bucket (dry run first, only if
any exist). Account deletion still leaves `spendly-files` objects. Remove the
Ganesh bucket and function only after the cutover.
