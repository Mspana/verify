// Tiny helpers for the QUOTA_EXCEEDED screen's countdown. Kept out of
// format.ts because the logic is quota-specific (ticking, rounding to
// a "shortly" floor, reset semantics) and doesn't generalize.

/**
 * Render the time-to-reset as "Resets in 7 hours", "Resets in 23 minutes",
 * or "Resets shortly" for the final minute. Matches the MVP copy agreed
 * during step 7 planning — no absolute-time fallback line.
 */
export function formatResetsIn(
  resetsAtIso: string,
  now: Date = new Date(),
): string {
  const ms = Date.parse(resetsAtIso) - now.getTime();
  if (Number.isNaN(ms) || ms <= 60_000) return "Resets shortly";
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes >= 60) {
    const hours = Math.round(totalMinutes / 60);
    return `Resets in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `Resets in ${totalMinutes} ${totalMinutes === 1 ? "minute" : "minutes"}`;
}
