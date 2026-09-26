import { ganeshDrawFunctionUrl, type DrawResponse } from "@/shared/utils/ganeshDrawRemote";
import { getPublicAppOrigin } from "@/shared/utils/paymentRequestUrl";
import { assertNetworkAllowed } from "@/lib/networkGuard";

/**
 * Asks the server to run one draw (KAN-125).
 *
 * The client only asks. It cannot choose the winner, and cannot write the
 * result — Firestore rules deny every client write to `tokenDrawResults`, so a
 * tampered build gets a refusal rather than a crowned token.
 *
 * Unlike the summary client this one waits and surfaces its errors: a draw is
 * an explicit act someone is standing in front of a crowd to perform, so a
 * silent failure is the worst possible outcome.
 */
export async function requestTokenDraw(input: {
  pandalId: string;
  festivalId: string;
  sessionId: string;
}): Promise<DrawResponse> {
  const url = ganeshDrawFunctionUrl(getPublicAppOrigin());
  if (!url) {
    throw new Error("Cannot reach the server. The draw needs a connection.");
  }

  const { getFirebaseAuth } = await import("@/lib/firebase");
  const idToken = await getFirebaseAuth()?.currentUser?.getIdToken();
  if (!idToken) throw new Error("Sign in first.");

  assertNetworkAllowed(url);
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => ({}))) as DrawResponse & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Could not run the draw.");
  }
  return payload;
}
