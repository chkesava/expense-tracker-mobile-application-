-- Apply in the Supabase SQL editor for the project that owns the ganesh-files bucket.
-- Keep the bucket PRIVATE (public = false). Do not convert it to a public bucket.
--
-- Do NOT run ALTER TABLE storage.objects — that table is owned by
-- supabase_storage_admin. RLS is already enabled on hosted Supabase.
-- If CREATE POLICY is also refused, add the same rules in
-- Storage → ganesh-files → Policies instead of this file.
--
-- Firebase Auth is not a Supabase session. These policies let the Expo publishable
-- key read/write only under pandals/. Application RBAC still runs first in the app.
-- Anyone who extracts the publishable key from the APK can call Storage — that is
-- the Option A limitation until a backend mints signed uploads.

drop policy if exists "ganesh_files_insert_pandals" on storage.objects;
drop policy if exists "ganesh_files_select_pandals" on storage.objects;
drop policy if exists "ganesh_files_update_pandals" on storage.objects;
drop policy if exists "ganesh_files_delete_pandals" on storage.objects;

create policy "ganesh_files_insert_pandals"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'ganesh-files'
  and split_part(name, '/', 1) = 'pandals'
);

create policy "ganesh_files_select_pandals"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'ganesh-files'
  and split_part(name, '/', 1) = 'pandals'
);

create policy "ganesh_files_update_pandals"
on storage.objects
for update
to anon, authenticated
using (
  bucket_id = 'ganesh-files'
  and split_part(name, '/', 1) = 'pandals'
)
with check (
  bucket_id = 'ganesh-files'
  and split_part(name, '/', 1) = 'pandals'
);

create policy "ganesh_files_delete_pandals"
on storage.objects
for delete
to anon, authenticated
using (
  bucket_id = 'ganesh-files'
  and split_part(name, '/', 1) = 'pandals'
);
