import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Scan, VerdictLabel } from "@verify/shared";

import { formatPercent, formatRelative } from "../../lib/format";
import { VerdictStatus } from "../verdict/VerdictStatus";

// Stacked-list row matching 01-home.html scan-row-m / scan-row-d.
// Mobile: thumb left, (dot+label on top, filename + relative time below),
//         chevron right.
// Desktop: larger thumb, (filename on top, inline dot+label + "Confidence N%"
//          below), timestamp column, chevron right.
// Confidence only shows when verdict.status === "ready" — pending/failed
// renders just the dot+label.

type Props = {
  scan: Scan;
};

const THUMB_FILL: Record<VerdictLabel, string> = {
  human: "bg-human-fill text-human-ink",
  ai: "bg-ai-fill text-ai-ink",
  uncertain: "bg-uncertain-fill text-uncertain-ink",
};

export function ScanRow({ scan }: Props) {
  return (
    <Link
      to={`/scan/${encodeURIComponent(scan.id)}`}
      className="flex items-center gap-3 rounded-card border border-border bg-white p-2.5 transition-colors hover:bg-paper-alt md:gap-4 md:p-4"
    >
      <Thumbnail scan={scan} />

      <div className="min-w-0 flex-1">
        {/* Desktop: filename on top, verdict+confidence below. */}
        <div className="hidden md:block">
          <div className="truncate text-[13px] font-medium leading-tight">
            {scan.filename}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <VerdictStatus verdict={scan.verdict} />
            {scan.verdict.status === "ready" && (
              <>
                <span className="text-[11px] text-ink/40">·</span>
                <span className="text-[11px] text-ink/55">
                  Confidence {formatPercent(scan.verdict.confidence, 0)}
                </span>
              </>
            )}
          </div>
        </div>
        {/* Mobile: verdict on top, filename · relative time below. */}
        <div className="md:hidden">
          <VerdictStatus verdict={scan.verdict} />
          <p className="mt-0.5 truncate text-[11px] text-ink/55">
            {scan.filename} · {formatRelative(scan.createdAt)}
          </p>
        </div>
      </div>

      {/* Desktop-only timestamp column. */}
      <p className="hidden flex-shrink-0 text-[11px] text-ink/55 md:block">
        {formatRelative(scan.createdAt)}
      </p>

      <ChevronRight
        className="h-4 w-4 flex-shrink-0 text-ink/40"
        aria-hidden
      />
    </Link>
  );
}

function Thumbnail({ scan }: { scan: Scan }) {
  // The mockup shows colored-fill thumbnails ("IMG") because there's no
  // real preview in the doc. In the live app we prefer the actual preview
  // thumbnail when it's ready; otherwise we fall back to a colored slot
  // keyed to the verdict, which preserves the mockup's rhythm while
  // still giving users a sense of the result at a glance.
  const fillCls =
    scan.verdict.status === "ready"
      ? THUMB_FILL[scan.verdict.label]
      : "bg-paper-alt text-ink/55";

  const sizeCls =
    "h-[46px] w-[46px] md:h-[60px] md:w-[60px] flex-shrink-0 rounded-btn";

  if (scan.preview.status === "ready") {
    return (
      <img
        src={scan.preview.url}
        alt=""
        className={`${sizeCls} object-cover bg-paper-alt`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`${sizeCls} flex items-center justify-center text-[10px] font-medium ${fillCls}`}
    >
      IMG
    </div>
  );
}
