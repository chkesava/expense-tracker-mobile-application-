-- RLS posture for the `spendly-files` bucket (SPENDLY-88).
--
-- Run this SECOND, after spendly-files.bucket-limits.sql. Step 2 of
-- docs/SPENDLY_DOCUMENTS_STORAGE.md.
--
-- SAFE TO RUN AT ANY TIME. It grants nothing and revokes nothing that the app
-- relies on, because the app never touches this bucket directly.
--
-- WHY THERE ARE NO POLICIES HERE
-- ------------------------------
-- Firebase Auth is not a Supabase session. Every request the app makes to
-- Supabase arrives as the `anon` role, and the publishable key
-- (EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) is inlined into the release bundle by
-- Metro and is trivially extractable from the APK.
--
-- So there is no identity for an RLS policy to gate on. Any grant to `anon` or
-- `authenticated` on this bucket would be, in effect, a public grant -- over
-- people's bank statements, sanction letters and tax certificates. This is
-- exactly the hole GS-001 documented for `ganesh-files`, and the point of
-- writing this file before a single object exists is to never have it here.
--
-- Instead: RLS is enabled (it already is, on hosted Supabase), no policy grants
-- anything, and the ONLY writer is the service-role key, which bypasses RLS and
-- lives solely inside the `spendly-files` Edge Function. That function verifies
-- the caller's Firebase ID token against Firestore before minting a short-lived
-- signed URL.
--
-- Signed URLs still work with no policies, because a signed URL is validated by
-- Storage itself and does not go through RLS -- which is the whole point of
-- routing every read and write through the Edge Function.
--
-- Do NOT run `alter table storage.objects ...` -- that table is owned by
-- supabase_storage_admin and RLS is already enabled on hosted Supabase.

-- Defensive: drop anything that may have been added by hand in the dashboard
-- while the bucket was being set up. These names are the ones this project
-- would have used; if you created policies under other names, remove them in
-- Storage -> spendly-files -> Policies.

drop policy if exists "spendly_files_insert_users" on storage.objects;
drop policy if exists "spendly_files_select_users" on storage.objects;
drop policy if exists "spendly_files_update_users" on storage.objects;
drop policy if exists "spendly_files_delete_users" on storage.objects;

-- Deliberately no CREATE POLICY statements follow.
--
-- With RLS enabled and no policy granting access, `anon` and `authenticated`
-- can do nothing with this bucket: no list, no select, no insert, no update, no
-- delete.

-- Verify there is nothing granting access to this bucket. Expected: 0 rows.
--
-- This lists every policy on storage.objects mentioning the bucket. A non-empty
-- result means something can reach these objects without going through the Edge
-- Function, and should be removed before the feature is enabled.

select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (qual::text like '%spendly-files%' or with_check::text like '%spendly-files%');

-- Also confirm the bucket is private. A public bucket serves objects without a
-- signed URL and would defeat all of the above.

select id, public
from storage.buckets
where id = 'spendly-files';
