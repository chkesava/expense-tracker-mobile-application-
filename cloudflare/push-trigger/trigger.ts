/**
 * SPENDLY-716: starts the push reminders job (.github/workflows/push-reminders.yml)
 * through GitHub's run-workflow API. GitHub's own schedule runs hours late or not
 * at all in this repository; a Cloudflare cron trigger fires on time and a
 * dispatched run starts within seconds.
 *
 * The run is marked `trigger: cron`, so it still obeys the repository variable
 * PUSH_REMINDERS_ENABLED (the emergency stop). Nothing is retried: the next tick
 * tries again, and the job's idempotency makes a double run harmless.
 */

export type TriggerEnv = {
  /** Fine-grained GitHub token: this repository only, Actions read and write. A Worker secret. */
  GITHUB_DISPATCH_TOKEN?: string;
};

export const DISPATCH_TARGET = {
  repo: "chkesava/expense-tracker-mobile-application-",
  workflow: "push-reminders.yml",
  ref: "main",
} as const;

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ status: number; text(): Promise<string> }>;

export type DispatchResult = { ok: true; status: number } | { ok: false; status: number | null; reason: string };

export function dispatchRequest(token: string) {
  return {
    url: `https://api.github.com/repos/${DISPATCH_TARGET.repo}/actions/workflows/${DISPATCH_TARGET.workflow}/dispatches`,
    init: {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "spendly-push-trigger",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      // Workflow inputs are strings in the API, booleans included.
      body: JSON.stringify({ ref: DISPATCH_TARGET.ref, inputs: { dry_run: "false", trigger: "cron" } }),
    },
  };
}

/** One dispatch. Logs the outcome; never logs the token. */
export async function dispatchPushReminders(env: TriggerEnv, fetchFn: FetchLike, log: (line: string) => void): Promise<DispatchResult> {
  const token = env.GITHUB_DISPATCH_TOKEN?.trim();
  if (!token) {
    log("push-trigger: GITHUB_DISPATCH_TOKEN is not set; nothing dispatched");
    return { ok: false, status: null, reason: "no-token" };
  }
  const { url, init } = dispatchRequest(token);
  try {
    const res = await fetchFn(url, init);
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status };
    const detail = (await res.text().catch(() => "")).replaceAll(token, "[token]").slice(0, 300);
    log(`push-trigger: GitHub answered ${res.status}: ${detail}`);
    return { ok: false, status: res.status, reason: "http" };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).replaceAll(token, "[token]");
    log(`push-trigger: dispatch failed: ${message}`);
    return { ok: false, status: null, reason: "network" };
  }
}
