-- Bucket creation, size and MIME enforcement for `spendly-files` (SPENDLY-88).
--
-- Run this FIRST. Step 1 of docs/SPENDLY_DOCUMENTS_STORAGE.md.
--
-- Unlike ganesh-files, there is no existing bucket and nothing in the field to
-- break: no build has ever uploaded an account document, so creating this
-- locked down from the start costs nothing and avoids repeating the GS-001
-- rollout, where policies were tightened after a permissive bucket was already
-- live.
--
-- `public = false` is the load-bearing line. A public bucket serves objects to
-- anyone with the object path and no signed URL at all, which would make the
-- Edge Function, the RLS policies and the Firestore ownership check
-- simultaneously pointless. These are people's bank statements.
--
-- WHY THESE TWO COLUMNS ARE THE ENFORCEMENT, AND THE EDGE FUNCTION IS NOT
-- Bytes never pass through the `spendly-files` Edge Function. It mints a signed
-- *upload* URL and the client sends the file straight to Storage, so the
-- function cannot weigh a file or observe its real content-type -- it only sees
-- what the client claims. The function does reject an obviously-bad claim early
-- (a clearer error, and no URL minted), but a crafted client simply declares
-- `application/pdf` and uploads whatever it likes.
--
-- WHAT IT PREVENTS
-- Without them, anyone able to obtain a signed upload URL can store executables
-- or HTML under `users/**` -- a stored-XSS vector if a signed URL is ever opened
-- in a WebView -- or multi-gigabyte files, at your expense.
--
-- The values mirror shared/utils/accountDocuments.ts. Keep them in step:
--   MAX_DOCUMENT_BYTES      = 10 * 1024 * 1024  -> file_size_limit
--   ALLOWED_DOCUMENT_TYPES  = pdf, jpeg, png, webp -> allowed_mime_types
-- The client checks in `documentRejectionReason` stay as they are -- they give
-- immediate feedback before a slow upload, which a server check cannot.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'spendly-files',
  'spendly-files',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Verify. Expected: public = false, file_size_limit = 10485760,
-- allowed_mime_types = {application/pdf,image/jpeg,image/png,image/webp}.

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'spendly-files';

-- If the insert is refused because storage.buckets is owned by
-- supabase_storage_admin, create the bucket in the dashboard instead:
-- Storage -> New bucket -> name `spendly-files`, Public OFF, then
-- Configuration -> File size limit / Allowed MIME types. Same values either way.
