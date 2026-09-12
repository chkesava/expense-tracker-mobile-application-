/**
 * The clock EPF reasons in — KAN-72.
 *
 * EPF is an Indian scheme: contribution months, financial years and credit
 * windows are all defined in IST. The client was using the device timezone and
 * the Netlify cron was using UTC, so at 02:00 IST on the 1st the two disagreed
 * about which month it was — UTC still read the previous one.
 *
 * Nothing was wrong in practice, because the scheduled run lands at 11:00 IST
 * where both agree. That is precisely what made it dangerous: move the
 * schedule, or run it by hand at the wrong hour, and it silently generates for
 * the wrong month.
 *
 * Both sides now call this, so they agree by construction rather than by
 * intention. Hard-coding IST is the domain's actual timezone, not a shortcut —
 * a user in London still has an Indian EPF account with Indian month
 * boundaries.
 */

/** EPF's statutory timezone. Not the user's, and deliberately not UTC. */
export const EPF_TIMEZONE = "Asia/Kolkata";

/**
 * `YYYY-MM-DD` in IST.
 *
 * `en-CA` formats as ISO, which is why it is used here and in
 * `shared/utils/dates.ts` — not a locale preference.
 */
export function epfTodayKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: EPF_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** `YYYY-MM` in IST — the contribution month. */
export function epfCurrentMonth(now: Date = new Date()): string {
  return epfTodayKey(now).slice(0, 7);
}
