/**
 * SPENDLY-716: entry point of the `spendly-push-trigger` Worker. Its cron
 * triggers (wrangler.toml) start the push reminders job every 15 minutes and,
 * since SPENDLY-729, the daily SIP and bill jobs at 03:00 UTC; the logic is in
 * trigger.ts.
 *
 * Only the default export is allowed here: Workers treat every named export of
 * the entry module as another entry point.
 */
import { dispatchForCron, type FetchLike, type TriggerEnv } from "./trigger";

type ScheduledContext = { waitUntil(promise: Promise<unknown>): void };

export default {
  async scheduled(controller: { cron?: string }, env: TriggerEnv, ctx: ScheduledContext) {
    ctx.waitUntil(dispatchForCron(controller?.cron, env, fetch as unknown as FetchLike, (line) => console.log(line)));
  },
};
