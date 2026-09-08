import { logError } from "@/lib/errors";
import { ganeshSummaryFunctionUrl } from "@/shared/utils/ganeshSummaryRemote";
import { getPublicAppOrigin } from "@/shared/utils/paymentRequestUrl";

export type SummaryClientMode = "rebuild" | "seed" | "recompute";

async function postFestivalSummary(input: {
  pandalId: string;
  festivalId: string;
  mode: SummaryClientMode;
}): Promise<{ membersWritten?: number; seeded?: boolean; skipped?: boolean }> {
  const url = ganeshSummaryFunctionUrl(getPublicAppOrigin());
  if (!url) {
    throw new Error("Cannot reach the server. Check your connection and try again.");
  }

  const [{ getFirebaseAuth }] = await Promise.all([import("@/lib/firebase")]);
  const user = getFirebaseAuth()?.currentUser;
  const idToken = await user?.getIdToken();
  if (!idToken) throw new Error("Sign in first.");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Could not update festival totals.");
  }
  return payload;
}

/** Fire-and-forget after a ledger write. Never fails the money save. */
export function requestFestivalSummaryRebuild(input: {
  pandalId: string;
  festivalId: string;
  mode?: Exclude<SummaryClientMode, "recompute">;
}): void {
  void postFestivalSummary({
    pandalId: input.pandalId,
    festivalId: input.festivalId,
    mode: input.mode ?? "rebuild",
  }).catch((error) => logError("ganesh.summary.remote", error));
}

/** Create an empty totals doc for a new festival. Failures are logged, not thrown. */
export async function requestFestivalSummarySeed(input: {
  pandalId: string;
  festivalId: string;
}): Promise<void> {
  try {
    await postFestivalSummary({ ...input, mode: "seed" });
  } catch (error) {
    logError("ganesh.summary.seed", error);
  }
}

/** "Recalculate from ledger" — wait and surface errors. */
export async function recomputeFestivalSummaryRemote(
  pandalId: string,
  festivalId: string
): Promise<void> {
  await postFestivalSummary({ pandalId, festivalId, mode: "recompute" });
}
