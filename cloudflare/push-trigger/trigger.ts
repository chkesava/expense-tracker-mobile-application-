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

/** The push reminders tick (wrangler.toml). */
export const PUSH_CRON = "*/15 * * * *";
/**
 * SPENDLY-729: the daily jobs that replace the legacy site's crons (682), at
 * 03:00 UTC (08:30 IST), the legacy crons' own slot. Each run is marked
 * `trigger: cron`, so it does nothing until its repository variable
 * (SIP_DAILY_ENABLED, BILL_DAILY_ENABLED) is "true".
 */
export const DAILY_CRON = "0 3 * * *";
// SPENDLY-739: subscription-daily first, so a charge posted today is in place before bills settle.
export const DAILY_WORKFLOWS = ["category-daily.yml", "subscription-daily.yml", "sip-daily.yml", "epf-daily.yml", "bill-daily.yml", "housekeeping-daily.yml", "snapshot-daily.yml", "recurring-weekly.yml", "insights-daily.yml"] as const;
export type DispatchWorkflow = typeof DISPATCH_TARGET.workflow | (typeof DAILY_WORKFLOWS)[number];

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ status: number; text(): Promise<string> }>;

export type DispatchResult = { ok: true; status: number } | { ok: false; status: number | null; reason: string };

export function dispatchRequest(token: string, workflow: DispatchWorkflow = DISPATCH_TARGET.workflow) {
  return {
    url: `https://api.github.com/repos/${DISPATCH_TARGET.repo}/actions/workflows/${workflow}/dispatches`,
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

/** One dispatch of the push reminders job. Logs the outcome; never logs the token. */
export async function dispatchPushReminders(env: TriggerEnv, fetchFn: FetchLike, log: (line: string) => void): Promise<DispatchResult> {
  return dispatchWorkflow(env, fetchFn, log, DISPATCH_TARGET.workflow);
}

/** SPENDLY-729: which workflows a cron tick starts. Unknown crons start nothing. */
export function workflowsForCron(cron: string | undefined): DispatchWorkflow[] {
  if (cron === DAILY_CRON) return [...DAILY_WORKFLOWS];
  if (cron === PUSH_CRON || cron === undefined) return [DISPATCH_TARGET.workflow];
  return [];
}

/** Every workflow for this tick, one dispatch each (independent: one failing doesn't stop the other). */
export async function dispatchForCron(cron: string | undefined, env: TriggerEnv, fetchFn: FetchLike, log: (line: string) => void): Promise<DispatchResult[]> {
  const targets = workflowsForCron(cron);
  if (!targets.length) log(`push-trigger: no workflow for cron "${cron}"`);
  return Promise.all(targets.map((workflow) => dispatchWorkflow(env, fetchFn, log, workflow)));
}

/** One dispatch. Logs the outcome; never logs the token. */
export async function dispatchWorkflow(env: TriggerEnv, fetchFn: FetchLike, log: (line: string) => void, workflow: DispatchWorkflow): Promise<DispatchResult> {
  const token = env.GITHUB_DISPATCH_TOKEN?.trim();
  if (!token) {
    log("push-trigger: GITHUB_DISPATCH_TOKEN is not set; nothing dispatched");
    return { ok: false, status: null, reason: "no-token" };
  }
  const { url, init } = dispatchRequest(token, workflow);
  try {
    const res = await fetchFn(url, init);
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status };
    const detail = (await res.text().catch(() => "")).replaceAll(token, "[token]").slice(0, 300);
    log(`push-trigger: GitHub answered ${res.status} for ${workflow}: ${detail}`);
    return { ok: false, status: res.status, reason: "http" };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).replaceAll(token, "[token]");
    log(`push-trigger: dispatch of ${workflow} failed: ${message}`);
    return { ok: false, status: null, reason: "network" };
  }
}
