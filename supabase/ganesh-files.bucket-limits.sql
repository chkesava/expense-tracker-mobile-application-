-- Bucket-level size and MIME enforcement for `ganesh-files` (GS-036).
--
-- SAFE TO RUN NOW. Unlike ganesh-files.policies.sql, this revokes nothing and
-- breaks nothing: it only refuses uploads the app already refuses on the
-- client. It is Step 1 of docs/GANESH_STORAGE_LOCKDOWN.md, which is independent
-- of the rest of that rollout and was skipped when the lockdown was done out of
-- order.
--
-- WHY THIS IS THE ENFORCEMENT, AND THE EDGE FUNCTION IS NOT
-- Bytes never pass through the `ganesh-files` Edge Function. It mints a signed
-- *upload* URL and the client sends the file straight to Storage, so the
-- function cannot weigh a file or observe its real content-type — it only sees
-- what the client claims. The function does reject an obviously-bad claim early
-- (a clearer error, and no URL minted), but a crafted client simply declares
-- `image/jpeg` and uploads whatever it likes.
--
-- These two columns are what Storage itself applies to the real upload, so they
-- are the only server-side check that a hostile client cannot talk its way past.
--
-- WHAT IT PREVENTS
-- Without them, anyone able to obtain a signed upload URL can store executables
-- or HTML under `pandals/**` — a stored-XSS vector if a signed URL is ever
-- opened in a WebView — or multi-gigabyte files, at your expense.
--
-- The values mirror services/ganesh/storage/storageTypes.ts. Keep them in step:
--   MAX_UPLOAD_BYTES   = 5 * 1024 * 1024   -> file_size_limit
--   ALLOWED_IMAGE_TYPES = jpeg, png, webp  -> allowed_mime_types
-- The client checks in imageRules.ts stay as they are — they give immediate
-- feedback before a slow upload, which a server check cannot.

update storage.buckets
set
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'ganesh-files';

-- Verify. Expected: public = false, file_size_limit = 5242880,
-- allowed_mime_types = {image/jpeg,image/png,image/webp}.
--
-- `public` matters as much as the other two: a public bucket serves objects
-- without a signed URL, which would defeat the whole Edge Function model.

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'ganesh-files';

-- If `update` is refused because storage.buckets is owned by
-- supabase_storage_admin, set both fields in the dashboard instead:
-- Storage -> ganesh-files -> Configuration -> File size limit / Allowed MIME
-- types. The values are the same either way.
