/**
 * The push delivery report (SPENDLY-233): sends, delivery, errors and pruned
 * devices from `pushSendLogs` (no tokens are ever in them), plus device counts.
 * Pure; scripts/push-report.ts reads the data and prints this.
 */

export type SendLogSummary = {
  sends: number;
  recipients: number;
  optedOut: number;
  noDevice: number;
  messages: number;
  accepted: number;
  pruned: number;
  errors: Record<string, number>;
  byCategory: Record<string, { sends: number; messages: number; accepted: number }>;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Totals over finished send logs (status "done"); claims still sending are skipped. */
export function summarizeSendLogs(logs: readonly Record<string, unknown>[]): SendLogSummary {
  const out: SendLogSummary = { sends: 0, recipients: 0, optedOut: 0, noDevice: 0, messages: 0, accepted: 0, pruned: 0, errors: {}, byCategory: {} };
  for (const log of logs) {
    if (log.status !== "done") continue;
    out.sends++;
    out.recipients += num(log.recipients);
    out.optedOut += num(log.optedOut);
    out.noDevice += num(log.noDevice);
    out.messages += num(log.messages);
    out.accepted += num(log.accepted);
    out.pruned += num(log.pruned);
    const errors = log.errors && typeof log.errors === "object" ? (log.errors as Record<string, unknown>) : {};
    for (const [code, n] of Object.entries(errors)) out.errors[code] = (out.errors[code] ?? 0) + num(n);
    const receiptErrors = log.receiptErrors && typeof log.receiptErrors === "object" ? (log.receiptErrors as Record<string, unknown>) : {};
    for (const [code, n] of Object.entries(receiptErrors)) out.errors[`receipt:${code}`] = (out.errors[`receipt:${code}`] ?? 0) + num(n);
    const cat = typeof log.category === "string" ? log.category : "unknown";
    const c = (out.byCategory[cat] ??= { sends: 0, messages: 0, accepted: 0 });
    c.sends++;
    c.messages += num(log.messages);
    c.accepted += num(log.accepted);
  }
  return out;
}

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : "—");

export function formatDeliveryReport(input: {
  days: number;
  devices: number;
  activeDevices: number;
  usersWithDevice: number;
  accounts: number;
  logs: SendLogSummary;
}): string {
  const { logs } = input;
  const lines = [
    `## Spendly push delivery, last ${input.days} days`,
    "",
    "| Measure | Value |",
    "|---|---|",
    `| Registered devices | ${input.devices} (${input.activeDevices} seen in the last ${input.days} days) |`,
    `| Accounts with a registered device | ${input.usersWithDevice} of ${input.accounts} (${pct(input.usersWithDevice, input.accounts)}) |`,
    `| Sends (notices) | ${logs.sends} |`,
    `| Messages to devices | ${logs.messages} |`,
    `| Accepted by Expo | ${logs.accepted} (${pct(logs.accepted, logs.messages)}; target ≥ 98%) |`,
    `| Recipients opted out / no device | ${logs.optedOut} / ${logs.noDevice} |`,
    `| Dead devices pruned | ${logs.pruned} |`,
    "",
    "### By category",
    "",
    "| Category | Sends | Messages | Accepted |",
    "|---|---|---|---|",
    ...Object.entries(logs.byCategory)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, c]) => `| ${cat} | ${c.sends} | ${c.messages} | ${c.accepted} (${pct(c.accepted, c.messages)}) |`),
    "",
    "### Errors",
    "",
    ...(Object.keys(logs.errors).length
      ? ["| Code | Count |", "|---|---|", ...Object.entries(logs.errors).sort(([, a], [, b]) => b - a).map(([code, n]) => `| ${code} | ${n} |`)]
      : ["None."]),
  ];
  return lines.join("\n");
}
