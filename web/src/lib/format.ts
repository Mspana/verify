import i18n from "../i18n";

// Small formatters used across pages. Accept an optional `now` so tests
// can pin a reference time without mocking Date. Locale-aware: strings
// come from i18n, absolute dates use Intl.DateTimeFormat with the
// active language tag.

/** Relative time ("2 minutes ago", "yesterday", "Apr 17"). */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffSec = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  const t = i18n.t.bind(i18n);
  if (diffSec < 45) return t("relative.justNow");
  if (diffSec < 90) return t("relative.minuteAgo", { count: 1 });
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 45) return t("relative.minuteAgo", { count: diffMin });
  if (diffMin < 90) return t("relative.hourAgo", { count: 1 });
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return t("relative.hourAgo", { count: diffHr });
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfThen = new Date(then);
  startOfThen.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfThen.getTime()) / 86400000,
  );
  if (diffDays === 1) return t("relative.yesterday");
  if (diffDays < 7) return t("relative.dayAgo", { count: diffDays });
  // Older than a week: absolute short date in the active locale.
  const locale = i18n.resolvedLanguage ?? i18n.language ?? undefined;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: then.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(then);
}

/** "90%", "90.2%". `n` is a percentage 0–100, not a fraction 0–1. */
export function formatPercent(n: number, decimals = 0): string {
  const clamped = Math.max(0, Math.min(100, n));
  return `${clamped.toFixed(decimals)}%`;
}

/** "2.4 MB", "980 KB", "512 bytes". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
