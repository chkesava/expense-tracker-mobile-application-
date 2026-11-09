import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  DAILY_CRON,
  DAILY_WORKFLOWS,
  DISPATCH_TARGET,
  PUSH_CRON,
  dispatchForCron,
  dispatchPushReminders,
  dispatchRequest,
  workflowsForCron,
  type FetchLike,
} from "./trigger";

const TOKEN = "github_pat_secret_value_123";
const root = join(__dirname, "..", "..");

describe("dispatchRequest (SPENDLY-716)", () => {
  it("asks GitHub to run push-reminders.yml on main as a real, cron-marked run", () => {
    const { url, init } = dispatchRequest(TOKEN);
    expect(url).toBe(
      "https://api.github.com/repos/chkesava/expense-tracker-mobile-application-/actions/workflows/push-reminders.yml/dispatches"
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.headers["User-Agent"]).toBeTruthy();
    expect(JSON.parse(init.body)).toEqual({ ref: "main", inputs: { dry_run: "false", trigger: "cron" } });
  });
});

describe("dispatchPushReminders", () => {
  const respond = (status: number, text = ""): FetchLike => vi.fn(async () => ({ status, text: async () => text }));

  it("succeeds on GitHub's 204 and logs nothing", async () => {
    const log = vi.fn();
    const fetchFn = respond(204);
    expect(await dispatchPushReminders({ GITHUB_DISPATCH_TOKEN: ` ${TOKEN} ` }, fetchFn, log)).toEqual({ ok: true, status: 204 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it("does nothing without a token", async () => {
    const log = vi.fn();
    const fetchFn = respond(204);
    expect(await dispatchPushReminders({}, fetchFn, log)).toMatchObject({ ok: false, reason: "no-token" });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("GITHUB_DISPATCH_TOKEN is not set"));
  });

  it("reports an HTTP failure once, without retrying and without the token", async () => {
    const log = vi.fn();
    const fetchFn = respond(401, `Bad credentials for ${TOKEN}`);
    expect(await dispatchPushReminders({ GITHUB_DISPATCH_TOKEN: TOKEN }, fetchFn, log)).toEqual({ ok: false, status: 401, reason: "http" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0]?.[0]);
    expect(line).toContain("401");
    expect(line).not.toContain(TOKEN);
  });

  it("reports a network failure without the token", async () => {
    const log = vi.fn();
    const fetchFn: FetchLike = vi.fn(async () => {
      throw new Error(`socket closed (${TOKEN})`);
    });
    expect(await dispatchPushReminders({ GITHUB_DISPATCH_TOKEN: TOKEN }, fetchFn, log)).toMatchObject({ ok: false, reason: "network" });
    expect(String(log.mock.calls[0]?.[0])).not.toContain(TOKEN);
  });
});

describe("contract: Worker, wrangler.toml and the workflow agree", () => {
  const workflow = readFileSync(join(root, ".github", "workflows", DISPATCH_TARGET.workflow), "utf8");
  const wrangler = readFileSync(join(__dirname, "wrangler.toml"), "utf8");

  it("the workflow accepts the inputs the Worker sends", () => {
    expect(workflow).toMatch(/workflow_dispatch:\s*\n\s*inputs:/);
    expect(workflow).toMatch(/\n\s{6}dry_run:\s*\n/);
    expect(workflow).toMatch(/\n\s{6}trigger:[\s\S]*?options:\s*\n\s*- manual\s*\n\s*- cron/);
  });

  it("Worker runs obey PUSH_REMINDERS_ENABLED, the emergency stop", () => {
    const condition = workflow.match(/\n\s{4}if: (.+)\n/)?.[1] ?? "";
    expect(condition).toContain("vars.PUSH_REMINDERS_ENABLED == 'true'");
    expect(condition).toContain("inputs.trigger != 'cron'");
    // The bare dispatch bypass (any dispatch runs) must not come back.
    expect(condition).not.toMatch(/^github\.event_name == 'workflow_dispatch' \|\|/);
  });

  it("the Worker fires every 15 minutes (push) and daily at 03:00 UTC (682 jobs), and exposes no URL", () => {
    expect(wrangler).toContain(`crons = ["${PUSH_CRON}", "${DAILY_CRON}"]`);
    expect(wrangler).toMatch(/workers_dev = false/);
    expect(wrangler).not.toMatch(/^\s*routes?\s*=/m);
  });
});

describe("daily jobs (SPENDLY-729)", () => {
  const respond = (status: number): FetchLike => vi.fn(async () => ({ status, text: async () => "" }));

  it("each cron starts its own workflows; an unknown cron starts nothing", () => {
    expect(workflowsForCron(PUSH_CRON)).toEqual(["push-reminders.yml"]);
    expect(workflowsForCron(DAILY_CRON)).toEqual(["subscription-daily.yml", "sip-daily.yml", "epf-daily.yml", "bill-daily.yml", "snapshot-daily.yml"]);
    expect(workflowsForCron("5 4 * * *")).toEqual([]);
  });

  it("the daily tick dispatches every daily job as a real cron-marked run", async () => {
    const fetchFn = respond(204);
    const results = await dispatchForCron(DAILY_CRON, { GITHUB_DISPATCH_TOKEN: TOKEN }, fetchFn, vi.fn());
    expect(results).toEqual(Array.from({ length: 5 }, () => ({ ok: true, status: 204 })));
    const calls = (fetchFn as unknown as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls;
    expect(calls.map(([url]) => url.split("/workflows/")[1])).toEqual(["subscription-daily.yml/dispatches", "sip-daily.yml/dispatches", "epf-daily.yml/dispatches", "bill-daily.yml/dispatches", "snapshot-daily.yml/dispatches"]);
    for (const [, init] of calls) expect(JSON.parse(init.body)).toEqual({ ref: "main", inputs: { dry_run: "false", trigger: "cron" } });
  });

  it("one failing dispatch doesn't stop the others", async () => {
    let n = 0;
    const fetchFn: FetchLike = vi.fn(async () => ({ status: n++ === 0 ? 500 : 204, text: async () => "" }));
    const results = await dispatchForCron(DAILY_CRON, { GITHUB_DISPATCH_TOKEN: TOKEN }, fetchFn, vi.fn());
    expect(results.map((r) => r.ok).sort()).toEqual([false, true, true, true, true]);
  });

  it("the 15-minute tick still only starts push reminders", async () => {
    const fetchFn = respond(204);
    await dispatchForCron(PUSH_CRON, { GITHUB_DISPATCH_TOKEN: TOKEN }, fetchFn, vi.fn());
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  // Line endings normalised, so this holds on a Windows (CRLF) checkout too (cf. SPENDLY-720).
  for (const [workflow, flag] of [
    ["subscription-daily.yml", "SUBSCRIPTION_DAILY_ENABLED"],
    ["sip-daily.yml", "SIP_DAILY_ENABLED"],
    ["epf-daily.yml", "EPF_DAILY_ENABLED"],
    ["bill-daily.yml", "BILL_DAILY_ENABLED"],
    ["snapshot-daily.yml", "SNAPSHOT_DAILY_ENABLED"],
  ] as const) {
    it(`${workflow} accepts the Worker's inputs and its cron runs obey ${flag}`, () => {
      expect(DAILY_WORKFLOWS).toContain(workflow);
      const text = readFileSync(join(root, ".github", "workflows", workflow), "utf8").replace(/\r\n/g, "\n");
      expect(text).toMatch(/workflow_dispatch:\s*\n\s*inputs:/);
      expect(text).toMatch(/\n\s{6}dry_run:\s*\n/);
      expect(text).toMatch(/\n\s{6}trigger:[\s\S]*?options:\s*\n\s*- manual\s*\n\s*- cron/);
      const condition = text.match(/\n\s{4}if: (.+)\n/)?.[1] ?? "";
      expect(condition).toContain(`vars.${flag} == 'true'`);
      expect(condition).toContain("inputs.trigger != 'cron'");
      // No schedule of its own: the Worker is the only automatic trigger.
      expect(text).not.toMatch(/\n\s*schedule:/);
    });
  }
});
