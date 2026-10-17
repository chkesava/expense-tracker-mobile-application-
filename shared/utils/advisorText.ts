/**
 * Display helpers for AI Advisor chat text (SPENDLY-540).
 *
 * Advisor replies are plain strings with `**bold**` markers and inline money
 * such as "₹ 28,736" or "INR 28,736". The chat renders them through these
 * helpers so the markers become bold spans and, in ghost mode, the money is
 * masked. The stored messages are never rewritten.
 */

export type AdvisorTextSegment = { text: string; bold: boolean };

export const ADVISOR_MASK = "••••••";

// A currency marker (₹, $, €, £, Rs or a 3-letter code) followed by a number.
// The marker is required so percentages, counts and dates stay visible.
const MONEY_PATTERN =
  /(?:₹|\$|€|£|\bRs\.?|\b[A-Z]{3}\b)\s?-?\d[\d,]*(?:\.\d+)?/g;

/** Replaces every currency amount in `text` with the ghost mask. */
export function maskAdvisorAmounts(text: string): string {
  return text.replace(MONEY_PATTERN, ADVISOR_MASK);
}

/**
 * Splits `text` on `**` markers into bold/plain segments. An unmatched
 * trailing `**` is kept as literal text rather than bolding the rest.
 */
export function parseAdvisorText(
  text: string,
  options: { ghost?: boolean } = {}
): AdvisorTextSegment[] {
  const source = options.ghost ? maskAdvisorAmounts(text) : text;
  const parts = source.split("**");
  const balanced = parts.length % 2 === 1;
  const segments: AdvisorTextSegment[] = [];

  parts.forEach((part, index) => {
    const isLast = index === parts.length - 1;
    // With an odd marker count the last opening "**" has no partner.
    const bold = index % 2 === 1 && (balanced || !isLast);
    const textPart = !balanced && isLast && index % 2 === 1 ? `**${part}` : part;
    if (textPart.length === 0) return;
    const previous = segments[segments.length - 1];
    if (previous && previous.bold === bold) {
      previous.text += textPart;
    } else {
      segments.push({ text: textPart, bold });
    }
  });

  return segments;
}
