-- LOCKED-DOWN replacement for ganesh-files.policies.sql (GS-001).
--
-- DO NOT RUN THIS YET. Running it revokes all client access to the bucket, so
-- every photo feature breaks until an app build that goes through the
-- `ganesh-files` Edge Function is in users' hands. Follow the ordered rollout in
-- docs/GANESH_STORAGE_LOCKDOWN.md — this is Step 5, not Step 1.
--
-- WHAT CHANGES
-- The previous policies granted `anon, authenticated` insert/select/update/delete
-- over every object under `pandals/`, with no identity check of any kind. Since
-- Firebase Auth is not a Supabase session, every app request arrives as `anon`,
-- and the publishable key is bundled into the APK — so those grants were, in
-- effect, public.
--
-- This file grants nothing to anyone. The only writer left is the service-role
-- key, which bypasses RLS entirely and lives solely inside the Edge Function.
-- That function verifies the caller's Firebase ID token against Firestore before
-- minting a short-lived signed URL.
--
-- Do NOT run ALTER TABLE storage.objects — that table is owned by
-- supabase_storage_admin and RLS is already enabled on hosted Supabase. If
-- CREATE/DROP POLICY is refused, remove the four policies by name in
-- Storage → ganesh-files → Policies instead.

drop policy if exists "ganesh_files_insert_pandals" on storage.objects;
drop policy if exists "ganesh_files_select_pandals" on storage.objects;
drop policy if exists "ganesh_files_update_pandals" on storage.objects;
drop policy if exists "ganesh_files_delete_pandals" on storage.objects;

-- Deliberately no CREATE POLICY statements follow.
--
-- With RLS enabled and no policy granting access, `anon` and `authenticated` can
-- do nothing with this bucket: no list, no select, no insert, no update, no
-- delete. Signed URLs still work, because a signed URL is validated by Storage
-- itself and does not go through RLS — which is the whole point of routing every
-- read and write through the Edge Function.
--
-- Verify afterwards with the checks in docs/GANESH_STORAGE_LOCKDOWN.md. In
-- particular, confirm the bucket's `public` flag is false: a public bucket serves
-- objects without a signed URL and would make all of this moot.
--
--   select id, name, public, file_size_limit, allowed_mime_types
--   from storage.buckets
--   where id = 'ganesh-files';
--
-- Expected: public = false, file_size_limit set, allowed_mime_types set to the
-- three image types the app prepares (GS-036 — these are enforced only on the
-- client today).
