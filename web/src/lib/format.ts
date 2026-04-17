// Small formatters used across pages. All pure — no locale fiddling, no
// state. Accept an optional `now` so tests can pin a reference time
// without mocking Date.

/** Relative time ("2 minutes ago", "yesterday", "Apr 17"). */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffSec = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (diffSec < 45) return "Just now";
  if (diffSec < 90) return "1 minute ago";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 45) return `${diffMin} minutes ago`;
  if (diffMin < 90) return "1 hour ago";
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hours ago`;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfThen = new Date(then);
  startOfThen.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfThen.getTime()) / 86400000,
  );
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  // Older than a week: absolute short date.
  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: then.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
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

/**
 * Trash countdown — "Deletes in 22 days", "Deletes today". Hard-coded
 * 30-day window matches worker/src/handlers/scan.ts `MAX_SCAN_AGE_FOR_RESTORE_MS`.
 */
export function formatTrashCountdown(
  deletedAtIso: string,
  now: Date = new Date(),
): string {
  const deleted = new Date(deletedAtIso).getTime();
  const ageMs = now.getTime() - deleted;
  const daysLeft = Math.max(0, Math.ceil((30 * 86400000 - ageMs) / 86400000));
  if (daysLeft <= 0) return "Deletes today";
  if (daysLeft === 1) return "Deletes tomorrow";
  return `Deletes in ${daysLeft} days`;
}
