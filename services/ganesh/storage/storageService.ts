import {
  assertCanUpload,
  assertCanUploadPandalAsset,
  assertCanUploadPandalSponsor,
} from "@/services/ganesh/storage/storageAuth";
import {
  assertOwnedFestivalPath,
  assertOwnedPandalAssetPath,
  assertOwnedPandalSponsorPath,
  buildFestivalFilePath,
  buildPandalAssetPath,
  buildPandalSponsorPath,
  isPandalAssetPath,
  isPandalSponsorPath,
} from "@/services/ganesh/storage/storagePaths";
import {
  BatchUnsupportedError,
  createObjectSignedUrl,
  createObjectSignedUrls,
  removeObject,
  uploadObject,
  type BatchSignedUrl,
} from "@/services/ganesh/storage/supabaseStorage";
import type {
  GaneshFileMeta,
  UploadFestivalFileInput,
  UploadPandalAssetFileInput,
  UploadPandalSponsorFileInput,
} from "@/services/ganesh/storage/storageTypes";

export { assertCanUpload, assertCanUploadPandalAsset, assertCanUploadPandalSponsor } from "@/services/ganesh/storage/storageAuth";
export { ganeshStoredPath } from "@/services/ganesh/storage/storagePaths";
export { prepareGaneshImage } from "@/services/ganesh/storage/imagePrepare";

export async function uploadPandalAssetFile(
  input: UploadPandalAssetFileInput
): Promise<GaneshFileMeta> {
  assertCanUploadPandalAsset({
    uid: input.uid,
    role: input.role,
    permissions: input.permissions,
    memberStatus: input.memberStatus,
    sessionPandalId: input.sessionPandalId,
    pandalId: input.pandalId,
  });
  const path = buildPandalAssetPath({
    pandalId: input.pandalId,
    assetId: input.assetId,
    fileName: input.file.fileName,
  });
  await uploadObject(path, input.file.uri, input.file.mimeType, input.file.bytes);
  return {
    path,
    fileName: path.split("/").pop() ?? input.file.fileName,
    mimeType: input.file.mimeType,
    size: input.file.size,
    uploadedAt: new Date().toISOString(),
    uploadedBy: input.uid,
  };
}

export async function uploadPandalSponsorFile(
  input: UploadPandalSponsorFileInput
): Promise<GaneshFileMeta> {
  assertCanUploadPandalSponsor({
    uid: input.uid,
    role: input.role,
    permissions: input.permissions,
    memberStatus: input.memberStatus,
    sessionPandalId: input.sessionPandalId,
    pandalId: input.pandalId,
  });
  const path = buildPandalSponsorPath({
    pandalId: input.pandalId,
    sponsorId: input.sponsorId,
    fileName: input.file.fileName,
  });
  await uploadObject(path, input.file.uri, input.file.mimeType, input.file.bytes);
  return {
    path,
    fileName: path.split("/").pop() ?? input.file.fileName,
    mimeType: input.file.mimeType,
    size: input.file.size,
    uploadedAt: new Date().toISOString(),
    uploadedBy: input.uid,
  };
}

export async function uploadFestivalFile(input: UploadFestivalFileInput): Promise<GaneshFileMeta> {
  assertCanUpload({
    uid: input.uid,
    role: input.role,
    permissions: input.permissions,
    memberStatus: input.memberStatus,
    sessionPandalId: input.sessionPandalId,
    sessionFestivalId: input.sessionFestivalId,
    pandalId: input.pandalId,
    festivalId: input.festivalId,
    category: input.category,
    festivalBelongsToPandal: input.festivalBelongsToPandal,
  });

  const path = buildFestivalFilePath({
    pandalId: input.pandalId,
    festivalId: input.festivalId,
    category: input.category,
    recordId: input.recordId,
    fileName: input.file.fileName,
  });
  await uploadObject(path, input.file.uri, input.file.mimeType, input.file.bytes);
  return {
    path,
    fileName: path.split("/").pop() ?? input.file.fileName,
    mimeType: input.file.mimeType,
    size: input.file.size,
    uploadedAt: new Date().toISOString(),
    uploadedBy: input.uid,
  };
}

// Must stay at or below the Edge Function's DOWNLOAD_URL_TTL_SECONDS
// (supabase/functions/ganesh-files/index.ts) — a cache TTL longer than the URL's
// real lifetime hands out a link that looks valid but has already expired
// server-side. Kept a minute short of the 5-minute grant as a safety margin.
const SIGNED_URL_CACHE_MS = 4 * 60 * 1000;

/**
 * Hard cap on the signed-URL cache (GS-096).
 *
 * The map had no eviction and no size bound, so in a long-lived session it grew
 * once per distinct file ever previewed and never shrank — a slow leak that
 * only ended when the process did.
 *
 * Entries are short-lived (4 minutes), so almost everything in here is stale
 * almost all of the time; a sweep on write reclaims it without needing a timer.
 * The cap is the backstop for the one case a sweep cannot help: more than 300
 * distinct files previewed inside a single 4-minute window, where every entry
 * is still live. Evicting the soonest-to-expire costs at most one re-mint.
 */
const SIGNED_URL_CACHE_MAX = 300;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * `incoming` is how many entries are about to be written. A single mint writes
 * one; a batch writes up to fifty at once (GS-096), and evicting one entry for
 * fifty insertions would let the map drift past its cap.
 */
function pruneSignedUrlCache(now: number, incoming = 1): void {
  for (const [key, entry] of signedUrlCache) {
    if (entry.expiresAt <= now) signedUrlCache.delete(key);
  }
  // Everything left is still live, so drop whichever expires first, until the
  // insertions ahead of us fit.
  while (signedUrlCache.size + incoming > SIGNED_URL_CACHE_MAX) {
    let oldestKey: string | undefined;
    let oldestExpiry = Infinity;
    for (const [key, entry] of signedUrlCache) {
      if (entry.expiresAt < oldestExpiry) {
        oldestExpiry = entry.expiresAt;
        oldestKey = key;
      }
    }
    if (oldestKey === undefined) return;
    signedUrlCache.delete(oldestKey);
  }
}

/**
 * Batch minting (GS-096).
 *
 * A list view mounts one `GaneshSignedPreview` per visible row and each one
 * asked for its own URL, so a screen of twenty receipts was twenty Edge Function
 * round trips — twenty Firestore membership reads for one answer that does not
 * vary by row.
 *
 * Rather than push batching up into every list (which would mean each screen
 * collecting its own paths, and a component that could no longer be dropped in
 * anywhere), the requests are coalesced down here: calls landing within the same
 * short window become one `downloadBatch`. Components keep asking per path and
 * are unaware; the wire sees one request.
 *
 * The window is deliberately tiny — long enough for one render pass to finish
 * mounting its rows, short enough to be invisible. A single lone request pays it
 * once and is otherwise unchanged.
 */
const SIGNED_URL_BATCH_WINDOW_MS = 20;

/**
 * Must stay at or below MAX_BATCH_PATHS in
 * supabase/functions/ganesh-files/handler.ts — the function rejects a larger
 * batch outright, so exceeding it here would fail every request instead of
 * merely being inefficient. Anything over the cap waits for the next flush.
 */
const SIGNED_URL_BATCH_MAX = 50;

type SignedUrlWaiter = { resolve: (url: string) => void; reject: (error: unknown) => void };

/** Paths asked for but not yet minted, each with everyone waiting on it. */
const pendingSignedUrls = new Map<string, SignedUrlWaiter[]>();
let batchFlushHandle: ReturnType<typeof setTimeout> | null = null;

/**
 * Set once a deployed function answers "Unknown operation" for `downloadBatch`.
 *
 * The app and the Edge Function ship on separate clocks, so a build carrying
 * batching can reach a phone before the function is deployed. When that happens
 * the coalescer keeps working and simply mints one URL per path, exactly as
 * before — the batch is an optimisation, never a requirement for a photo to
 * open. It is latched rather than retried per batch so one probe costs one
 * failed request, not one per screen.
 */
let batchActionUnavailable = false;

/** Exported for tests only. */
export function __signedUrlCacheSize(): number {
  return signedUrlCache.size;
}

/** Exported for tests only — clears cache, in-flight batch and the probe latch. */
export function __resetSignedUrlState(): void {
  signedUrlCache.clear();
  pendingSignedUrls.clear();
  if (batchFlushHandle !== null) {
    clearTimeout(batchFlushHandle);
    batchFlushHandle = null;
  }
  batchActionUnavailable = false;
}

function enqueueSignedUrl(path: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const waiting = pendingSignedUrls.get(path);
    // A second row showing the same photo joins the first row's request instead
    // of adding a duplicate to the batch.
    if (waiting) waiting.push({ resolve, reject });
    else pendingSignedUrls.set(path, [{ resolve, reject }]);
    scheduleSignedUrlFlush();
  });
}

function scheduleSignedUrlFlush(): void {
  // A full batch goes now; waiting out the window would only delay it.
  if (pendingSignedUrls.size >= SIGNED_URL_BATCH_MAX) {
    void flushSignedUrlBatch();
    return;
  }
  if (batchFlushHandle !== null) return;
  batchFlushHandle = setTimeout(() => {
    batchFlushHandle = null;
    void flushSignedUrlBatch();
  }, SIGNED_URL_BATCH_WINDOW_MS);
}

/** One-per-path minting, used before the batch action exists server-side. */
async function mintIndividually(paths: string[]): Promise<BatchSignedUrl[]> {
  return Promise.all(
    paths.map(async (path) => {
      try {
        return { path, signedUrl: await createObjectSignedUrl(path), error: null };
      } catch (error) {
        return {
          path,
          signedUrl: null,
          error: error instanceof Error ? error.message : "Could not open this file.",
        };
      }
    })
  );
}

async function flushSignedUrlBatch(): Promise<void> {
  if (batchFlushHandle !== null) {
    clearTimeout(batchFlushHandle);
    batchFlushHandle = null;
  }

  const batch = [...pendingSignedUrls.keys()].slice(0, SIGNED_URL_BATCH_MAX);
  if (batch.length === 0) return;
  const waiters = batch.map((path) => pendingSignedUrls.get(path) ?? []);
  for (const path of batch) pendingSignedUrls.delete(path);

  let results: BatchSignedUrl[];
  try {
    results = batchActionUnavailable
      ? await mintIndividually(batch)
      : await createObjectSignedUrls(batch);
  } catch (error) {
    if (error instanceof BatchUnsupportedError) {
      batchActionUnavailable = true;
      results = await mintIndividually(batch);
    } else {
      // The request itself failed, so nobody in this batch got an answer.
      for (const group of waiters) {
        for (const waiter of group) waiter.reject(error);
      }
      if (pendingSignedUrls.size > 0) scheduleSignedUrlFlush();
      return;
    }
  }

  pruneSignedUrlCache(Date.now(), results.filter((result) => result.signedUrl).length);
  results.forEach((result, index) => {
    const group = waiters[index] ?? [];
    if (result.signedUrl) {
      // Same expiry policy as a single-path grant — the function mints both with
      // the same TTL, so the cache must not treat them differently.
      signedUrlCache.set(batch[index], {
        url: result.signedUrl,
        expiresAt: Date.now() + SIGNED_URL_CACHE_MS,
      });
      for (const waiter of group) waiter.resolve(result.signedUrl);
      return;
    }
    // A partial failure is this row's failure only; the rest of the batch has
    // already been resolved above.
    const failure = new Error(result.error ?? "Could not open this file.");
    for (const waiter of group) waiter.reject(failure);
  });

  // Anything that arrived while this batch was in flight, or was pushed past the
  // cap, still needs a flush.
  if (pendingSignedUrls.size > 0) scheduleSignedUrlFlush();
}

export async function getSignedUrl(
  path: string,
  expected: { pandalId: string; festivalId?: string }
): Promise<string> {
  if (isPandalAssetPath(path)) {
    assertOwnedPandalAssetPath(path, { pandalId: expected.pandalId });
  } else if (isPandalSponsorPath(path)) {
    assertOwnedPandalSponsorPath(path, { pandalId: expected.pandalId });
  } else {
    if (!expected.festivalId) throw new Error("Select a Pandal and festival first.");
    assertOwnedFestivalPath(path, { pandalId: expected.pandalId, festivalId: expected.festivalId });
  }
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now() + 5_000) return cached.url;
  // Not a request yet — it joins the next batch, which mints it together with
  // every other path asked for in the same window (GS-096). Caching happens
  // there, under the same expiry policy as before.
  return enqueueSignedUrl(path);
}

export async function deleteFile(
  path: string,
  expected: { pandalId: string; festivalId?: string }
): Promise<void> {
  if (isPandalAssetPath(path)) {
    assertOwnedPandalAssetPath(path, { pandalId: expected.pandalId });
  } else if (isPandalSponsorPath(path)) {
    assertOwnedPandalSponsorPath(path, { pandalId: expected.pandalId });
  } else {
    if (!expected.festivalId) throw new Error("Select a Pandal and festival first.");
    assertOwnedFestivalPath(path, { pandalId: expected.pandalId, festivalId: expected.festivalId });
  }
  await removeObject(path);
}
