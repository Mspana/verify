type Props = {
  className?: string;
};

// Flat loading placeholder — paper-alt fill, gentle pulse. Never use
// for states that have a dedicated "unavailable" tile (heatmap skipped,
// analysis failed) — that's a distinct treatment per ERRORS.md.
export function Skeleton({ className = "" }: Props) {
  return (
    <div
      aria-hidden
      className={`animate-pulse bg-paper-alt rounded-card ${className}`}
    />
  );
}
