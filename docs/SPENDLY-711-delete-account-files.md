# SPENDLY-711: Account deletion removes the user's `spendly-files` objects

**Branch:** `fix/SPENDLY-711-delete-account-files`, from `main` at `68d06807`.

**Worktree:** `C:\dev\worktrees\spendly-711`.

**Blocks:** SPENDLY-298, the tax document center (epic SPENDLY-288, decision D6).

## Problem

`delete-account` erased the Firestore trees and the read-model rows, but not the binaries in the private Storage bucket `spendly-files`: account documents and goal photos. They outlived the account, with nothing to remove them. Tax documents (Form 16, AIS, 26AS) will live in the same bucket.

## Change

**New phase `files`,** in `shared/utils/deleteAccountRemote.ts`, after `duress-tree` and before `readmodel` and `auth`:

```
shared → ganesh → user-tree → duress-tree → files → readmodel → auth → complete
```

**The sweep:** `netlify/functions/_spendlyFilesPurge.ts`, function `purgeUserFiles(uid, env, { deadlineMs })`.
- **Scope:** it lists `users/{uid}` and `users/{uid}_duress` through the Storage REST API (`POST /storage/v1/object/list/spendly-files`), one folder level at a time, 1000 per page. It deletes in batches of up to 1000 (`DELETE /storage/v1/object/spendly-files`).
- **Credentials:** it uses the read-model service role, the same settings as the read-model purge. The key lives only in the Netlify environment.
- **Path safety:** every path must sit strictly inside one of the account's two folders (`isOwnFilePath`), or the phase throws. The uid comes from the verified ID token, never the request, and must contain no `/` or surrounding spaces.
- **Budget:** the sweep stops at the phase budget (7 s). The phase reports `done` only when both folders were listed in full and held nothing, so a big account just runs the phase again; a fresh listing finds only what is left.
- **Fails closed:** missing settings throw `ReadModelPurgeNotConfigured` (the same user message as the read-model purge), and an HTTP error or a malformed listing throws without provider detail. Either way the phase fails, and the still-signed-in user retries.

**The `auth` phase** runs the sweep again before `deleteUser`. If anything was left (a client that skipped `files`), it clears it and stays on `auth` for one more call. The login is never deleted with files remaining.

**Counts:** `DeleteCounts.files` reports objects removed. The client (`services/deleteAccountClient.ts`) adds it up across phases.

**Docs:** `docs/SPENDLY_DOCUMENTS_STORAGE.md` has a new section, "Account deletion".

## Tests

`netlify/functions/spendlyFilesPurge.test.ts` (new) runs against a fake Storage API with folder-level listing, paging and a delete limit. It covers:
- removing both folders' files, and nobody else's (`users/u10`, `users/u1x`, `users/u2` untouched);
- an empty account: done at once, and repeatable;
- paging past 1000 and deleting in batches of at most 1000;
- the deadline: a partial run, then convergence;
- an outage (no provider detail; retry works), a malformed listing, and missing settings (no request made);
- path safety and uid checks;
- the wiring: the phase order, the label and the count, the verified uid with the phase budget, `finished = files.done`, and `auth` checking files before `deleteUser`.

Updated: `netlify/functions/readmodelPurge.test.ts` and `shared/utils/deleteAccountRemote.test.ts` (the phase order).

## Deploy

- **Netlify:** the change ships with the next web deploy, which redeploys the functions. No new environment variable is needed: it uses `READMODEL_SUPABASE_URL` and `READMODEL_SUPABASE_SERVICE_ROLE_KEY`, already set for the read-model purge.
- **Old app builds:** they keep working. They don't know the `files` phase, but the server always returns the next phase and the client follows it. Their status line is blank during that one step.
- **Existing orphans:** objects left by accounts deleted before this change are not touched. Finding them would need a one-off dry-run report and approval.
