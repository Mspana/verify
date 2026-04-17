import { ImageIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { Scan } from "@verify/shared";

import { formatRelative } from "../../lib/format";
import { VerdictPill } from "../verdict/VerdictPill";

// Stacked-list row: thumbnail left, filename + relative time stacked
// center, verdict pill right. Whole row is a link to the result page.
// Delete button and trash-view variant arrive in step 6.

type Props = {
  scan: Scan;
};

export function ScanRow({ scan }: Props) {
  return (
    <Link
      to={`/scan/${encodeURIComponent(scan.id)}`}
      className="flex items-center gap-3 rounded-card border border-paper-edge bg-paper p-3 transition-colors hover:bg-paper-edge"
    >
      <Thumbnail scan={scan} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{scan.filename}</div>
        <div className="text-xs text-ink-muted">
          {formatRelative(scan.createdAt)}
        </div>
      </div>
      <VerdictPill verdict={scan.verdict} />
    </Link>
  );
}

function Thumbnail({ scan }: { scan: Scan }) {
  if (scan.preview.status === "ready") {
    return (
      <img
        src={scan.preview.url}
        alt=""
        className="h-12 w-12 flex-shrink-0 rounded-btn object-cover bg-paper-edge"
      />
    );
  }
  return (
    <div
      aria-hidden
      className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-btn bg-paper-edge text-ink-muted"
    >
      <ImageIcon className="h-5 w-5" />
    </div>
  );
}
