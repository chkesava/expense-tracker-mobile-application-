import { getPublicAppOrigin } from "@/shared/utils/paymentRequestUrl";
import { assertNetworkAllowed } from "@/lib/networkGuard";

/**
 * Calls the fd-interest-recompute Netlify function right after an FD rate
 * edit, so the detailed interestCredits history catches up immediately
 * instead of waiting for the next fd-interest-daily run. Non-fatal by
 * design: the daily job is the real fallback, so a caller here should treat
 * a thrown error as "it'll catch up within a day," not a failed save.
 */
export async function recomputeFdInterestRemote(
  investmentId: string
): Promise<{ ok: boolean; creditedDays: number }> {
  const origin = getPublicAppOrigin().replace(/\/$/, "");
  const url = origin ? `${origin}/.netlify/functions/fd-interest-recompute` : "";
  if (!url) {
    throw new Error("Cannot reach the server. Check your connection and try again.");
  }

  const [{ getFirebaseAuth }] = await Promise.all([import("@/lib/firebase")]);
  const user = getFirebaseAuth()?.currentUser;
  const idToken = await user?.getIdToken();
  if (!idToken) throw new Error("Sign in first.");

  assertNetworkAllowed(url);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ investmentId }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    ok?: boolean;
    creditedDays?: number;
  };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Could not recalculate right now.");
  }
  return { ok: true, creditedDays: payload.creditedDays ?? 0 };
}
