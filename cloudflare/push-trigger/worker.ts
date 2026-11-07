/**
 * SPENDLY-716: entry point of the `spendly-push-trigger` Worker. Its cron
 * trigger (wrangler.toml) starts the push reminders job every 15 minutes; the
 * logic is in trigger.ts.
 *
 * Only the default export is allowed here: Workers treat every named export of
 * the entry module as another entry point.
 */
import { dispatchPushReminders, type FetchLike, type TriggerEnv } from "./trigger";

type ScheduledContext = { waitUntil(promise: Promise<unknown>): void };

export default {
  async scheduled(_controller: unknown, env: TriggerEnv, ctx: ScheduledContext) {
    ctx.waitUntil(dispatchPushReminders(env, fetch as unknown as FetchLike, (line) => console.log(line)));
  },
};
