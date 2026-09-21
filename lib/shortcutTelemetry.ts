/**
 * Shortcut usage telemetry.
 *
 * Spendly has no product analytics vendor. This keeps a stable event shape
 * (no amounts or notes) so a future reporter can plug in without changing
 * call sites. Today it is a structured console line only.
 */

export type ShortcutTelemetryEvent = {
  shortcutId: string;
  platform: string;
  launch: "cold" | "warm";
  destination: string;
  result: "success" | "fallback";
};

export function logShortcutEvent(event: ShortcutTelemetryEvent): void {
  console.info("[shortcut]", {
    shortcutId: event.shortcutId,
    platform: event.platform,
    launch: event.launch,
    destination: event.destination,
    result: event.result,
  });
}
