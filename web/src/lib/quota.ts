import i18n from "../i18n";

// Tiny helpers for the QUOTA_EXCEEDED screen's countdown. Kept out of
// format.ts because the logic is quota-specific (ticking, rounding to
// a "shortly" floor, reset semantics) and doesn't generalize.

/**
 * Render the time-to-reset as "Resets in 7 hours", "Resets in 23 minutes",
 * or "Resets shortly" for the final minute. Localized via i18n so the
 * Chinese variant reads "7 小时后重置" / "即将重置".
 */
export function formatResetsIn(
  resetsAtIso: string,
  now: Date = new Date(),
): string {
  const ms = Date.parse(resetsAtIso) - now.getTime();
  if (Number.isNaN(ms) || ms <= 60_000) return i18n.t("quota.resetsShortly");
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes >= 60) {
    const hours = Math.round(totalMinutes / 60);
    return i18n.t("quota.resetsInHours", { count: hours });
  }
  return i18n.t("quota.resetsInMinutes", { count: totalMinutes });
}
